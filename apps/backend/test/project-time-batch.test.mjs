import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';
test('batch time entry is atomic and keeps per-person permissions, overlaps and independent editing',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-batch-time-')),password='batch-time-password-123';const app=createApplication({dir,password});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}/api`;
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});return {...r.value,cookie:r.cookie}}
 const admin=await login('admin');for(const account of ['alice','bob','outsider'])assert.equal((await call('/users',admin,'POST',{account,name:account,role:'学生',password})).status,201);
 const alice=await login('alice'),bob=await login('bob'),outsider=await login('outsider');let p=(await call('/pm/projects',admin,'POST',{title:'批量工时',members:[{userId:alice.user.id,role:'项目成员'},{userId:bob.user.id,role:'项目成员'}]})).value;p=(await call(`/pm/projects/${p.id}/tasks`,admin,'POST',{title:'共同研究',assigneeId:alice.user.id,start:'2026-10-01',due:'2026-10-31',state:'进行中',progress:20})).value;
 const path=`/pm/projects/${p.id}/time-entries`,draft={taskId:p.tasks[0].id,start:'2026-10-03T09:00',end:'2026-10-03T10:30',note:'共同讨论',tags:['会议']};
 const count=()=>app.db.prepare('SELECT count(*) AS n FROM pm_time_entries').get().n;
 for(const userIds of [[],[alice.user.id,alice.user.id],[alice.user.id,outsider.user.id]]){assert.equal((await call(path,admin,'POST',{...draft,userIds})).status,400);assert.equal(count(),0)}
 assert.equal((await call(path,alice,'POST',{...draft,userIds:[alice.user.id,bob.user.id]})).status,403);assert.equal(count(),0);
 const saved=await call(path,admin,'POST',{...draft,userIds:[alice.user.id,bob.user.id]});assert.equal(saved.status,201);assert.equal(saved.value.timeEntries.length,2);assert.equal(new Set(saved.value.timeEntries.map(e=>e.id)).size,2);for(const e of saved.value.timeEntries){assert.equal(e.durationMinutes,90);assert.equal(e.note,draft.note);assert.deepEqual(e.tags,draft.tags)}
 const eventsBefore=app.db.prepare('SELECT count(*) AS n FROM pm_events').get().n;
 const conflict=await call(path,admin,'POST',{...draft,userIds:[admin.user.id,bob.user.id]});assert.equal(conflict.status,409);assert.match(conflict.value.error,/bob/);assert.equal(count(),2);assert.equal(app.db.prepare('SELECT count(*) AS n FROM pm_events').get().n,eventsBefore);
 const adjacent=await call(path,admin,'POST',{...draft,start:draft.end,end:'2026-10-03T11:00',userIds:[alice.user.id,bob.user.id]});assert.equal(adjacent.status,201);assert.equal(count(),4);
 const entry=saved.value.timeEntries.find(e=>e.userId===alice.user.id);assert.equal((await call(path+'/'+entry.id,admin,'PUT',{...entry,userIds:[alice.user.id,bob.user.id]})).status,400);
 assert.equal((await call(path+'/'+entry.id,alice,'PUT',{...entry,note:'个人补充'})).status,200);const entries=(await call(path,admin)).value;assert.equal(entries.find(e=>e.id===entry.id).note,'个人补充');assert.equal(entries.find(e=>e.id===saved.value.timeEntries.find(e=>e.userId===bob.user.id).id).note,'共同讨论');
});
