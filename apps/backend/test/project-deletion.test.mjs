import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';
test('project deletion previews related records, checks permissions and preserves data',async t=>{
 const password='spent-days-password-123',app=createApplication({dir:mkdtempSync(join(tmpdir(),'pm-workdays-')),password});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}/api`;
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});assert.equal(r.status,200);return {...r.value,cookie:r.cookie}}
 const admin=await login('admin');await call('/users',admin,'POST',{account:'student',name:'工日学生',role:'学生',password});const student=await login('student');await call('/users',admin,'POST',{account:'other',name:'其他学生',role:'学生',password});const other=await login('other');
 let p=(await call('/pm/projects',admin,'POST',{title:'删除测试项目',members:[{userId:student.user.id,role:'项目成员'}]})).value;
 p=(await call('/pm/projects/'+p.id+'/tasks',admin,'POST',{title:'保留任务',assigneeId:student.user.id,start:'2026-10-01',due:'2026-10-02',state:'进行中',progress:0,spentDays:1})).value;
 app.db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?)').run('preserved-file','project',p.id,'附件.txt','text/plain',3,'test-hash');
 const owned=(await call('/pm/projects',student,'POST',{title:'学生负责项目'})).value;assert.equal((await call('/pm/projects/'+owned.id,student,'DELETE',{revision:owned.revision})).status,403);assert.equal((await call('/pm/projects/'+owned.id+'/deletion-preview',student)).status,403);
 const tasksBefore=app.db.prepare('SELECT * FROM pm_tasks WHERE project_id=?').all(p.id),filesBefore=app.db.prepare('SELECT * FROM files').all();
 const preview=await call('/pm/projects/'+p.id+'/deletion-preview',admin);assert.equal(preview.status,200);assert.equal(preview.value.tasks,1);assert.equal(preview.value.workdayTasks,1);assert.equal(preview.value.attachments,1);
 assert.equal((await call('/pm/projects/'+p.id+'/deletion-preview',student)).status,403);
 assert.equal((await call('/pm/projects/'+p.id,student,'DELETE',{revision:p.revision})).status,403);
 assert.equal((await call('/pm/projects/'+p.id,admin,'DELETE',{revision:0})).status,409);
 assert.equal((await call('/pm/projects/'+p.id,admin,'DELETE',{revision:p.revision})).status,200);
 assert.equal((await call('/pm/projects/'+p.id,admin)).status,404);assert.equal((await call('/pm/projects/'+p.id,student)).status,404);
 assert.ok(!(await call('/pm/projects',admin)).value.projects.some(project=>project.id===p.id));
 assert.deepEqual(app.db.prepare('SELECT * FROM pm_tasks WHERE project_id=?').all(p.id),tasksBefore);assert.deepEqual(app.db.prepare('SELECT * FROM files').all(),filesBefore);
 assert.ok(JSON.parse(app.db.prepare('SELECT payload FROM pm_projects WHERE id=?').get(p.id).payload).deletedAt);
});
