import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';
import {categories} from '../src/database.mjs';
import {canEdit,canDelete} from '../src/security.mjs';

test('all department roles edit published records, without widening deletion or guest access',()=>{
 const record={creator:'another-user',state:'published',deleted:0};
 for(const role of ['导师','学生','系统管理员'])assert.equal(canEdit({id:'u',role},record),true);
 assert.equal(canEdit({id:'u',role:'只读访客'},record),false);
 assert.equal(canEdit({id:'u',role:'导师'},{...record,deleted:1}),false);
 assert.equal(canEdit({id:'u',role:'导师'},{...record,state:'pending'}),false);
 assert.equal(canDelete({id:'u',role:'导师'},record),false);
});

test('unrelated teacher edits every business module and attaches files; stale revisions and guest writes blocked',async t=>{
 const app=createApplication({dir:mkdtempSync(join(tmpdir(),'jtgc-shared-edit-')),password:'test-password-123'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 async function login(account){const res=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account,password:'test-password-123'})});const data=await res.json();return {'Content-Type':'application/json',Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrf};}
 const admin=await login('admin');
 const call=(path,method,body,headers)=>fetch(base+path,{method,headers,body:JSON.stringify(body)});
 for(const [account,name,role] of [['teacher','协作教师','导师'],['guest','只读用户','只读访客']])assert.equal((await call('/users','POST',{account,name,role,password:'test-password-123'},admin)).status,201);
 const teacher=await login('teacher'),guest=await login('guest');
 for(const [kind,values] of Object.entries(categories)){
   const payload={kind,title:kind,category:values[0],owner:kind==='students'?'学生甲':'协作教师',advisor:'协作教师',participants:['其他参与人'],major:'交通工程',version:'2026',materialStatus:'现行'};
   const created=await call('/records','POST',payload,admin);assert.equal(created.status,201,kind);const record=await created.json();
   const edited=await call('/records/'+record.id,'PUT',{...record,summary:'协作修改',attachments:[{name:'协作附件.txt',data:'data:text/plain;base64,aGVsbG8='}]},teacher);
   assert.equal(edited.status,200,kind);const saved=await edited.json();assert.equal(saved.creator,record.creator);assert.equal(saved.attachments.length,1);
   assert.equal((await call('/records/'+record.id,'PUT',record,teacher)).status,409);
   assert.equal((await call('/records/'+record.id,'PUT',saved,guest)).status,403);
   assert.equal((await call('/records/'+record.id,'DELETE',{revision:saved.revision},teacher)).status,403);
 }
});
