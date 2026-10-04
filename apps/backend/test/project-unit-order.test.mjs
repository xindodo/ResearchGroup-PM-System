import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';

test('administrator unit order is shared, persistent and stable across renames',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-unit-order-')),password='unit-order-password-123';let app=createApplication({dir,password});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 async function call(path,actor,method='GET',data){const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api`+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(account){const r=await call('/login',null,'POST',{account,password});return {...r.value,cookie:r.cookie}}
 const admin=await login('admin');await call('/users',admin,'POST',{account:'student',name:'排序学生',role:'学生',password});const student=await login('student');
 for(const name of ['甲课题组','乙课题组'])assert.equal((await call('/pm/options',admin,'POST',{scope:'units',name})).status,201);
 const initial=(await call('/pm/unit-order',admin)).value,ids=initial.units.map(u=>u.id).reverse();
 assert.equal((await call('/pm/unit-order',student,'PUT',{revision:0,ids})).status,403);
 assert.equal((await call('/pm/unit-order',admin,'PUT',{revision:0,ids:[ids[0],ids[0]]})).status,400);
 const saved=await call('/pm/unit-order',admin,'PUT',{revision:0,ids});assert.equal(saved.status,200);assert.deepEqual(saved.value.units.map(u=>u.id),ids);
 assert.deepEqual((await call('/pm/unit-order',student)).value,saved.value);
 assert.equal((await call('/pm/unit-order',admin,'PUT',{revision:0,ids})).status,409);
 const option=(await call('/pm/options',admin)).value.find(u=>u.id===ids[0]);await call('/pm/options/'+option.id,admin,'PUT',{revision:option.revision,name:'改名课题组'});
 assert.equal((await call('/pm/unit-order',student)).value.units[0].name,'改名课题组');
 await app.close();app=createApplication({dir,password});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 assert.deepEqual((await call('/pm/unit-order',await login('student'))).value.units.map(u=>u.id),ids);
});
