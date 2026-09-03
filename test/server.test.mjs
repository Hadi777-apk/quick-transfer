import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server.mjs';

test('public site and sharing flows work end to end', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), '123share-rebuild-'));
  const app = await createApp({ dataDir, ttlMs: 2000 });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
    await rm(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(await home.text(), /P2P快传/);

  const sharedText = await fetch(`${base}/api/share/text`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '<b>原样文本</b>', burn: false }),
  });
  assert.equal(sharedText.status, 200);
  const { code: textCode } = await sharedText.json();
  assert.match(textCode, /^\d{4}$/);
  const textResult = await (await fetch(`${base}/api/get/${textCode}`)).json();
  assert.deepEqual(textResult, { type: 'text', content: '<b>原样文本</b>', burn: false });
  assert.equal((await fetch(`${base}/api/get/${textCode}`)).status, 200);

  const burnShare = await fetch(`${base}/api/share/text`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '阅后即焚', burn: true }),
  });
  const { code: burnCode } = await burnShare.json();
  assert.equal((await fetch(`${base}/api/get/${burnCode}`)).status, 200);
  assert.equal((await fetch(`${base}/api/get/${burnCode}`)).status, 404);

  const form = new FormData();
  form.append('file', new Blob(['file-body'], { type: 'text/plain' }), 'sample.txt');
  form.append('burn', 'true');
  const fileShare = await fetch(`${base}/api/share/file`, { method: 'POST', body: form });
  assert.equal(fileShare.status, 200);
  const { code: fileCode } = await fileShare.json();
  const fileResult = await (await fetch(`${base}/api/get/${fileCode}`)).json();
  assert.equal(fileResult.type, 'file');
  assert.equal(fileResult.filename, 'sample.txt');
  const download = await fetch(`${base}${fileResult.downloadUrl}`);
  assert.equal(await download.text(), 'file-body');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await fetch(`${base}/api/get/${fileCode}`)).status, 404);

  const images = new FormData();
  images.append('images', new Blob(['image-one'], { type: 'image/png' }), 'one.png');
  images.append('images', new Blob(['image-two'], { type: 'image/jpeg' }), 'two.jpg');
  images.append('burn', 'true');
  const imageShare = await fetch(`${base}/api/share/images`, { method: 'POST', body: images });
  assert.equal(imageShare.status, 200);
  const { code: imageCode } = await imageShare.json();
  const imageResult = await (await fetch(`${base}/api/get/${imageCode}`)).json();
  assert.equal(imageResult.type, 'images');
  assert.equal(imageResult.images.length, 2);
  assert.equal(await (await fetch(`${base}${imageResult.images[0].downloadUrl}`)).text(), 'image-one');
  assert.equal((await fetch(`${base}/api/get/${imageCode}`)).status, 200);
  assert.equal(await (await fetch(`${base}${imageResult.images[1].downloadUrl}`)).text(), 'image-two');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await fetch(`${base}/api/get/${imageCode}`)).status, 404);

  const feedback = await fetch(`${base}/api/feedback`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: '测试反馈', contact: 'test@example.com' }),
  });
  assert.equal(feedback.status, 201);
  assert.match(await readFile(path.join(dataDir, 'feedback.ndjson'), 'utf8'), /测试反馈/);
});

test('expired shares are rejected and removed', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), '123share-expiry-'));
  const app = await createApp({ dataDir, ttlMs: 10 });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
    await rm(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const share = await fetch(`${base}/api/share/text`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '短期内容', burn: false }),
  });
  const { code } = await share.json();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await fetch(`${base}/api/get/${code}`)).status, 404);
});
