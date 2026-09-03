import assert from 'node:assert/strict';

const base = (process.argv[2] || 'http://127.0.0.1:3300').replace(/\/$/, '');

const home = await fetch(base);
assert.equal(home.status, 200);
assert.match(await home.text(), /P2P快传/);

const textShare = await fetch(`${base}/api/share/text`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'production-smoke-test', burn: true }),
});
assert.equal(textShare.status, 200);
const { code: textCode } = await textShare.json();
assert.equal((await fetch(`${base}/api/get/${textCode}`)).status, 200);
assert.equal((await fetch(`${base}/api/get/${textCode}`)).status, 404);

const form = new FormData();
form.append('images', new Blob(['image-one'], { type: 'image/png' }), 'one.png');
form.append('images', new Blob(['image-two'], { type: 'image/png' }), 'two.png');
form.append('burn', 'true');
const imageShare = await fetch(`${base}/api/share/images`, { method: 'POST', body: form });
assert.equal(imageShare.status, 200);
const { code: imageCode } = await imageShare.json();
const imageResult = await (await fetch(`${base}/api/get/${imageCode}`)).json();
assert.equal(imageResult.images.length, 2);
for (const image of imageResult.images) {
  assert.equal((await fetch(`${base}${image.downloadUrl}`)).status, 200);
}
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal((await fetch(`${base}/api/get/${imageCode}`)).status, 404);

console.log(JSON.stringify({ home: 200, textBurn: 404, images: 2, imageBurn: 404 }));
