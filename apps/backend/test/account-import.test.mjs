import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';

test('account batch import previews, rejects whole invalid batch, and preserves existing identities',async t=>{
  const password='batch-test-password-123',app=createApplication({dir:mkdtempSync(join(tmpdir(),'pm-account-import-')),password});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}/api`;
  async function call(path,method='GET',data,actor){const r=await fetch(base+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data?JSON.stringify(data):undefined});return{status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
  const login=await call('/login','POST',{account:'admin',password});const admin={...login.value,cookie:login.cookie};
  const rows=[{account:'batch.one@example.cc',name:'批量甲',role:'导师',password},{account:'batch.two@example.cc',name:'批量乙',role:'',password}];
  assert.equal((await call('/users/import','POST',{users:rows})).status,401);
  const before=(await call('/users','GET',undefined,admin)).value;
  const preview=await call('/users/import','POST',{users:rows,dryRun:true},admin);
  assert.equal(preview.status,200);assert.equal(preview.value.count,2);assert.deepEqual(preview.value.errors,[]);
  assert.deepEqual((await call('/users','GET',undefined,admin)).value,before);
  const invalid=[rows[0],{...rows[1],account:'BATCH.ONE@example.cc'},{...rows[1],account:'ADMIN'},{...rows[1],name:'批量甲'},{...rows[1],role:'不存在'},{...rows[1],password:'short'}];
  const rejected=await call('/users/import','POST',{users:invalid},admin);
  assert.equal(rejected.value.created,0);assert.deepEqual(rejected.value.errors.map(e=>e.row),[3,4,5,6,7]);
  assert.deepEqual((await call('/users','GET',undefined,admin)).value,before);
  const created=await call('/users/import','POST',{users:rows},admin);assert.equal(created.status,201);assert.equal(created.value.created,2);
  assert.equal(created.value.users[1].role,'导师');assert.equal(created.value.users[0].password,undefined);
  const teacher=await call('/login','POST',{account:rows[0].account,password});assert.equal(teacher.status,200);
  assert.equal((await call('/users/import','POST',{users:rows},{...teacher.value,cookie:teacher.cookie})).status,403);
  assert.equal((await call('/users/import','POST',{users:rows},admin)).value.created,0);
  assert.equal((await call('/users','GET',undefined,admin)).value.length,3);
  const audit=(await call('/audit','GET',undefined,admin)).value.rows;
  assert.equal(audit.filter(r=>r.action==='批量创建账号').length,2);assert.ok(!JSON.stringify(audit).includes(password));
  assert.equal((await call('/users/import','POST',{users:[]},admin)).status,400);
  assert.equal((await call('/users/import','POST',{users:Array(501).fill(rows[0])},admin)).status,400);
});
