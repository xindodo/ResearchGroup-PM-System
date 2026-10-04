import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';

test('membership grants viewing while task participation grants CRUD; removing participation preserves member viewing',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-task-access-')),password='task-access-test-password';let app=createApplication({dir,password}),base;
 async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`}
 await start();t.after(()=>app.close());
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});assert.equal(r.status,200);return {...r.value,cookie:r.cookie}}
 const admin=await login('admin');
 async function add(account,role='学生'){assert.equal((await call('/users',admin,'POST',{account,name:account,role,password})).status,201);return login(account)}
 const owner=await add('owner','导师'),participant=await add('participant'),assignee=await add('assignee'),member=await add('member'),outsider=await add('outsider');
 let p=(await call('/pm/projects',owner,'POST',{title:'参与任务即可访问',members:[participant,assignee,member].map(a=>({userId:a.user.id,role:'项目成员'}))})).value;
 const path='/pm/projects/'+p.id,draft={title:'参与入口',assigneeId:assignee.user.id,participantIds:[participant.user.id],start:'2026-10-01',due:'2026-10-05',state:'进行中',progress:20,spentDays:1};
 assert.equal((await call(path,participant)).status,200);
 assert.equal((await call(path,participant)).value.canManageTasks,false);
 p=(await call(path+'/tasks',owner,'POST',draft)).value;const entryId=p.tasks[0].id;
 p=(await call(path+'/tasks',owner,'POST',{...draft,title:'其他人的任务',assigneeId:owner.user.id,participantIds:[]})).value;
 let other=p.tasks.find(t=>t.title==='其他人的任务');
 for(const actor of [participant,assignee]){const r=await call(path,actor);assert.equal(r.status,200);assert.equal(r.value.canManage,false);assert.equal(r.value.canManageTasks,true);assert.equal(r.value.tasks.length,2);assert.ok(r.value.tasks.every(t=>t.canEdit));}
 const memberView=await call(path,member);assert.equal(memberView.status,200);assert.equal(memberView.value.tasks.length,2);assert.equal(memberView.value.canManageTasks,false);assert.ok(memberView.value.tasks.every(t=>!t.canEdit));
 assert.equal((await call('/pm/projects',member)).value.projects.length,1);
 assert.equal((await call(path+'/tasks',member,'POST',draft)).status,403);
 assert.equal((await call(path+'/tasks/'+other.id,member,'PUT',{...other,title:'越权'})).status,403);
 assert.equal((await call(path+'/tasks/'+other.id,member,'DELETE',{revision:other.revision})).status,403);
 for(const actor of [outsider]){
  assert.equal((await call(path,actor)).status,404);assert.equal((await call('/pm/projects',actor)).value.projects.length,0);
  assert.equal((await call(path+'/tasks',actor,'POST',draft)).status,404);
  assert.equal((await call(path+'/tasks/'+other.id,actor,'PUT',{...other,title:'越权'})).status,404);
  assert.equal((await call(path+'/tasks/'+other.id,actor,'DELETE',{revision:other.revision})).status,404);
 }
 assert.equal((await call(path,participant,'PUT',{...p,title:'越权修改项目'})).status,403);
 assert.equal((await call(path+'/milestones',participant,'POST',{title:'越权节点',planned:'2026-10-05'})).status,403);
 p=(await call(path+'/tasks/'+other.id,participant,'PUT',{...other,title:'参与人员修改他人任务',assigneeId:member.user.id,participantIds:[participant.user.id]})).value;other=p.tasks.find(t=>t.id===other.id);
 assert.equal(other.title,'参与人员修改他人任务');assert.equal((await call(path,member)).status,200);
 assert.equal((await call(path+'/tasks/'+other.id,participant,'PUT',{...other,revision:1})).status,409);
 p=(await call(path+'/tasks',participant,'POST',{...draft,title:'参与人员新增任务',participantIds:[]})).value;
 const created=p.tasks.find(t=>t.title==='参与人员新增任务');assert.ok(created);
 const node=(await call(path+'/milestones',owner,'POST',{title:'删除关联节点',planned:'2026-10-05',taskIds:[created.id]})).value.milestones[0];
 const before=JSON.parse(app.db.prepare('SELECT payload FROM pm_tasks WHERE id=?').get(created.id).payload);
 assert.equal((await call(path+'/tasks/'+created.id,participant,'DELETE',{revision:0})).status,409);
 assert.equal((await call(path+'/tasks/'+created.id,participant,'DELETE',{revision:created.revision})).status,200);
 const after=JSON.parse(app.db.prepare('SELECT payload FROM pm_tasks WHERE id=?').get(created.id).payload);assert.ok(after.deletedAt);assert.equal(after.spentDays,before.spentDays);
 p=(await call(path,owner)).value;assert.ok(!p.tasks.some(t=>t.id===created.id));assert.equal(p.milestones.find(m=>m.id===node.id).taskCount,0);
 assert.equal((await call(path+'/tasks/'+created.id,participant,'PUT',{...created})).status,404);
 // Removing the last assignment revokes task editing, while members can still view.
 assert.equal((await call(path+'/tasks/'+other.id,participant,'DELETE',{revision:other.revision})).status,200);
 assert.equal((await call(path,member)).value.canManageTasks,false);
 let entry=(await call(path,owner)).value.tasks.find(t=>t.id===entryId);
 const revoked=await call(path+'/tasks/'+entry.id,participant,'PUT',{...entry,participantIds:[]});assert.equal(revoked.status,200);assert.equal(revoked.value.canManageTasks,false);assert.ok(revoked.value.tasks.every(t=>!t.canEdit));
 assert.equal((await call(path,participant)).status,200);assert.equal((await call('/pm/projects',participant)).value.projects.length,1);
 assert.equal((await call(path+'/tasks',participant,'POST',draft)).status,403);
 assert.equal((await call(path,owner)).status,200);assert.equal((await call(path,admin)).status,200);assert.equal((await call(path,assignee)).status,200);
 // Existing task participants remain authorized even when absent from pm_members.
 entry=(await call(path,owner)).value.tasks.find(t=>t.id===entryId);const value=JSON.parse(app.db.prepare('SELECT payload FROM pm_tasks WHERE id=?').get(entry.id).payload);value.participantIds=[outsider.user.id];app.db.prepare('UPDATE pm_tasks SET payload=? WHERE id=?').run(JSON.stringify(value),entry.id);
 assert.equal((await call(path,outsider)).value.canManageTasks,true);
 await app.close();app=createApplication({dir,password});await start();assert.equal((await call(path,outsider)).status,200);assert.equal((await call(path,participant)).status,200);
 assert.equal((await call(path+'/tasks/'+entry.id,assignee,'DELETE',{revision:entry.revision})).status,200);assert.equal((await call(path,assignee)).status,200);assert.equal((await call(path,assignee)).value.canManageTasks,false);assert.equal((await call(path,outsider)).status,404);
 p=(await call(path,owner)).value;p=(await call(path,owner,'PUT',{...p,members:[]})).value;
 assert.equal((await call(path,participant)).status,404);assert.equal((await call(path,member)).status,404);assert.equal((await call(path,owner)).status,200);assert.equal((await call(path,admin)).status,200);
});

test('task deletion rejects dependency conflicts and preserves records, workdays and attachments',async t=>{
 const password='task-delete-test-password',app=createApplication({dir:mkdtempSync(join(tmpdir(),'pm-task-delete-')),password});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}/api`;
 const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin',password})}),session=await login.json(),headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
 async function call(path,method='GET',data){const r=await fetch(base+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json()}}
 let p=(await call('/pm/projects','POST',{title:'保留删除历史'})).value;const path='/pm/projects/'+p.id,draft={title:'前置任务',assigneeId:session.user.id,start:'2026-10-01',due:'2026-10-05',state:'进行中',progress:20,spentDays:2};
 p=(await call(path+'/tasks','POST',draft)).value;const first=p.tasks[0];
 p=(await call(path+'/tasks','POST',{...draft,title:'后续任务',dependsOn:first.id,parentId:first.id})).value;const next=p.tasks.find(t=>t.id!==first.id);
 assert.equal((await call(path+'/tasks/'+first.id,'DELETE',{revision:first.revision})).status,409);
 assert.equal((await call(path+'/time-entries','POST',{taskId:next.id,userId:session.user.id,start:'2026-10-01T09:00',end:'2026-10-01T10:00'})).status,201);
 app.db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?)').run('task-history-file','task',next.id,'保留附件.txt','text/plain',3,'retained-hash');
 const times=app.db.prepare('SELECT * FROM pm_time_entries').all(),files=app.db.prepare('SELECT * FROM files').all();
 assert.equal((await call(path+'/tasks/'+next.id,'DELETE',{revision:next.revision})).status,200);
 assert.deepEqual(app.db.prepare('SELECT * FROM pm_time_entries').all(),times);assert.deepEqual(app.db.prepare('SELECT * FROM files').all(),files);
 assert.equal((await call(path)).value.timeEntries.length,0);assert.equal((await call(path+'/tasks/'+first.id,'DELETE',{revision:first.revision})).status,200);
 assert.equal((await call(path)).value.tasks.length,0);assert.equal(app.db.prepare('SELECT count(*) AS n FROM pm_tasks').get().n,2);
});
