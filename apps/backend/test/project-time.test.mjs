import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server.mjs';
test('task time records validate timestamps, permissions, overlaps, versions, history and persistence',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'jtgc-time-')),password='time-password-123';let app=createApplication({dir,password}),base;
 async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`;}
 await start();t.after(()=>app.close());
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function login(account){const r=await call('/login',null,'POST',{account,password});assert.equal(r.status,200);return {...r.value,cookie:r.cookie};}
 const admin=await login('admin');
 async function add(account,role='导师'){const r=await call('/users',admin,'POST',{account,name:account,role,password});assert.equal(r.status,201);return login(account);}
 const owner=await add('time-owner'),member=await add('time-member'),other=await add('time-other'),guest=await add('time-guest','只读访客');
 let p=(await call('/pm/projects',owner,'POST',{title:'工时项目',members:[{userId:member.user.id,role:'项目成员'}]})).value;
 const taskDraft={title:'研究任务',assigneeId:member.user.id,start:'2026-09-01',due:'2026-12-31',state:'待开始',progress:0};
 p=(await call(`/pm/projects/${p.id}/tasks`,owner,'POST',taskDraft)).value;let task=p.tasks[0];const path=`/pm/projects/${p.id}/time-entries`;
 const draft={taskId:task.id,start:'2026-09-29T10:30',end:'2026-09-29T12:00',note:'课题讨论会',tags:['会议']};
 assert.equal((await call(path,null)).status,401);assert.equal((await call(path,other,'POST',draft)).status,404);assert.equal((await call(path,guest,'POST',draft)).status,403);
 assert.equal((await call(path,member,'POST',{...draft,userId:owner.user.id})).status,403);
 assert.equal((await call(path,owner,'POST',{...draft,userId:other.user.id})).status,400);
 for(const invalid of [{start:'2026-02-30T10:30'},{end:'2026-09-29T25:00'},{end:draft.start},{end:'2026-09-29T10:00'},{taskId:'missing'}])assert.equal((await call(path,member,'POST',{...draft,...invalid})).status,400);
 const created=await call(path,member,'POST',draft);assert.equal(created.status,201);let entry=created.value.timeEntries[0];assert.equal(entry.durationMinutes,90);assert.equal(entry.userId,member.user.id);
 assert.equal((await call(path,owner,'POST',{...draft,userId:owner.user.id})).status,201); // Distinct people may work at the same time.
 assert.equal((await call(path,member,'POST',{...draft,start:'2026-09-29T11:00',end:'2026-09-29T13:00'})).status,409);
 let p2=(await call('/pm/projects',owner,'POST',{title:'另一工时项目',members:[{userId:member.user.id,role:'项目成员'}]})).value;p2=(await call(`/pm/projects/${p2.id}/tasks`,owner,'POST',taskDraft)).value;
 assert.equal((await call(`/pm/projects/${p2.id}/time-entries`,member,'POST',{...draft,taskId:p2.tasks[0].id})).status,409);
 assert.equal((await call(path,member,'POST',{...draft,taskId:p2.tasks[0].id,start:'2026-10-01T10:00',end:'2026-10-01T11:00'})).status,400);
 assert.equal((await call(path,member,'POST',{...draft,start:draft.end,end:'2026-09-29T12:30'})).status,201); // Adjacent intervals are valid.
 assert.equal((await call(path,member,'POST',{...draft,start:'2026-09-29T23:30',end:'2026-09-30T01:00'})).value.timeEntries[0].durationMinutes,90);
 const ownerEntry=(await call(path,owner)).value.find(e=>e.userId===owner.user.id);
 assert.equal((await call(path+'/'+ownerEntry.id,member,'PUT',{...ownerEntry,note:'越权'})).status,403);assert.equal((await call(path+'/'+ownerEntry.id,member,'DELETE',{revision:ownerEntry.revision})).status,403);
 const racing=await Promise.all([call(path+'/'+entry.id,member,'PUT',{...entry,note:'修改甲'}),call(path+'/'+entry.id,member,'PUT',{...entry,note:'修改乙'})]);assert.deepEqual(racing.map(r=>r.status).sort(),[200,409]);
 entry=(await call(path,owner)).value.find(e=>e.id===entry.id);
 assert.equal((await call(path+'/'+entry.id,owner,'PUT',{...entry,note:'负责人核对'})).status,200);
 const user=(await call('/users',admin)).value.find(u=>u.id===member.user.id);assert.equal((await call('/users/'+user.id,admin,'PUT',{...user,name:'改名工时成员'})).status,200);
 p=(await call(`/pm/projects/${p.id}`,owner)).value;task=p.tasks[0];assert.equal((await call(`/pm/projects/${p.id}/tasks/${task.id}`,owner,'PUT',{...task,title:'改名后的任务'})).status,200);
 entry=(await call(path,owner)).value.find(e=>e.id===entry.id);assert.equal(entry.person,'改名工时成员');assert.equal(entry.task,'改名后的任务');
 assert.equal((await call(path+'/'+entry.id,owner,'DELETE',{revision:1})).status,409);
 assert.equal((await call(path+'/'+entry.id,owner,'DELETE',{revision:entry.revision})).status,200);assert.equal((await call(path,owner)).value.some(e=>e.id===entry.id),false);
 assert.equal(app.db.prepare('SELECT deleted FROM pm_time_entries WHERE id=?').get(entry.id).deleted,1);
 assert.equal((await call(path,await login('time-member'),'POST',draft)).status,201); // Renaming revokes sessions; a deleted record no longer blocks the interval.
 const before=(await call(path,owner)).value;await app.close();app=createApplication({dir,password});await start();assert.deepEqual((await call(path,owner)).value,before);
 assert.ok((await call(`/pm/projects/${p.id}`,owner)).value.activities.some(e=>e.action==='删除工时记录'));
});
