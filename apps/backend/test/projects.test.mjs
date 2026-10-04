import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server.mjs';

test('projects can be created with only a title and optional date bounds', async t=>{
  const app=createApplication({dir:mkdtempSync(join(tmpdir(),'jtgc-project-minimal-')),password:'minimal-project-password'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}/api`;
  const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin',password:'minimal-project-password'})});
  const session=await login.json();const headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
  async function post(path,data){const r=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(data)});return {status:r.status,value:await r.json()};}
  assert.equal((await post('/pm/projects',{})).status,400);
  const first=await post('/pm/projects',{title:'仅名称项目'});assert.equal(first.status,201);
  assert.equal(first.value.ownerId,session.user.id);assert.equal(first.value.start,'');assert.equal(first.value.end,'');assert.equal(first.value.unit,'');assert.equal(first.value.progress,0);
  const second=await post('/pm/projects',{title:'另一个仅名称项目'});assert.equal(second.status,201);assert.equal(first.value.code,'');assert.equal(second.value.code,'');assert.notEqual(first.value.id,second.value.id);
  async function update(project,code){const r=await fetch(base+'/pm/projects/'+project.id,{method:'PUT',headers,body:JSON.stringify({...project,code})});return {status:r.status,value:await r.json()};}
  const numbered=await update(second.value,'2026-001');assert.equal(numbered.status,200);assert.equal(numbered.value.code,'2026-001');
  assert.equal((await post('/pm/projects',{title:'编号重复',code:'2026-001'})).status,409);
  const cleared=await update(numbered.value,'');assert.equal(cleared.status,200);assert.equal(cleared.value.code,'');
  assert.equal((await post('/pm/projects',{title:'编号再次使用',code:'2026-001'})).status,201);
  const task={title:'无项目周期的任务',assigneeId:session.user.id,start:'2026-10-01',due:'2026-11-01',state:'待开始',progress:0};
  const createdTask=await post(`/pm/projects/${first.value.id}/tasks`,{...task,description:'任务内容\n验收要求'});assert.equal(createdTask.status,201);
  const savedTask=createdTask.value.tasks[0];assert.equal(savedTask.description,'任务内容\n验收要求');
  async function updateTask(data){const r=await fetch(base+`/pm/projects/${first.value.id}/tasks/${savedTask.id}`,{method:'PUT',headers,body:JSON.stringify(data)});return {status:r.status,value:await r.json()};}
  assert.equal((await updateTask({...savedTask,description:'x'.repeat(5001)})).status,400);
  const described=await updateTask({...savedTask,description:'更新的任务描述'});assert.equal(described.status,200);assert.equal(described.value.tasks[0].description,'更新的任务描述');
  const clearedTask=await updateTask({...described.value.tasks[0],description:''});assert.equal(clearedTask.status,200);assert.equal(clearedTask.value.tasks[0].description,'');
  const bounded=await post('/pm/projects',{title:'只有截止日期',end:'2026-10-31'});assert.equal(bounded.status,201);
  assert.equal((await post(`/pm/projects/${bounded.value.id}/tasks`,task)).status,400);
  assert.equal((await post('/pm/projects',{title:'日期倒序',start:'2026-11-01',end:'2026-10-01'})).status,400);
  assert.equal((await post('/pm/projects',{title:'非法日期',start:'2026-02-30'})).status,400);
});

test('project membership, task permissions, conflicts, cycles and persistence', async t=>{
  const dir=mkdtempSync(join(tmpdir(),'jtgc-projects-')),password='project-test-password-123';
  let app=createApplication({dir,password}),base;
  async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`;}
  await start();t.after(async()=>{await app.close()});
  async function call(path,actor,method='GET',data){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  async function signIn(account){const r=await call('/login',null,'POST',{account,password});assert.equal(r.status,200);return {...r.value,cookie:r.cookie};}
  const admin=await signIn('admin');
  async function add(account,role='导师'){const r=await call('/users',admin,'POST',{account,name:account,role,password});assert.equal(r.status,201);return signIn(account);}
  const owner=await add('owner'),member=await add('member','学生'),outsider=await add('outsider'),guest=await add('guest','只读访客');
  const draft={title:'真实项目',code:'PM-001',type:'科研课题',ownerId:owner.user.id,unit:'牵头单位',sponsor:'科研计划',start:'2026-10-01',end:'2026-12-31',phase:'启动',summary:'项目目标',progress:0,status:'正常推进',lifecycle:'未开始',tags:['研究'],members:[{userId:member.user.id,role:'项目成员'}],units:[{name:'合作单位',role:'协作单位',contact:'联系人',duty:'研究'}]};
  assert.equal((await call('/pm/projects',null)).status,401);
  assert.equal((await call('/pm/projects',guest,'POST',draft)).status,403);
  assert.equal((await call('/pm/projects',outsider,'POST',draft)).status,403);

  let result=await call('/pm/projects',owner,'POST',draft);assert.equal(result.status,201);let p=result.value;
  const path=`/pm/projects/${p.id}`;
  assert.equal(p.members.length,2);assert.equal(p.tasks.length,0);assert.equal(p.activities.length,1);
  assert.equal((await call('/pm/projects',owner,'POST',draft)).status,409);
  assert.equal((await call(path,outsider)).status,404);
  assert.equal((await call(path,guest)).status,404);
  assert.equal((await call('/pm/projects',outsider)).value.projects.length,0);
  assert.equal((await call(path,member)).value.canManageTasks,false);
  assert.equal((await call(path,member,'PUT',{...p,title:'越权'})).status,403);
  const task={title:'主任务',assigneeId:member.user.id,start:'2026-10-02',due:'2026-10-30',parentId:'',dependsOn:'',state:'待开始',progress:0};
  assert.equal((await call(path+'/tasks',member,'POST',task)).status,403);
  assert.equal((await call(path+'/tasks',owner,'POST',{...task,assigneeId:outsider.user.id})).status,400);
  assert.equal((await call(path+'/tasks',owner,'POST',{...task,due:'2027-01-01'})).status,400);
  assert.equal((await call(path+'/tasks',owner,'POST',{...task,parentId:'missing'})).status,400);
  assert.equal((await call(path+'/tasks',owner,'POST',{...task,participantIds:[outsider.user.id]})).status,400);
  assert.equal((await call(path+'/tasks',owner,'POST',{...task,participantIds:[member.user.id,member.user.id]})).status,400);
  result=await call(path+'/tasks',owner,'POST',{...task,participantIds:[member.user.id]});assert.equal(result.status,201);p=result.value;let main=p.tasks[0];
  assert.deepEqual(main.participantIds,[member.user.id]);assert.equal(main.participants[0].name,'member');
  assert.equal((await call(path+'/tasks/'+main.id,member,'PUT',{revision:main.revision,state:'进行中',progress:30,participantIds:[outsider.user.id]})).status,400);
  assert.equal((await call(path+'/tasks/'+main.id,member,'PUT',{revision:main.revision,state:'进行中',progress:50,title:'x'.repeat(151)})).status,400);
  result=await call(path+'/tasks/'+main.id,member,'PUT',{revision:main.revision,state:'进行中',progress:50});assert.equal(result.status,200);p=result.value;main=p.tasks[0];
  assert.equal(main.progress,50);
  assert.deepEqual(main.participantIds,[member.user.id]);
  assert.equal((await call(path+'/tasks/'+main.id,member,'PUT',{revision:1,state:'已完成',progress:100})).status,409);
  assert.equal((await call(path+'/tasks/'+main.id,member,'PUT',{revision:main.revision,state:'已完成',progress:90})).status,400);
  assert.equal((await call(path,owner,'PUT',{...p,members:[]})).status,400);
  assert.equal((await call(path,owner,'PUT',{...p,end:'2026-10-10'})).status,400);
  result=await call(path+'/tasks',owner,'POST',{...task,title:'子任务',parentId:main.id,dependsOn:main.id});assert.equal(result.status,201);p=result.value;const child=p.tasks.find(t=>t.title==='子任务');
  assert.equal((await call(path+'/tasks/'+main.id,owner,'PUT',{...main,parentId:child.id})).status,400);
  assert.equal((await call(path+'/tasks/'+main.id,owner,'PUT',{...main,dependsOn:child.id})).status,400);
  const second=await call('/pm/projects',owner,'POST',{...draft,code:'PM-002'});
  assert.equal((await call(`/pm/projects/${second.value.id}/tasks`,owner,'POST',{...task,parentId:main.id})).status,400);
  result=await call(path,owner,'PUT',{...p,title:'更新项目'});assert.equal(result.status,200);p=result.value;
  assert.equal((await call(path,owner,'PUT',{...p,revision:1})).status,409);
  // Both racing writes carry the same revision; exactly one must succeed.
  const race=await Promise.all([call(path,owner,'PUT',{...p,title:'并发甲'}),call(path,owner,'PUT',{...p,title:'并发乙'})]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  let user=(await call('/users',admin)).value.find(u=>u.id===member.user.id);
  assert.equal((await call('/users/'+user.id,admin,'DELETE',{})).status,409);
  assert.equal((await call('/users/'+user.id,admin,'PUT',{...user,name:'改名成员'})).status,200);
  p=(await call(path,owner)).value;assert.equal(p.tasks[0].owner,'改名成员');assert.ok(p.members.some(m=>m.name==='改名成员'));
  const legacy={kind:'projects',title:'已有课题',category:'纵向课题',owner:'owner',participants:['改名成员'],attachments:[],images:[]};
  assert.equal((await call('/records',owner,'POST',legacy)).status,201);
  const recordsBefore=app.db.prepare('SELECT * FROM records').all();
  await app.close();app=createApplication({dir,password});await start();
  p=(await call(path,owner)).value;assert.equal(p.tasks.length,2);assert.ok(p.activities.length>=5);
  assert.deepEqual(app.db.prepare('SELECT * FROM records').all(),recordsBefore);
  assert.equal((await call('/pm/projects',admin)).value.projects.length,2);
  user=(await call('/users',admin)).value.find(u=>u.id===member.user.id);
  assert.equal((await call('/users/'+user.id,admin,'PUT',{...user,role:'只读访客'})).status,200);
  const downgraded=await signIn('member');
  assert.equal((await call(path,downgraded)).status,404);
  assert.equal((await call('/pm/projects',downgraded)).value.projects.length,0);
  assert.equal((await call(path,owner)).value.tasks[0].owner,'改名成员');
});
