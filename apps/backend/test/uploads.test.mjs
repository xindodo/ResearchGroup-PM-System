import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { uploadFile, saveFiles, MAX_FILE_BYTES } from '../src/files.mjs';

test('records and personnel can save more than the previous attachment and image limits', t => {
  const dir=mkdtempSync(join(tmpdir(),'jtgc-unlimited-files-'));const db=openDatabase(dir);
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true})});
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=';
  for (const entity of ['record','person']) {
    for (const images of [false,true]) {
      const files=Array.from({length:20},(_,i)=>({name:`file-${i}`,data:images?`data:image/png;base64,${png}`:'data:text/plain;base64,dGVzdA=='}));
      const saved=saveFiles(db,dir,entity,'target',files,images);
      assert.equal(saved.length,20);
      assert.equal(saveFiles(db,dir,entity,'target',saved,images).length,20);
    }
  }
  assert.throws(()=>saveFiles(db,dir,'record','target',{}),/格式/);
});

test('streaming accepts exactly 500MB, rejects overflow, and only uploader can attach', async t => {
  const dir=mkdtempSync(join(tmpdir(),'jtgc-upload-test-'));const db=openDatabase(dir);
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true})});
  const chunk=Buffer.alloc(1024*1024,1);
  function request(count,extra=0,headers={}){const r=Readable.from((async function*(){for(let i=0;i<count;i++)yield chunk;if(extra)yield Buffer.alloc(extra)})());r.headers=headers;return r}
  const result=await uploadFile(request(500),db,dir,'owner','large.bin');
  assert.equal(result.size,MAX_FILE_BYTES);
  assert.throws(()=>saveFiles(db,dir,'record','one',[result],false,'other'),/不属于/);
  assert.equal(saveFiles(db,dir,'record','one',[result],false,'owner')[0].size,MAX_FILE_BYTES);
  assert.throws(()=>saveFiles(db,dir,'record','two',[result],false,'owner'),/不属于/);
  await assert.rejects(uploadFile(request(500,1),db,dir,'owner','too-large.bin'),/500MB/);
  await assert.rejects(uploadFile(request(0,0,{'content-length':String(MAX_FILE_BYTES+1)}),db,dir,'owner','too-large.bin'),/500MB/);
  await assert.rejects(uploadFile(request(0),db,dir,'owner','empty.bin'),/空文件/);
  await assert.rejects(uploadFile(request(1),db,dir,'owner','fake.png',true),/仅支持/);
  assert.equal(readdirSync(join(dir,'uploads')).some(n=>n.startsWith('.upload-')),false);
});
