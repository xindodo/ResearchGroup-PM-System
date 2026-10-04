import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server.mjs';
test('task milestone selection synchronizes atomically with permissions, conflicts and completion validation',async t=>{
 const app=createApplication({dir:mkdtempSync(join(tmpdir(),'jtgc-task-milestones-')),password:'task-milestones-password'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}/api`;
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password:'task-milestones-password'});return {...r.value,cookie:r.cookie}}
 const admin=await login('admin');assert.equal((await call('/users',admin,'POST',{account:'task-node-member',name:'节点任务成员',role:'导师',password:'task-milestones-password'})).status,201);const member=await login('task-node-member');
 let p=(await call('/pm/projects',admin,'POST',{title:'任务选节点',members:[{userId:member.user.id,role:'项目成员'}]})).value;const path=`/pm/projects/${p.id}`;
 for(const title of ['阶段甲','阶段乙'])p=(await call(path+'/milestones',admin,'POST',{title,planned:'2026-09-30'})).value;
 const ids=p.milestones.map(m=>m.id),versions=()=>Object.fromEntries(p.milestones.map(m=>[m.id,m.revision]));const draft={title:'任务关联测试',assigneeId:member.user.id,start:'2026-09-01',due:'2026-09-20',state:'待开始',progress:0};
 const count=()=>app.db.prepare('SELECT count(*) AS n FROM pm_tasks').get().n;
 assert.equal((await call(path+'/tasks',admin,'POST',{...draft,milestoneIds:ids})).status,409);assert.equal(count(),0);
 assert.equal((await call(path+'/tasks',admin,'POST',{...draft,milestoneIds:['foreign'],milestoneRevisions:versions()})).status,400);assert.equal(count(),0);
 p=(await call(path+'/tasks',admin,'POST',{...draft,milestoneIds:ids,milestoneRevisions:versions()})).value;let task=p.tasks[0];assert.deepEqual(task.milestoneIds.sort(),ids.sort());assert.ok(p.milestones.every(m=>m.taskIds.includes(task.id)&&m.revision===2&&m.taskCount===1));
 assert.equal((await call(path+'/tasks/'+task.id,member,'PUT',{...task,milestoneIds:[],milestoneRevisions:{}})).status,409);
 p=(await call(path+'/tasks/'+task.id,member,'PUT',{revision:task.revision,state:'进行中',progress:20})).value;task=p.tasks[0];assert.equal(task.milestoneIds.length,2);assert.ok(p.milestones.every(m=>m.taskProgress===20&&m.revision===2));
 p=(await call(path+'/tasks/'+task.id,admin,'PUT',{...task,milestoneIds:[ids[0]],milestoneRevisions:versions()})).value;task=p.tasks[0];assert.deepEqual(task.milestoneIds,[ids[0]]);assert.equal(p.milestones.find(m=>m.id===ids[1]).taskCount,0);
 const oldVersions=versions(),oldTask={...task};let node=p.milestones.find(m=>m.id===ids[0]);p=(await call(path+'/milestones/'+node.id,admin,'PUT',{...node,description:'并发修改'})).value;
 assert.equal((await call(path+'/tasks/'+task.id,admin,'PUT',{...task,title:'不应保存',milestoneIds:[],milestoneRevisions:oldVersions})).status,409);task=(await call(path,admin)).value.tasks[0];assert.deepEqual(task,oldTask);
 p=(await call(path+'/tasks/'+task.id,admin,'PUT',{...task,milestoneIds:[],milestoneRevisions:versions()})).value;task=p.tasks[0];assert.deepEqual(task.milestoneIds,[]);assert.ok(p.milestones.every(m=>m.taskCount===0));
 node=p.milestones.find(m=>m.id===ids[1]);p=(await call(path+'/milestones/'+node.id,admin,'PUT',{...node,state:'已完成',progress:100,actual:'2026-09-30'})).value;
 const before=count();assert.equal((await call(path+'/tasks',admin,'POST',{...draft,milestoneIds:[node.id],milestoneRevisions:versions()})).status,400);assert.equal(count(),before);
 p=(await call(path+'/tasks',admin,'POST',{...draft,title:'已完成关联任务',state:'已完成',progress:100,milestoneIds:[node.id],milestoneRevisions:versions()})).value;assert.equal(p.milestones.find(m=>m.id===node.id).taskCount,1);
 assert.ok(p.activities.some(e=>e.action==='更新里程碑任务关联'));
});
