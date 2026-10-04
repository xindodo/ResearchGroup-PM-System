import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';
test('task capacity enforces owner/admin permissions, validation, conflicts and persistence',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-capacity-')),password='capacity-password-123';let app=createApplication({dir,password});let base;
 async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`};await start();t.after(()=>app.close());
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});return {...r.value,cookie:r.cookie}}
 let admin=await login('admin');for(const [account,role] of [['student','学生'],['other','学生'],['guest','只读访客']])assert.equal((await call('/users',admin,'POST',{account,name:account,password,role})).status,201);
 const student=await login('student'),other=await login('other'),guest=await login('guest');const path='/pm/task-capacity/'+student.user.id;
 assert.equal((await call('/pm/task-capacity',null)).status,401);assert.deepEqual((await call('/pm/task-capacity',admin)).value,[]);
 assert.equal((await call(path,other,'PUT',{dailyLimit:3,revision:0})).status,403);assert.equal((await call('/pm/task-capacity/'+guest.user.id,guest,'PUT',{dailyLimit:3,revision:0})).status,403);
 for(const dailyLimit of [0,-1,1.5,1001,'5',null])assert.equal((await call(path,admin,'PUT',{dailyLimit,revision:0})).status,400);
 assert.equal((await call('/pm/task-capacity/not-found',admin,'PUT',{dailyLimit:5,revision:0})).status,400);
 let saved=await call(path,student,'PUT',{dailyLimit:3,revision:0});assert.equal(saved.status,200);assert.deepEqual(saved.value,[{userId:student.user.id,dailyLimit:3,revision:1}]);
 assert.equal((await call(path,admin,'PUT',{dailyLimit:4,revision:0})).status,409);saved=await call(path,admin,'PUT',{dailyLimit:4,revision:1});assert.equal(saved.value[0].revision,2);
 await app.close();app=createApplication({dir,password});await start();admin=await login('admin');assert.deepEqual((await call('/pm/task-capacity',admin)).value,[{userId:student.user.id,dailyLimit:4,revision:2}]);
});
