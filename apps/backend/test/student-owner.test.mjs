import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';

test('student project owner manages only assigned projects, milestones and tasks while mentor permissions stay unchanged',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-student-owner-')),password='student-owner-password';let app=createApplication({dir,password}),base;
 async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`;}await start();t.after(()=>app.close());
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function login(account){const r=await call('/login',null,'POST',{account,password});assert.equal(r.status,200);return {...r.value,cookie:r.cookie};}
 const admin=await login('admin');
 async function add(account,role){assert.equal((await call('/users',admin,'POST',{account,name:account,role,password})).status,201);return login(account);}
 const owner=await add('mentor-owner','导师'),mentor=await add('other-mentor','导师'),student=await add('student-manager','学生'),other=await add('other-student','学生'),guest=await add('guest','只读访客');
 for(const id of [mentor.user.id,guest.user.id,'missing'])assert.equal((await call('/pm/projects',owner,'POST',{title:'无效学生负责人',studentOwnerId:id})).status,400);
 let created=await call('/pm/projects',owner,'POST',{title:'学生管理项目',studentOwnerId:student.user.id});assert.equal(created.status,201);let p=created.value,path='/pm/projects/'+p.id;
 assert.equal(p.studentOwner,student.user.name);assert.equal(p.members.find(m=>m.userId===student.user.id).role,'学生负责人');
 assert.equal((await call(path,mentor)).status,404);assert.equal((await call(path,other)).status,404);
 assert.equal((await call(path,student)).value.canManage,true);
 p=(await call(path,student,'PUT',{...p,title:'学生编辑项目',members:[]})).value;assert.equal(p.title,'学生编辑项目');assert.equal(p.members.length,2);
 assert.equal((await call(path,student,'PUT',{...p,ownerId:student.user.id})).status,403);
 const task={title:'学生分配任务',assigneeId:owner.user.id,start:'2026-10-01',due:'2026-10-30',state:'待开始',progress:0};
 let result=await call(path+'/tasks',student,'POST',task);assert.equal(result.status,201);p=result.value;let taskId=p.tasks[0].id;assert.equal(p.tasks[0].canEdit,true);
 result=await call(path+'/tasks/'+taskId,student,'PUT',{...p.tasks[0],title:'学生修改任务',state:'进行中',progress:20});assert.equal(result.status,200);p=result.value;
 result=await call(path+'/milestones',student,'POST',{title:'学生创建里程碑',planned:'2026-10-30',taskIds:[taskId],state:'待开始',progress:0});assert.equal(result.status,201);p=result.value;
 result=await call(path+'/milestones/'+p.milestones[0].id,student,'PUT',{...p.milestones[0],title:'学生修改里程碑'});assert.equal(result.status,200);p=result.value;
 assert.equal((await call('/users',student,'POST',{account:'forbidden',name:'forbidden',role:'学生',password})).status,403);
 const unrelated=(await call('/pm/projects',owner,'POST',{title:'其他项目',members:[{userId:student.user.id,role:'项目成员'}]})).value;
 assert.equal((await call('/pm/projects/'+unrelated.id,student)).value.canManageTasks,false);
 assert.equal((await call('/pm/projects/'+unrelated.id,student,'PUT',{...unrelated,title:'越权'})).status,403);
 await app.close();app=createApplication({dir,password});await start();p=(await call(path,student)).value;assert.equal(p.studentOwnerId,student.user.id);assert.equal(p.tasks[0].title,'学生修改任务');assert.equal(p.milestones[0].title,'学生修改里程碑');
 result=await call(path,owner,'PUT',{...p,studentOwnerId:other.user.id,members:[]});assert.equal(result.status,200);p=result.value;
 assert.equal((await call(path,student)).status,404);assert.equal((await call(path,other)).value.canManage,true);
 p=(await call(path,owner,'PUT',{...p,studentOwnerId:'',members:[]})).value;assert.equal(p.studentOwnerId,'');assert.equal((await call(path,other)).status,404);
});
