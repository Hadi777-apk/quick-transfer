import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';

const CHUNK_BYTES = 16 * 1024 * 1024;
const SESSION_TTL = 2 * 60 * 60 * 1000;

export async function installChunkUploads(app, { dataDir, maxBytes, createShare }) {
  const sessionRoot = path.join(dataDir, 'upload-sessions');
  const uploadDir = path.join(dataDir, 'uploads');
  await mkdir(sessionRoot, { recursive: true });
  const busy = new Set();
  const sessionPath = id => /^[0-9a-f-]{36}$/.test(id) ? path.join(sessionRoot, id) : null;

  async function load(id) {
    const dir = sessionPath(id);
    if (!dir) return null;
    try {
      const session = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
      if (session.expiresAt <= Date.now()) {
        await rm(dir, { recursive: true, force: true });
        return null;
      }
      return { dir, ...session };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function cleanup() {
    for (const id of await readdir(sessionRoot)) {
      if (busy.has(id)) continue;
      const session = await load(id);
      const dir = sessionPath(id);
      if (!session && dir) {
        const info = await stat(dir).catch(error => { if (error.code !== 'ENOENT') throw error; });
        if (info && info.mtimeMs + SESSION_TTL <= Date.now()) await rm(dir, { recursive: true, force: true });
      }
    }
  }
  await cleanup();
  const timer = setInterval(() => cleanup().catch(console.error), 60_000);
  timer.unref();

  app.post('/api/uploads', express.json({ limit: '100kb' }), async (request, response, next) => {
    let dir;
    try {
      const { text = '', files, burn = false } = request.body || {};
      if (typeof text !== 'string' || text.length > 20000 || typeof burn !== 'boolean' ||
          !Array.isArray(files) || !files.length || files.length > 20 ||
          files.some(file => !file || typeof file.name !== 'string' || !file.name || file.name.length > 255 ||
            !Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxBytes ||
            typeof file.type !== 'string' || file.type.length > 100 || (file.type && !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(file.type))) ||
          files.reduce((sum, file) => sum + file.size, 0) > maxBytes) {
        return response.status(413).json({ error: '文字最多 20000 字，附件最多 20 个、总计 200MB' });
      }
      const id = randomUUID();
      dir = sessionPath(id);
      await mkdir(dir);
      await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
        text, burn, files: files.map(file => ({ name: file.name, size: file.size, type: file.type || 'application/octet-stream' })),
        expiresAt: Date.now() + SESSION_TTL,
      }));
      response.json({ id, chunkBytes: CHUNK_BYTES });
    } catch (error) {
      if (dir) await rm(dir, { recursive: true, force: true });
      next(error);
    }
  });

  app.put('/api/uploads/:id/:fileIndex/:chunkIndex', express.raw({ type: 'application/octet-stream', limit: CHUNK_BYTES }), async (request, response, next) => {
    const { id } = request.params;
    if (busy.has(id)) return response.status(409).json({ error: '上传正在处理中，请稍后重试' });
    busy.add(id);
    let temp;
    try {
      const session = await load(id);
      if (!session) return response.status(404).json({ error: '上传已过期，请重新发送' });
      if (session.code) return response.status(409).json({ error: '上传已经完成' });
      const index = Number(request.params.fileIndex);
      const chunk = Number(request.params.chunkIndex);
      const file = Number.isInteger(index) && index >= 0 ? session.files[index] : null;
      if (!file || !Number.isInteger(chunk) || chunk < 0 || chunk >= Math.ceil(file.size / CHUNK_BYTES) ||
          !Buffer.isBuffer(request.body) || request.body.length !== Math.min(CHUNK_BYTES, file.size - chunk * CHUNK_BYTES)) {
        return response.status(400).json({ error: '上传分块大小或序号不正确' });
      }
      temp = path.join(session.dir, `${index}-${chunk}.${randomUUID()}.tmp`);
      await writeFile(temp, request.body);
      await rename(temp, path.join(session.dir, `${index}-${chunk}.part`));
      response.json({ ok: true });
    } catch (error) {
      if (temp) await rm(temp, { force: true });
      next(error);
    } finally { busy.delete(id); }
  });

  app.post('/api/uploads/:id/complete', async (request, response, next) => {
    const { id } = request.params;
    if (busy.has(id)) return response.status(409).json({ error: '上传正在处理中，请稍后重试' });
    busy.add(id);
    const assembled = [];
    let committed = false;
    try {
      const session = await load(id);
      if (!session) return response.status(404).json({ error: '上传已过期，请重新发送' });
      if (session.code) return response.json({ code: session.code });
      for (let i = 0; i < session.files.length; i++) {
        const file = session.files[i];
        for (let chunk = 0; chunk < Math.ceil(file.size / CHUNK_BYTES); chunk++) {
          const part = path.join(session.dir, `${i}-${chunk}.part`);
          const info = await stat(part).catch(error => { if (error.code !== 'ENOENT') throw error; });
          if (!info || info.size !== Math.min(CHUNK_BYTES, file.size - chunk * CHUNK_BYTES)) {
            return response.status(409).json({ error: '文件尚未上传完整，请重新发送' });
          }
        }
      }
      for (let i = 0; i < session.files.length; i++) {
        const file = session.files[i];
        const storedName = randomUUID();
        const output = path.join(uploadDir, storedName);
        assembled.push({ filename: file.name, storedName, mimeType: file.type, size: file.size });
        await writeFile(output, Buffer.alloc(0));
        for (let chunk = 0; chunk < Math.ceil(file.size / CHUNK_BYTES); chunk++) {
          await appendFile(output, await readFile(path.join(session.dir, `${i}-${chunk}.part`)));
        }
      }
      const code = await createShare(session.text, session.burn, assembled);
      committed = true;
      const manifest = { text: '', burn: session.burn, files: [], expiresAt: session.expiresAt, code };
      await writeFile(path.join(session.dir, 'manifest.json'), JSON.stringify(manifest));
      for (const name of await readdir(session.dir)) {
        if (name !== 'manifest.json') await rm(path.join(session.dir, name), { force: true });
      }
      response.json({ code });
    } catch (error) {
      if (!committed) await Promise.all(assembled.map(file => rm(path.join(uploadDir, file.storedName), { force: true })));
      next(error);
    } finally { busy.delete(id); }
  });

  app.delete('/api/uploads/:id', async (request, response, next) => {
    const { id } = request.params;
    if (busy.has(id)) return response.status(409).json({ error: '上传正在处理中' });
    busy.add(id);
    try {
      const dir = sessionPath(id);
      if (dir) await rm(dir, { recursive: true, force: true });
      response.json({ ok: true });
    } catch (error) { next(error); }
    finally { busy.delete(id); }
  });
}
