import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createApplication } from '../src/server.mjs';
import { categories } from '../src/database.mjs';
const password='validation-password-123';
async function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'jtgc-validation-')),app=createApplication({dir,password});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function req(path,method='GET',data,session){const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return{status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')}}
  const result=await req('/login','POST',{account:'admin',password});const admin={...result.value,cookie:result.cookie.split(';')[0]};
  return{app,dir,req,admin};
}
test('all modules: validation, ordered fields, soft delete and restore',async t=>{
  const{req,admin}=await fixture(t);
  await req('/users','POST',{account:'advisor',name:'指导老师',role:'导师',password},admin);
  for(const[kind,values]of Object.entries(categories)){
    const data={kind,title:kind,category:values[0],owner:'系统管理员',participants:['外部甲','系统管理员'],major:'交通工程',version:'2026版',materialStatus:'现行',year:'2026',start:'2026-01-01',end:'2026-12-31',achievementSource:'教育部',achievementGrade:'一等奖'};
    if(kind==='students'){data.owner='学生甲';data.advisor='指导老师'}
    const created=await req('/records','POST',data,admin);assert.equal(created.status,201);const r=created.value;
    assert.equal(r.achievementSource,'教育部');assert.equal(r.achievementGrade,'一等奖');
    if(kind!=='news')assert.deepEqual(r.participants,['外部甲','系统管理员']);
    const bad=await req(`/records/${r.id}`,'PUT',{...r,start:'2026-02-30'},admin);assert.equal(bad.status,400);
    assert.equal((await req(`/records/${r.id}`,'DELETE',{revision:r.revision},admin)).status,200);
    assert.equal((await req(`/records/${r.id}`,'GET',undefined,admin)).status,404);
    assert.equal((await req('/trash','GET',undefined,admin)).value.length,1);
    assert.equal((await req(`/trash/${r.id}/restore`,'POST',{},admin)).status,200);
    assert.equal((await req(`/records/${r.id}`,'GET',undefined,admin)).status,200);
  }
});
test('account rename updates associations; referenced accounts cannot be deleted; password reset revokes sessions',async t=>{
  const{req,admin}=await fixture(t);
  const created=await req('/users','POST',{account:'person',name:'原姓名',role:'导师',password},admin);assert.equal(created.status,201);
  let target=created.value;
  const login=await req('/login','POST',{account:'person',password});const actor={...login.value,cookie:login.cookie.split(';')[0]};
  const row=(await req('/records','POST',{kind:'research',title:'关联测试',category:'论文',owner:'原姓名',participants:['原姓名','外部人员'],year:'2026'},admin)).value;
  target=(await req(`/users/${target.id}`,'PUT',{...target,name:'新姓名'},admin)).value;
  const updated=(await req(`/records/${row.id}`,'GET',undefined,admin)).value;
  assert.equal(updated.owner,'新姓名');assert.deepEqual(updated.participants,['新姓名','外部人员']);
  assert.equal((await req(`/users/${target.id}`,'DELETE',{},admin)).status,409);
  assert.equal((await req('/session','GET',undefined,actor)).status,401);
  assert.equal((await req(`/users/${target.id}`,'PUT',{...target,password:'changed-password-123'},admin)).status,200);
  assert.equal((await req('/login','POST',{account:'person',password})).status,401);
  assert.equal((await req('/login','POST',{account:'person',password:'changed-password-123'})).status,200);
  for(let i=0;i<5;i++)assert.equal((await req('/login','POST',{account:'unknown',password:'wrong'})).status,401);
  assert.equal((await req('/login','POST',{account:'unknown',password:'wrong'})).status,429);
});
test('file validation blocks unsafe images and foreign file references; dictionaries persist across reopen',async t=>{
  const{req,admin,app}=await fixture(t);
  const data={kind:'news',title:'图片校验',category:'教务通知'};
  assert.equal((await req('/records','POST',{...data,images:[{name:'fake.png',data:'data:image/png;base64,PHNjcmlwdD4='}]},admin)).status,400);
  assert.equal((await req('/records','POST',{...data,attachments:[{name:'hack',data:'file:///etc/passwd'}]},admin)).status,400);
  assert.equal((await req('/records','POST',{...data,attachments:[{name:'hack',data:'/api/files/unknown'}]},admin)).status,400);
  const image={name:'one.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6fZsAAAAASUVORK5CYII='};
  const r=(await req('/records','POST',{...data,images:[image]},admin)).value;assert.equal(r.images[0].type,'image/png');
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM files').get().n,1);
  const dict=(await req('/dictionaries','GET',undefined,admin)).value.news.find(d=>d.name==='教务通知');
  assert.equal((await req(`/dictionaries/${dict.id}`,'PUT',{name:'自定义教务通知'},admin)).status,200);
  assert.equal((await req(`/records/${r.id}`,'GET',undefined,admin)).value.category,'自定义教务通知');
  assert.equal((await req('/records','POST',data,admin)).status,400);
});
test('online backup contains coherent database and file tree',async t=>{
  const{req,admin,dir}=await fixture(t);
  const r=await req('/records','POST',{kind:'news',title:'备份内容',category:'教务通知',attachments:[{name:'backup.txt',data:'data:text/plain;base64,dGVzdA=='}]},admin);assert.equal(r.status,201);
  const command=spawnSync(process.execPath,['src/backup.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,JTGC_DATA_DIR:dir},encoding:'utf8'});
  assert.equal(command.status,0,command.stderr);const target=command.stdout.trim().replace('备份完成：','');
  assert.ok(existsSync(join(target,'jtgc.sqlite')));assert.ok(existsSync(join(target,'uploads')));
  const restored=createApplication({dir:target,password});assert.equal(restored.db.prepare('SELECT count(*) AS n FROM records').get().n,1);restored.db.close();
});
