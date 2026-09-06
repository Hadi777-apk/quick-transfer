import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server.mjs';

test('200MB chunked upload verifies bytes, rejects excess, and supports retries and cleanup', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'chunk-test-'));
  const server = (await createApp({dataDir})).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, {recursive:true,force:true,maxRetries:10,retryDelay:20});
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const size = 200 * 1024 * 1024;
  const start = files => fetch(base + '/api/uploads', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text:'汉'.repeat(20000),burn:true,files}),
  });
  assert.equal((await start([{name:'too-big.bin',type:'',size:size+1}])).status, 413);
  assert.equal((await start(Array.from({length:21},()=>({name:'a',type:'',size:1})))).status, 413);
  const response = await start([{name:'200MB.bin',type:'application/octet-stream',size}]);
  assert.equal(response.status,200);
  const {id,chunkBytes} = await response.json();
  assert.ok(chunkBytes < 100 * 1024 * 1024);
  const put = (index,body) => fetch(`${base}/api/uploads/${id}/0/${index}`, {
    method:'PUT',headers:{'Content-Type':'application/octet-stream'},body,
  });
  assert.equal((await put(0, new Uint8Array(1))).status,400);
  assert.equal((await fetch(`${base}/api/uploads/${id}/complete`,{method:'POST'})).status,409);
  const expected = createHash('sha256');
  for(let offset=0,index=0;offset<size;offset+=chunkBytes,index++) {
    const body=Buffer.alloc(Math.min(chunkBytes,size-offset),index);
    expected.update(body);
    assert.equal((await put(index,body)).status,200);
    if(index===0) assert.equal((await put(index,body)).status,200);
  }
  const complete = await fetch(`${base}/api/uploads/${id}/complete`,{method:'POST'});
  assert.equal(complete.status,200);
  const {code}=await complete.json();
  assert.deepEqual(await(await fetch(`${base}/api/uploads/${id}/complete`,{method:'POST'})).json(),{code});
  assert.deepEqual(await readdir(path.join(dataDir,'upload-sessions',id)),['manifest.json']);
  const data=await(await fetch(`${base}/api/get/${code}`)).json();
  assert.equal(data.content.length,20000);
  assert.equal(data.attachments[0].size,size);
  const download=await fetch(base+data.attachments[0].downloadUrl);
  const actual=createHash('sha256');
  let downloaded=0;
  for await(const part of download.body) {actual.update(part);downloaded+=part.length;}
  assert.equal(downloaded,size);
  assert.equal(actual.digest('hex'),expected.digest('hex'));
  assert.equal((await fetch(`${base}/api/get/${code}`)).status,404);
  const {id:cancelled}=await(await start([{name:'partial',type:'',size:1}])).json();
  await fetch(`${base}/api/uploads/${cancelled}`,{method:'DELETE'});
  assert.equal((await fetch(`${base}/api/uploads/${cancelled}/complete`,{method:'POST'})).status,404);
});
