import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server.mjs';

test('task type catalog preserves references, permissions and persistence', async t => {
  const dir=mkdtempSync(join(tmpdir(),'pm-task-types-')),password='task-types-password-123';
  let app=createApplication({dir,password}),base;
  async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`;}
  await start();t.after(()=>app.close());
  async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function login(account){const r=await call('/login',null,'POST',{account,password});return {...r.value,cookie:r.cookie};}
  let admin=await login('admin');
  for(const [account,role] of [['mentor','导师'],['student','学生']])assert.equal((await call('/users',admin,'POST',{account,name:account,password,role})).status,201);
  const mentor=await login('mentor'),student=await login('student');
  assert.equal((await call('/pm/options',mentor,'POST',{scope:'taskTypes',name:'越权'})).status,403);
  let option=(await call('/pm/options',admin,'POST',{scope:'taskTypes',name:'论文撰写',description:'写作任务'})).value.find(o=>o.scope==='taskTypes');
  assert.equal((await call('/pm/options',admin,'POST',{scope:'taskTypes',name:'论文撰写'})).status,409);
  let project=(await call('/pm/projects',admin,'POST',{title:'任务分类项目',members:[{userId:student.user.id,role:'项目成员'}]})).value;
  const path=`/pm/projects/${project.id}/tasks`;
  const draft={title:'论文初稿',assigneeId:student.user.id,start:'2026-10-01',due:'2026-10-10',state:'进行中',progress:20,description:'保留描述'};
  assert.equal((await call(path,admin,'POST',{...draft,taskType:'不存在'})).status,400);
  project=(await call(path,admin,'POST',{...draft,taskType:option.name})).value;
  let task=project.tasks[0];const oldTask={...task};
  assert.equal(task.taskType,'论文撰写');
  assert.equal((await call('/pm/options/'+option.id,admin,'DELETE',{revision:option.revision})).status,409);
  assert.equal((await call('/pm/options/'+option.id,mentor,'PUT',{name:'越权',revision:option.revision})).status,403);
  assert.equal((await call(path+'/'+task.id,student,'PUT',{revision:task.revision,state:'进行中',progress:30,taskType:'不存在'})).status,400);
  option=(await call('/pm/options/'+option.id,admin,'PUT',{name:'论文写作',revision:option.revision})).value.find(o=>o.id===option.id);
  task=(await call('/pm/projects/'+project.id,admin)).value.tasks[0];
  assert.equal(task.taskType,'论文写作');assert.equal(task.description,'保留描述');assert.equal(task.assigneeId,student.user.id);assert.equal(task.revision,oldTask.revision+1);
  assert.equal((await call(path+'/'+task.id,admin,'PUT',{...oldTask,...draft})).status,409);
  task=(await call(path+'/'+task.id,student,'PUT',{revision:task.revision,state:'进行中',progress:30})).value.tasks[0];assert.equal(task.taskType,'论文写作');
  await app.close();app=createApplication({dir,password});await start();admin=await login('admin');
  assert.equal((await call('/pm/projects/'+project.id,admin)).value.tasks[0].taskType,'论文写作');
  assert.equal((await call('/pm/options',admin)).value.find(o=>o.id===option.id).name,'论文写作');
  project=(await call(path+'/'+task.id,admin,'PUT',{...task,...draft,taskType:''})).value;assert.equal(project.tasks[0].taskType,'');
  assert.equal((await call('/pm/options/'+option.id,admin,'DELETE',{revision:option.revision})).status,200);
  assert.ok(!(await call('/pm/options',admin)).value.some(o=>o.id===option.id));
});
