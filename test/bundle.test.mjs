import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server.mjs';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'unified-share-'));
  const app = await createApp({ dataDir, ...options });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, dataDir };
}

function form(text = '', burn = false, files = []) {
  const body = new FormData();
  body.append('text', text);
  body.append('burn', String(burn));
  for (const [name, type, content] of files) body.append('attachments', new Blob([content], { type }), name);
  return body;
}

async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('State was not persisted');
}

test('one code contains text, image and arbitrary files and survives restart', async t => {
  const { base, dataDir } = await fixture(t);
  const text = '<b>中文说明</b>\nSecond line';
  const response = await fetch(`${base}/api/share/bundle`, { method: 'POST', body: form(text, false, [
    ['截图.png', 'image/png', 'image-body'], ['报告.txt', 'text/plain', 'file-body'], ['page.svg', 'image/svg+xml', '<svg/>'],
  ]) });
  assert.equal(response.status, 200);
  const { code } = await response.json();
  const get = async origin => (await fetch(`${origin}/api/get/${code}`)).json();
  const data = await get(base);
  assert.equal(data.type, 'bundle');
  assert.equal(data.content, text);
  assert.equal(data.attachments.length, 3);
  assert.equal(data.attachments[0].filename, '截图.png');
  assert.equal(data.attachments[0].size, 10);
  assert.ok(data.attachments[0].previewUrl);
  assert.equal(data.attachments[1].previewUrl, null);
  assert.equal(data.attachments[2].previewUrl, null);
  assert.equal((await fetch(`${base}/api/download/${code}`)).status, 404);
  assert.equal((await fetch(`${base}/api/get/${code}`)).status, 200);
  const downloads = await Promise.all(data.attachments.map(async file => {
    const response = await fetch(base + file.downloadUrl);
    assert.match(response.headers.get('content-disposition'), /^attachment;/);
    return response.text();
  }));
  assert.deepEqual(downloads, ['image-body', 'file-body', '<svg/>']);
  const restarted = (await createApp({ dataDir })).listen(0);
  await once(restarted, 'listening');
  try {
    assert.deepEqual(await get(`http://127.0.0.1:${restarted.address().port}`), data);
  } finally { await new Promise(resolve => restarted.close(resolve)); }
});

test('burn waits for all downloads, ignores previews and HEAD, persists partial progress', async t => {
  const { base, dataDir } = await fixture(t);
  const response = await fetch(`${base}/api/share/bundle`, { method: 'POST', body: form('说明', true, [
    ['a.png', 'image/png', 'a'], ['b.bin', 'application/octet-stream', 'b'],
  ]) });
  const { code } = await response.json();
  const data = await (await fetch(`${base}/api/get/${code}`)).json();
  await (await fetch(base + data.attachments[0].previewUrl)).text();
  await fetch(base + data.attachments[1].downloadUrl, { method: 'HEAD' });
  assert.equal((await fetch(base + data.attachments[1].downloadUrl + '?preview=1')).status, 400);
  assert.equal((await fetch(`${base}/api/get/${code}`)).status, 200);
  await (await fetch(base + data.attachments[0].downloadUrl)).text();
  await waitFor(async () => JSON.parse(await readFile(path.join(dataDir, 'shares.json'), 'utf8'))[code]?.downloadedAttachments?.length === 1);
  assert.equal((await fetch(`${base}/api/get/${code}`)).status, 200);
  await (await fetch(base + data.attachments[1].downloadUrl)).text();
  await waitFor(async () => !JSON.parse(await readFile(path.join(dataDir, 'shares.json'), 'utf8'))[code]);
  assert.equal((await fetch(`${base}/api/get/${code}`)).status, 404);
  assert.deepEqual(await readdir(path.join(dataDir, 'uploads')), []);
});

test('text only and attachments only are supported; validation cleans rejected uploads', async t => {
  const { base, dataDir } = await fixture(t);
  const post = body => fetch(`${base}/api/share/bundle`, {method:'POST', body});
  const text = '汉'.repeat(20000);
  const { code } = await (await post(form(text, true))).json();
  assert.equal((await (await fetch(`${base}/api/get/${code}`)).json()).content, text);
  assert.equal((await fetch(`${base}/api/get/${code}`)).status, 404);
  assert.equal((await post(form())).status, 400);
  assert.equal((await post(form('x'.repeat(20001), false, [['bad.txt', 'text/plain', 'bad']]))).status, 413);
  assert.deepEqual(await readdir(path.join(dataDir, 'uploads')), []);
  const files = Array.from({length:21}, (_,i) => [`${i}.txt`, 'text/plain', String(i)]);
  assert.equal((await post(form('', false, files))).status, 413);
  assert.deepEqual(await readdir(path.join(dataDir, 'uploads')), []);
  const { code: filesCode } = await (await post(form('', true, files.slice(0,20)))).json();
  const data = await (await fetch(`${base}/api/get/${filesCode}`)).json();
  assert.equal(data.attachments.length, 20);
  await Promise.all(data.attachments.map(async file => (await fetch(base + file.downloadUrl)).text()));
  await waitFor(async () => !JSON.parse(await readFile(path.join(dataDir, 'shares.json'), 'utf8'))[filesCode]);
  assert.equal((await fetch(`${base}/api/get/${filesCode}`)).status, 404);
});

test('combined attachment size is limited to 200MB and rejected bytes are removed', async t => {
  const { base, dataDir } = await fixture(t);
  const bytes = new Uint8Array(101 * 1024 * 1024);
  const response = await fetch(`${base}/api/share/bundle`, {method:'POST', body:form('', false, [
    ['one.bin', 'application/octet-stream', bytes], ['two.bin', 'application/octet-stream', bytes],
  ])});
  assert.equal(response.status, 413);
  assert.deepEqual(await readdir(path.join(dataDir, 'uploads')), []);
});
