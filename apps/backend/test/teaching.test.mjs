import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/database.mjs';
import {createApplication} from '../src/server.mjs';

test('teaching categories upgrade is additive and does not reset administrator edits',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jtgc-teaching-migration-'));let db=openDatabase(dir);
 db.prepare("DELETE FROM dictionaries WHERE scope='teaching'").run();
 db.prepare('DELETE FROM migrations WHERE version=5').run();
 const old=db.prepare('SELECT * FROM dictionaries ORDER BY id').all();
 db.close();db=openDatabase(dir);
 assert.deepEqual(db.prepare("SELECT * FROM dictionaries WHERE scope!='teaching' ORDER BY id").all(),old);
 assert.deepEqual(db.prepare("SELECT name FROM dictionaries WHERE scope='teaching' ORDER BY position").all().map(r=>r.name),['学校工作','学院工作','交工系工作']);
 db.prepare("UPDATE dictionaries SET name='自定义工作' WHERE id='teaching-0'").run();
 db.prepare("DELETE FROM dictionaries WHERE id='teaching-1'").run();
 db.close();db=openDatabase(dir);
 assert.deepEqual(db.prepare("SELECT name FROM dictionaries WHERE scope='teaching' ORDER BY position").all().map(r=>r.name),['自定义工作','交工系工作']);db.close();
});

test('teaching work uses regular publishing, validation, CRUD and batch import',async t=>{
 const app=createApplication({dir:mkdtempSync(join(tmpdir(),'jtgc-teaching-api-')),password:'test-password-123'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin',password:'test-password-123'})});const session=await login.json();
 const headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
 const call=(path,body,method='POST')=>fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
 await call('/users',{account:'teacher',name:'工作老师',role:'导师',password:'test-password-123'});
 const payload={kind:'teaching',title:'学校教学检查',category:'学校工作',participants:['工作老师','外校教师'],start:'2026-09-22',summary:'**教学工作**'};
 const res=await call('/records',payload);assert.equal(res.status,201);const saved=await res.json();assert.equal(saved.state,'published');
 assert.deepEqual(saved.participants,['工作老师','外校教师']);assert.equal(saved.owner,'');
 // Legacy records can still be read and edited without losing their old owner.
 const legacy={...payload,owner:'工作老师',participants:[]};
 app.db.prepare('UPDATE records SET payload=? WHERE id=?').run(JSON.stringify(legacy),saved.id);
 const legacyResponse=await fetch(base+'/records/'+saved.id,{headers});
 const normalized=await legacyResponse.json();assert.deepEqual(normalized.participants,['工作老师']);assert.equal(normalized.owner,'');
 assert.deepEqual(JSON.parse(app.db.prepare('SELECT payload FROM records WHERE id=?').get(saved.id).payload),legacy);
 assert.equal((await call('/records',{...payload,category:'其他未维护类别'})).status,400);
 assert.equal((await call('/records',{...payload,participants:[]})).status,400);
 assert.equal((await call('/records/'+saved.id,{...saved,title:'修改后的工作'},'PUT')).status,200);
 assert.equal((await call('/import',{records:[{...payload,category:'学院工作'},{...payload,category:'交工系工作'}]})).status,201);
 assert.equal((await call('/records/'+saved.id,{revision:saved.revision+1},'DELETE')).status,200);
});
