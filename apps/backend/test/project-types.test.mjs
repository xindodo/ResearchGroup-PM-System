import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server.mjs';
test('project types are managed by administrators, preserve references and survive restart without reseeding deleted defaults',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'jtgc-types-')),password='type-password-123';let app=createApplication({dir,password}),base;async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`};await start();t.after(()=>app.close());
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});return {...r.value,cookie:r.cookie}}
 const admin=await login('admin');for(const [account,role] of [['type-teacher','导师'],['type-dept-admin','学生']])assert.equal((await call('/users',admin,'POST',{account,name:account,password,role})).status,201);const teacher=await login('type-teacher'),dept=await login('type-dept-admin');
 const get=async()=> (await call('/pm/options',admin)).value.filter(o=>o.scope==='types');let types=await get();assert.equal(types.length,3);
 assert.equal((await call('/pm/options',teacher,'POST',{scope:'types',name:'无权新增'})).status,403);for(const name of ['科研课题','工程建设']){const option=types.find(o=>o.name===name);assert.equal((await call('/pm/options/'+option.id,admin,'DELETE',{revision:option.revision})).status,200)}
 let option=(await get())[0];assert.equal((await call('/pm/options/'+option.id,admin,'DELETE',{revision:option.revision})).status,409);
 types=(await call('/pm/options/'+option.id,admin,'PUT',{name:'自定义科研',revision:option.revision})).value;option=types.find(o=>o.id===option.id);
 let p=(await call('/pm/projects',teacher,'POST',{title:'仅名称项目',summary:'保留目标'})).value;assert.equal(p.type,'自定义科研');const previous=p.revision;
 assert.equal((await call('/pm/options/'+option.id,teacher,'PUT',{...option,name:'越权改名'})).status,403);assert.equal((await call('/pm/options/'+option.id,teacher,'DELETE',{revision:option.revision})).status,403);
 assert.equal((await call('/pm/options/'+option.id,admin,'DELETE',{revision:option.revision})).status,409);types=(await call('/pm/options/'+option.id,admin,'PUT',{...option,name:'综合研发'})).value;option=types.find(o=>o.id===option.id);p=(await call('/pm/projects/'+p.id,teacher)).value;assert.equal(p.type,'综合研发');assert.equal(p.summary,'保留目标');assert.equal(p.revision,previous+1);assert.equal(p.ownerId,teacher.user.id);
 assert.equal((await call('/pm/options/'+option.id,admin,'PUT',{...option,revision:1,name:'过期覆盖'})).status,409);assert.equal((await call('/pm/options',admin,'POST',{scope:'types',name:'综合研发'})).status,409);
 assert.equal((await call('/pm/projects',teacher,'POST',{title:'无效类型项目',type:'不在目录'})).status,400);
 assert.equal((await call('/pm/options',dept,'POST',{scope:'types',name:'技术服务',description:'服务项目'})).status,403);assert.equal((await call('/pm/options',admin,'POST',{scope:'types',name:'技术服务',description:'服务项目'})).status,201);assert.equal((await call('/pm/projects',teacher,'POST',{title:'技术服务项目',type:'技术服务'})).status,201);
 let unused=(await call('/pm/options',admin,'POST',{scope:'types',name:'删除后不恢复'})).value.find(o=>o.name==='删除后不恢复');assert.equal((await call('/pm/options/'+unused.id,admin,'DELETE',{revision:unused.revision})).status,200);
 const before=await get();await app.close();app=createApplication({dir,password});await start();assert.deepEqual(await get(),before);assert.ok(!(await get()).some(o=>['科研课题','工程建设','跨单位项目','删除后不恢复'].includes(o.name)));
 // Simulate an old install upgrading: retain custom project values without rewriting business payloads.
 app.db.prepare('UPDATE pm_projects SET payload=? WHERE id=?').run(JSON.stringify({...JSON.parse(app.db.prepare('SELECT payload FROM pm_projects WHERE id=?').get(p.id).payload),type:'旧自定义类型'}),p.id);app.db.prepare('DELETE FROM migrations WHERE version=6').run();const snapshot=app.db.prepare('SELECT * FROM pm_projects ORDER BY id').all();await app.close();app=createApplication({dir,password});await start();assert.deepEqual(app.db.prepare('SELECT * FROM pm_projects ORDER BY id').all(),snapshot);assert.ok((await get()).some(o=>o.name==='旧自定义类型'));assert.ok(app.db.prepare('SELECT version FROM migrations WHERE version=6').get());
});
