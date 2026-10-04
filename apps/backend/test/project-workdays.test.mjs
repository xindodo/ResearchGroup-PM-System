import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';
test('task spent workdays validate half-day increments, preserve omitted values and respect editing permissions',async t=>{
 const password='spent-days-password-123',app=createApplication({dir:mkdtempSync(join(tmpdir(),'pm-workdays-')),password});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}/api`;
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});assert.equal(r.status,200);return {...r.value,cookie:r.cookie}}
 const admin=await login('admin');await call('/users',admin,'POST',{account:'student',name:'工日学生',role:'学生',password});const student=await login('student');await call('/users',admin,'POST',{account:'other',name:'其他学生',role:'学生',password});const other=await login('other');
 let p=(await call('/pm/projects',admin,'POST',{title:'工日项目',start:'2026-01-01',end:'2026-12-31',members:[{userId:student.user.id,role:'项目成员'},{userId:other.user.id,role:'项目成员'}]})).value;const path=`/pm/projects/${p.id}/tasks`,draft={title:'工日任务',assigneeId:student.user.id,start:'2026-10-01',due:'2026-10-31',state:'进行中',progress:20};
 for(const spentDays of [0,-0.5,0.25,10.5,'1.0',true])assert.equal((await call(path,admin,'POST',{...draft,spentDays})).status,400);
 p=(await call(path,admin,'POST',draft)).value;let task=p.tasks[0];assert.equal(task.spentDays,null);
 const update=async(actor,data)=>call(path+'/'+task.id,actor,'PUT',{revision:task.revision,state:task.state,progress:task.progress,...data});
 for(const spentDays of [0.5,1,10]){const r=await update(student,{spentDays});assert.equal(r.status,200);task=r.value.tasks[0];assert.equal(task.spentDays,spentDays)}
 assert.equal((await update(other,{completed:true})).status,403);
 assert.equal((await update(student,{completed:'true'})).status,400);
 let completed=await update(admin,{completed:true});assert.equal(completed.status,200);task=completed.value.tasks[0];assert.equal(task.state,'已完成');assert.equal(task.progress,100);assert.equal(task.spentDays,10);
 completed=await update(student,{completed:false});assert.equal(completed.status,200);task=completed.value.tasks[0];assert.equal(task.state,'进行中');assert.equal(task.progress,20);assert.equal(task.spentDays,10);
 assert.equal((await update(other,{spentDays:2})).status,403);assert.equal((await update(student,{spentDays:1.2})).status,400);
 let r=await update(student,{description:'保留工日'});assert.equal(r.status,200);task=r.value.tasks[0];assert.equal(task.spentDays,10);
 r=await update(student,{spentDays:null});assert.equal(r.status,200);task=r.value.tasks[0];assert.equal(task.spentDays,null);
 assert.equal((await update(student,{revision:1,spentDays:2})).status,409);
});
