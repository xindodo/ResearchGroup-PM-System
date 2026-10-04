import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';
test('organization units and independent personnel preserve project references, linked accounts and optimistic permissions',async t=>{
 const app=createApplication({dir:mkdtempSync(join(tmpdir(),'pm-organization-')),password:'organization-test-123'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}/api`;
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function login(account){const result=await call('/login',null,'POST',{account,password:'organization-test-123'});assert.equal(result.status,200);return {...result.value,cookie:result.cookie};}
 const admin=await login('admin');
 const teacher=(await call('/users',admin,'POST',{account:'org-teacher',name:'单位教师',role:'导师',password:'organization-test-123'})).value;
 const regular=await login('org-teacher');assert.equal((await call('/organization/units',regular,'POST',{name:'越权',category:'校内单位'})).status,403);
 let data=(await call('/organization/units',admin,'POST',{name:'内设研究院',category:'校内单位'})).value;let unit=data.units.find(u=>u.name==='内设研究院');assert(unit);
 assert.equal((await call('/organization/units',admin,'POST',{name:unit.name,category:'校外单位'})).status,409);
 assert.equal((await call('/organization/units',admin,'POST',{name:'错误',category:'未知'})).status,400);
 data=(await call('/organization/people',admin,'POST',{name:'企业联系人',organizationId:unit.id})).value;let person=data.people.find(p=>p.name==='企业联系人');assert(person.organizationPerson);assert.equal(app.db.prepare('SELECT count(*) n FROM users').get().n,2);
 assert.equal((await call('/organization/units/'+unit.id,admin,'DELETE',{revision:unit.revision})).status,409);
 const edited=await call('/organization/people/'+person.id+'/profile',admin,'PUT',{...person,revision:person.organizationRevision,type:'专业教师',orcid:'0000-0000-0000-000X',direction:'智能交通',attachments:[],images:[]});assert.equal(edited.status,200);assert.equal(edited.value.direction,'智能交通');
 assert.equal((await call('/organization/people/'+person.id,admin,'PUT',{name:'过期',organizationId:unit.id,revision:person.organizationRevision})).status,409);
 data=(await call('/organization/people',admin,'POST',{userId:teacher.id,organizationId:unit.id})).value;let linked=data.people.find(p=>p.userId===teacher.id);assert.equal(linked.name,'单位教师');
 let project=(await call('/pm/projects',admin,'POST',{title:'单位引用项目',unit:unit.name,units:[{name:unit.name,role:'协作单位',contact:'',duty:''}],members:[]})).value;assert(project.id);
 data=(await call('/organization/units/'+unit.id,admin,'PUT',{name:'改名研究院',category:'校外单位',revision:unit.revision})).value;unit=data.units.find(u=>u.id===unit.id);assert.equal(unit.category,'校外单位');
 const fresh=(await call('/pm/projects/'+project.id,admin)).value;assert.equal(fresh.unit,unit.name);assert.equal(fresh.units[0].name,unit.name);assert.equal(fresh.revision,project.revision+1);
 const options=(await call('/pm/options',admin)).value;assert(options.some(o=>o.scope==='units'&&o.name===unit.name));assert(options.some(o=>o.scope==='participantUnits'&&o.name===unit.name));
 person=data.people.find(p=>p.id===person.id);assert.equal((await call('/organization/people/'+person.id,admin,'DELETE',{revision:person.organizationRevision})).status,200);
 data=(await call('/organization/people/'+linked.id,admin,'DELETE',{revision:linked.organizationRevision})).value;assert.equal(data.people.find(p=>p.userId===teacher.id).organizationId,null);assert(app.db.prepare('SELECT id FROM users WHERE id=?').get(teacher.id));
 assert.equal((await call('/organization/units/'+unit.id,admin,'DELETE',{revision:unit.revision})).status,409);
 data=(await call('/organization/units',admin,'POST',{name:'可删除单位',category:'校外单位'})).value;const empty=data.units.find(u=>u.name==='可删除单位');assert.equal((await call('/organization/units/'+empty.id,admin,'DELETE',{revision:empty.revision})).status,200);
 for(const category of ['其他高校','科研院所','其他企业']){const created=await call('/organization/units',admin,'POST',{name:category+'测试单位',category});assert.equal(created.status,201);assert.equal(created.value.units.find(u=>u.name===category+'测试单位').category,category);}
 assert.equal((await call('/organization/units',admin,'POST',{name:'全部不是分类',category:'所有单位'})).status,400);
 assert.equal(app.db.prepare('PRAGMA foreign_key_check').all().length,0);
});


test('existing independent personnel do not reappear as unassigned after a same-name account is created',async t=>{
 const app=createApplication({dir:mkdtempSync(join(tmpdir(),'pm-organization-duplicate-')),password:'organization-test-123'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}/api`;
 const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin',password:'organization-test-123'})});const actor=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
 async function call(path,method='GET',data){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':actor.csrf},body:data===undefined?undefined:JSON.stringify(data)});assert.ok(response.ok,await response.clone().text());return response.json()}
 let state=await call('/organization/units','POST',{name:'学生研究组',category:'校内单位'});const unit=state.units.find(u=>u.name==='学生研究组');
 state=await call('/organization/people','POST',{name:'学生乙',organizationId:unit.id});const archive=state.people.find(p=>p.name==='学生乙');
 await call('/users','POST',{account:'student-b',name:'学生乙',role:'学生',password:'organization-test-123'});
 await call('/users','POST',{account:'student-c',name:'学生丙',role:'学生',password:'organization-test-123'});
 const before=app.db.prepare('SELECT * FROM pm_organization_people WHERE id=?').get(archive.id);
 state=await call('/organization');const matches=state.people.filter(p=>p.name==='学生乙');assert.equal(matches.length,1);assert.equal(matches[0].id,archive.id);assert.equal(matches[0].organizationId,unit.id);assert.equal(matches[0].organizationPerson,true);assert.equal(matches[0].userId,null);
 assert.deepEqual(app.db.prepare('SELECT * FROM pm_organization_people WHERE id=?').get(archive.id),before);
 assert.deepEqual(state.people.filter(p=>!p.organizationId).map(p=>p.name),['学生丙']);
 // A genuinely unassigned archive still appears once, without hiding it.
 state=await call('/organization/people/'+archive.id,'PUT',{name:'学生乙',organizationId:null,revision:archive.organizationRevision});assert.equal(state.people.filter(p=>p.name==='学生乙').length,1);assert.equal(state.people.find(p=>p.name==='学生乙').organizationId,null);
});
