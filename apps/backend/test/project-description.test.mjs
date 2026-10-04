import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';
test('project record descriptions enforce ownership, conflicts, project boundaries and preserve scheduling',async t=>{
 const password='timeline-test-password',app=createApplication({dir:mkdtempSync(join(tmpdir(),'pm-timeline-')),password});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return{status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});return{...r.value,cookie:r.cookie}}
 const admin=await login('admin'),uid=admin.user.id;
 const teacher=(await call('/users',admin,'POST',{account:'timeline-member',name:'记录成员',role:'导师',password})).value,regular=await login(teacher.account);
 let p=(await call('/pm/projects',admin,'POST',{title:'记录项目',start:'2026-10-01',end:'2026-12-31',members:[{userId:teacher.id,role:'项目成员'}]})).value;
 p=(await call(`/pm/projects/${p.id}/tasks`,admin,'POST',{title:'记录任务',assigneeId:teacher.id,start:'2026-10-01',due:'2026-10-30',state:'进行中',progress:30})).value;
 p=(await call(`/pm/projects/${p.id}/milestones`,admin,'POST',{title:'记录节点',ownerId:uid,planned:'2026-10-30',taskIds:[p.tasks[0].id],state:'进行中',progress:30})).value;
 p=(await call(`/pm/projects/${p.id}/time-entries`,regular,'POST',{taskId:p.tasks[0].id,userId:teacher.id,start:'2026-10-01T09:00',end:'2026-10-01T10:00',note:'原记录',tags:[]})).value;
 const original=p.tasks[0],path=`/pm/projects/${p.id}/entries/tasks/${original.id}/description`;
 let result=await call(path,regular,'PUT',{revision:original.revision,description:'任务说明'});assert.equal(result.status,200);p=result.value;assert.equal(p.tasks[0].description,'任务说明');assert.equal(p.tasks[0].progress,original.progress);
 assert.equal((await call(path,regular,'PUT',{revision:original.revision,description:'过期覆盖'})).status,409);
 p=(await call(`/pm/projects/${p.id}/tasks/${original.id}`,admin,'PUT',{...p.tasks[0],title:'任务新名称'})).value;assert.equal(p.tasks[0].description,'任务说明');
 const milestone=p.milestones[0];assert.equal((await call(`/pm/projects/${p.id}/entries/milestones/${milestone.id}/description`,regular,'PUT',{revision:milestone.revision,description:'越权'})).status,403);
 p=(await call(`/pm/projects/${p.id}/entries/milestones/${milestone.id}/description`,admin,'PUT',{revision:milestone.revision,description:'节点说明'})).value;assert.equal(p.milestones[0].description,'节点说明');assert.equal(p.milestones[0].planned,milestone.planned);
 const entry=p.timeEntries[0];p=(await call(`/pm/projects/${p.id}/entries/time-entries/${entry.id}/description`,regular,'PUT',{revision:entry.revision,description:'工时新说明'})).value;assert.equal(p.timeEntries[0].note,'工时新说明');assert.equal(p.timeEntries[0].durationMinutes,60);
 const other=(await call('/pm/projects',admin,'POST',{title:'其他项目'})).value;assert.equal((await call(`/pm/projects/${other.id}/entries/tasks/${original.id}/description`,admin,'PUT',{revision:1,description:'跨项目'})).status,404);
 assert.deepEqual(app.db.prepare('PRAGMA foreign_key_check').all(),[]);
});
