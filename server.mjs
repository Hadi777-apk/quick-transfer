import { randomInt, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(rootDir, 'public');

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export async function createApp({
  dataDir = process.env.DATA_DIR || path.join(rootDir, 'data'),
  ttlMs = Number(process.env.SHARE_TTL_MS) || 2 * 60 * 60 * 1000,
} = {}) {
  const uploadDir = path.join(dataDir, 'uploads');
  const sharesPath = path.join(dataDir, 'shares.json');
  const feedbackPath = path.join(dataDir, 'feedback.ndjson');
  await mkdir(uploadDir, { recursive: true });

  let shares = {};
  try {
    shares = JSON.parse(await readFile(sharesPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  async function saveShares() {
    const tempPath = `${sharesPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(shares, null, 2));
    await rename(tempPath, sharesPath);
  }

  async function removeShare(code) {
    const share = shares[code];
    if (!share) return;
    delete shares[code];
    if (share.storedName) {
      await rm(path.join(uploadDir, share.storedName), { force: true });
    }
    if (share.images) {
      await Promise.all(share.images.map((image) => rm(path.join(uploadDir, image.storedName), { force: true })));
    }
    await saveShares();
  }

  async function cleanupExpired() {
    const expiredCodes = Object.entries(shares)
      .filter(([, share]) => share.expiresAt <= Date.now())
      .map(([code]) => code);
    for (const code of expiredCodes) await removeShare(code);
  }

  function makeCode() {
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const code = String(randomInt(10000)).padStart(4, '0');
      if (!shares[code]) return code;
    }
    throw new Error('当前取件码已用完，请稍后重试');
  }

  await cleanupExpired();
  const cleanupTimer = setInterval(() => cleanupExpired().catch(console.error), 60_000);
  cleanupTimer.unref();

  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (_request, _file, callback) => callback(null, randomUUID()),
  });
  const uploadFile = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
  const uploadImages = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 20 } });
  const app = express();

  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set('X-Robots-Tag', 'noindex, nofollow');
    response.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '25kb' }));

  app.post('/api/share/text', async (request, response, next) => {
    try {
      const text = typeof request.body?.text === 'string' ? request.body.text : '';
      if (!text) return response.status(400).json({ error: '请输入文本内容' });
      if (text.length > 20000) return response.status(413).json({ error: '文本超过 20000 字限制' });
      const code = makeCode();
      shares[code] = {
        type: 'text', text, burn: request.body.burn === true,
        expiresAt: Date.now() + ttlMs,
      };
      await saveShares();
      response.json({ code });
    } catch (error) { next(error); }
  });

  app.post('/api/share/file', uploadFile.single('file'), async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ error: '请选择文件' });
      const code = makeCode();
      shares[code] = {
        type: 'file',
        filename: Buffer.from(request.file.originalname, 'latin1').toString('utf8'),
        storedName: request.file.filename,
        mimeType: request.file.mimetype || 'application/octet-stream',
        burn: request.body.burn === 'true',
        expiresAt: Date.now() + ttlMs,
      };
      await saveShares();
      response.json({ code });
    } catch (error) {
      if (request.file) await rm(request.file.path, { force: true });
      next(error);
    }
  });

  app.post('/api/share/images', uploadImages.array('images', 20), async (request, response, next) => {
    try {
      const files = request.files || [];
      if (!files.length) return response.status(400).json({ error: '请选择图片' });
      const invalid = files.some((file) => !file.mimetype.startsWith('image/'));
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      if (invalid || totalSize > 100 * 1024 * 1024) {
        await Promise.all(files.map((file) => rm(file.path, { force: true })));
        return response.status(invalid ? 415 : 413).json({
          error: invalid ? '只能上传图片文件' : '图片总大小超过 100MB 限制',
        });
      }
      const code = makeCode();
      shares[code] = {
        type: 'images',
        images: files.map((file) => ({
          filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
          storedName: file.filename,
          mimeType: file.mimetype,
        })),
        burn: request.body.burn === 'true',
        expiresAt: Date.now() + ttlMs,
      };
      await saveShares();
      response.json({ code });
    } catch (error) {
      await Promise.all((request.files || []).map((file) => rm(file.path, { force: true })));
      next(error);
    }
  });

  app.get('/api/get/:code', async (request, response, next) => {
    try {
      const { code } = request.params;
      const share = shares[code];
      if (!share || share.expiresAt <= Date.now()) {
        if (share) await removeShare(code);
        return response.status(404).json({ error: '取件码不存在或已过期' });
      }
      if (share.type === 'text') {
        response.json({ type: 'text', content: share.text, burn: share.burn });
        if (share.burn) await removeShare(code);
        return;
      }
      if (share.type === 'images') {
        return response.json({
          type: 'images', burn: share.burn,
          images: share.images.map((image, index) => ({
            filename: image.filename,
            downloadUrl: `/api/download/${code}/${index}`,
          })),
        });
      }
      response.json({
        type: 'file', filename: htmlEscape(share.filename), burn: share.burn,
        downloadUrl: `/api/download/${code}`,
      });
    } catch (error) { next(error); }
  });

  app.get('/api/download/:code', async (request, response, next) => {
    const { code } = request.params;
    try {
      const share = shares[code];
      if (!share || share.type !== 'file' || share.expiresAt <= Date.now()) {
        if (share) await removeShare(code);
        return response.status(404).json({ error: '文件不存在或已过期' });
      }
      const asciiName = share.filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
      response.set('Content-Type', share.mimeType);
      response.set('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(share.filename)}`);
      if (share.burn) response.on('finish', () => removeShare(code).catch(console.error));
      createReadStream(path.join(uploadDir, share.storedName)).on('error', next).pipe(response);
    } catch (error) { next(error); }
  });

  app.get('/api/download/:code/:index', async (request, response, next) => {
    const { code } = request.params;
    const index = Number(request.params.index);
    try {
      const share = shares[code];
      const image = share?.type === 'images' ? share.images[index] : null;
      if (!image || share.expiresAt <= Date.now()) {
        if (share?.expiresAt <= Date.now()) await removeShare(code);
        return response.status(404).json({ error: '图片不存在或已过期' });
      }
      const asciiName = image.filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
      response.set('Content-Type', image.mimeType);
      response.set('Content-Disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(image.filename)}`);
      if (share.burn) {
        response.on('finish', () => {
          share.downloadedImages ||= [];
          if (!share.downloadedImages.includes(index)) share.downloadedImages.push(index);
          if (share.downloadedImages.length === share.images.length) removeShare(code).catch(console.error);
        });
      }
      createReadStream(path.join(uploadDir, image.storedName)).on('error', next).pipe(response);
    } catch (error) { next(error); }
  });

  app.post('/api/feedback', async (request, response, next) => {
    try {
      const content = typeof request.body?.content === 'string' ? request.body.content.trim() : '';
      const contact = typeof request.body?.contact === 'string' ? request.body.contact.trim() : '';
      if (!content) return response.status(400).json({ error: '请填写反馈内容' });
      if (content.length > 5000 || contact.length > 500) {
        return response.status(413).json({ error: '反馈内容过长' });
      }
      await appendFile(feedbackPath, `${JSON.stringify({ content, contact, createdAt: new Date().toISOString() })}\n`);
      response.status(201).json({ ok: true });
    } catch (error) { next(error); }
  });

  app.use(express.static(publicDir, { extensions: ['html'] }));

  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return response.status(413).json({ error: '文件超过 100MB 限制' });
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') {
      return response.status(413).json({ error: '一次最多上传 20 张图片' });
    }
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({ error: '请求内容过大' });
    }
    console.error(error);
    response.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`P2P Quick Transfer: http://localhost:${port}`));
}
