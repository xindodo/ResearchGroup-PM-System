import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server.mjs';
test('guest reads published content, cannot write any business route or read pending content', async t=>{
  const app=createApplication({dir:mkdtempSync(join(tmpdir(),'jtgc-guest-')),password:'test-password-123'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}/api`;
  async function call(path,method='GET',data,actor){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return{status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
  const login=async(account)=>{const r=await call('/login','POST',{account,password:'test-password-123'});return {...r.value,cookie:r.cookie}};
  const admin=await login('admin');
  const user=(await call('/users','POST',{account:'guest',name:'guest',role:'只读访客',password:'test-password-123'},admin)).value;
  const guest=await login('guest');assert.equal(guest.user.role,'只读访客');
  const record=(await call('/records','POST',{kind:'news',category:'教务通知',title:'公开'},admin)).value;
  assert.equal((await call(`/records/${record.id}`,'GET',undefined,guest)).status,200);
  app.db.prepare("UPDATE records SET state='pending',creator=? WHERE id=?").run(user.id,record.id);
  assert.equal((await call(`/records/${record.id}`,'GET',undefined,guest)).status,404);
  assert.equal((await call('/bootstrap','GET',undefined,guest)).value.records.length,0);
  for(const[method,path]of [['POST','/records'],['PUT',`/records/${record.id}`],['DELETE',`/records/${record.id}`],['POST','/import'],['POST','/uploads'],['PUT',`/users/${user.id}/profile`],['POST','/dictionaries'],['POST','/users'],['POST',`/records/${record.id}/review`]]) assert.equal((await call(path,method,{},guest)).status,403,path);
  for(const path of ['/users','/audit','/trash'])assert.equal((await call(path,'GET',undefined,guest)).status,403,path);
  assert.equal((await call('/logout','POST',{},guest)).status,200);
});
