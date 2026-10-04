import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server.mjs';
test('milestones preserve data, enforce planning permissions, dependencies, completion and optimistic versions',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'jtgc-milestones-')),password='milestone-password-123';let app=createApplication({dir,password}),base;
 async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`}
 await start();t.after(()=>app.close());
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});assert.equal(r.status,200);return {...r.value,cookie:r.cookie}}
 const admin=await login('admin');async function add(account,role='导师'){assert.equal((await call('/users',admin,'POST',{account,name:account,role,password})).status,201);return login(account)}
 const owner=await add('milestone-owner'),member=await add('milestone-member'),outsider=await add('milestone-outsider'),guest=await add('milestone-guest','只读访客');
 let p=(await call('/pm/projects',owner,'POST',{title:'里程碑测试项目',start:'2026-01-01',end:'2026-12-31',members:[{userId:member.user.id,role:'项目成员'}]})).value;const path=`/pm/projects/${p.id}/milestones`;
 p=(await call(`/pm/projects/${p.id}/tasks`,owner,'POST',{title:'报告任务',assigneeId:owner.user.id,participantIds:[member.user.id],start:'2026-09-01',due:'2026-09-20',state:'进行中',progress:60})).value;
 const draft={title:'方案验收',ownerId:member.user.id,planned:'2026-09-25',description:'方案说明',deliverable:'研究报告',acceptance:'专家验收',priority:'高',tags:['研究'],taskIds:[],dependsOn:'',state:'进行中',progress:40,actual:'',result:'初稿完成'};
 assert.equal((await call(path,null)).status,401);assert.equal((await call(path,guest,'POST',draft)).status,403);assert.equal((await call(path,outsider,'POST',draft)).status,404);assert.equal((await call(path,member,'POST',draft)).status,403);
 for(const patch of [{planned:'2026-02-30'},{planned:'2027-01-01'},{planned:''},{priority:'无'},{progress:101},{state:'未知'},{ownerId:outsider.user.id},{taskIds:['foreign']},{dependsOn:'foreign'},{tags:['重复','重复']}])assert.equal((await call(path,owner,'POST',{...draft,...patch})).status,400);
 p=(await call(path,owner,'POST',draft)).value;let m=p.milestones[0];assert.equal(m.owner,member.user.name);assert.equal(m.canManage,true);
 assert.equal((await call(path+'/'+m.id,member,'PUT',{revision:m.revision,title:'越权',state:'进行中',progress:50})).status,403);
 assert.equal((await call(path+'/'+m.id,member,'DELETE',{revision:m.revision})).status,403);
 p=(await call(path+'/'+m.id,member,'PUT',{revision:m.revision,state:'待验收',progress:100,result:'成果交付',actual:''})).value;m=p.milestones[0];assert.equal(m.description,draft.description);assert.equal(m.canManage,false);
 assert.equal((await call(path+'/'+m.id,owner,'PUT',{...m,state:'已完成',actual:''})).status,400);assert.equal((await call(path+'/'+m.id,owner,'PUT',{...m,state:'已完成',actual:'2099-01-01'})).status,400);
 let q=(await call('/pm/projects',owner,'POST',{title:'另一项目'})).value;q=(await call(`/pm/projects/${q.id}/milestones`,owner,'POST',{...draft,ownerId:owner.user.id})).value;assert.equal((await call(path+'/'+m.id,owner,'PUT',{...m,dependsOn:q.milestones[0].id})).status,400);
 p=(await call(path,owner,'POST',{...draft,title:'后续上线',ownerId:owner.user.id,dependsOn:m.id})).value;let next=p.milestones.find(n=>n.title==='后续上线');
 assert.equal((await call(path+'/'+m.id,owner,'PUT',{...m,dependsOn:next.id})).status,400);assert.equal((await call(path+'/'+m.id,owner,'DELETE',{revision:m.revision})).status,409);
 assert.equal((await call(path+'/'+next.id,owner,'PUT',{...next,state:'已完成',progress:100,actual:'2026-09-26'})).status,400);
 p=(await call(`/pm/projects/${p.id}`,owner)).value;let task=p.tasks[0];
 p=(await call(path+'/'+m.id,owner,'PUT',{...m,taskIds:[task.id]})).value;m=p.milestones.find(n=>n.id===m.id);task=p.tasks[0];assert.equal(m.taskProgress,60);
 assert.equal((await call(path+'/'+m.id,owner,'PUT',{...m,state:'已完成',progress:100,actual:'2026-09-25'})).status,400);
 p=(await call(`/pm/projects/${p.id}/tasks/${task.id}`,owner,'PUT',{...task,state:'已完成',progress:100})).value;task=p.tasks[0];
 const race=await Promise.all([call(path+'/'+m.id,member,'PUT',{revision:m.revision,state:'已完成',progress:100,actual:'2026-09-25',result:'验收通过'}),call(path+'/'+m.id,member,'PUT',{revision:m.revision,state:'待验收',progress:100,result:'另一修改',actual:''})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 m=(await call(path,owner)).value.find(n=>n.id===m.id);if(m.state!=='已完成'){p=(await call(path+'/'+m.id,owner,'PUT',{...m,state:'已完成',actual:'2026-09-25'})).value;m=p.milestones.find(n=>n.id===m.id)}
 assert.equal((await call(`/pm/projects/${p.id}/tasks/${task.id}`,owner,'PUT',{...task,state:'进行中',progress:90})).status,409);
 p=(await call(path+'/'+next.id,owner,'PUT',{...next,state:'已完成',progress:100,actual:'2026-09-26'})).value;next=p.milestones.find(n=>n.id===next.id);
 assert.equal((await call(path+'/'+m.id,owner,'PUT',{...m,state:'进行中',actual:''})).status,409);
 assert.equal((await call(`/pm/projects/${p.id}`,owner,'PUT',{...p,end:'2026-09-24'})).status,400);
 assert.equal((await call(path+'/'+next.id,owner,'DELETE',{revision:1})).status,409);assert.equal((await call(path+'/'+next.id,owner,'DELETE',{revision:next.revision})).status,200);assert.equal(app.db.prepare('SELECT deleted FROM pm_milestones WHERE id=?').get(next.id).deleted,1);
 p=(await call(path+'/'+m.id,owner,'PUT',{...m,state:'进行中',progress:80,actual:''})).value;m=p.milestones.find(n=>n.id===m.id);
 assert.equal((await call(`/pm/projects/${p.id}`,owner,'PUT',{...p,members:[]})).status,400);
 assert.equal((await call(path+'/'+m.id,owner,'PUT',{...m,state:'已取消',actual:''})).status,200);p=(await call(`/pm/projects/${p.id}`,owner)).value;
 assert.equal((await call(`/pm/projects/${p.id}`,owner,'PUT',{...p,members:[]})).status,200);
 m=(await call(path,owner)).value.find(n=>n.id===m.id);assert.equal((await call(path+'/'+m.id,owner,'PUT',{...m,state:'进行中',progress:10})).status,400);
 const before=(await call(path,owner)).value;await app.close();app=createApplication({dir,password});await start();assert.deepEqual((await call(path,owner)).value,before);assert.ok((await call(`/pm/projects/${p.id}`,owner)).value.activities.some(e=>e.action==='删除里程碑'));
});
