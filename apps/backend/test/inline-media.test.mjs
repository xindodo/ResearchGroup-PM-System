import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';

test('inline media is bound transactionally, permissions preserved, videos support range and removed references are denied',async t=>{
  const app=createApplication({dir:mkdtempSync(join(tmpdir(),'jtgc-inline-')),password:'test-password-123'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}/api`;
  async function call(path,method='GET',data,actor){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return{status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}}
  const login=async account=>{const r=await call('/login','POST',{account,password:'test-password-123'});return {...r.value,cookie:r.cookie}};
  const admin=await login('admin');
  await call('/users','POST',{account:'reader',name:'读者',role:'导师',password:'test-password-123'},admin);
  const reader=await login('reader');
  const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(100)]);
  async function upload(){const r=await fetch(base+'/uploads?name=video.mp4',{method:'POST',headers:{Cookie:admin.cookie,'X-CSRF-Token':admin.csrf,'Content-Type':'application/octet-stream'},body:bytes});assert.equal(r.status,201);return r.json()}
  async function get(file,actor,range){const r=await fetch(base+file.data.replace('/api',''),{headers:{...(actor?{Cookie:actor.cookie}:{}),...(range?{Range:range}:{})}});await r.arrayBuffer();return r}
  const video=await upload();assert.equal(video.type,'video/mp4');
  assert.equal((await get(video,admin)).status,200);assert.equal((await get(video,reader)).status,404);assert.equal((await get(video)).status,401);
  const body=`<video src="${video.data}" controls></video>`;
  const record=(await call('/records','POST',{kind:'news',category:'教务通知',title:'视频',summary:body},admin)).value;
  assert.equal((await get(video,reader)).status,200);
  const ranged=await get(video,reader,'bytes=0-9');assert.equal(ranged.status,206);assert.equal(ranged.headers.get('content-length'),'10');assert.match(ranged.headers.get('content-disposition'),/^inline/);
  assert.equal((await get(video,reader,'bytes=99999-')).status,416);
  assert.equal((await call('/records','POST',{kind:'news',category:'教务通知',title:'复制他人附件',summary:body},reader)).status,400);
  assert.equal((await call(`/records/${record.id}`,'PUT',{...record,summary:''},admin)).status,200);
  assert.equal((await get(video,reader)).status,404);
  const personVideo=await upload();const person=(await call('/bootstrap','GET',undefined,admin)).value.personnel.find(p=>p.id===reader.user.id);
  const updated=await call(`/users/${person.id}/profile`,'PUT',{...person,summary:`<video src="${personVideo.data}" controls></video>`},admin);
  assert.equal(updated.status,200);assert.equal((await get(personVideo,reader)).status,200);
  assert.equal((await call(`/users/${person.id}/profile`,'PUT',{...updated.value,summary:''},admin)).status,200);
  assert.equal((await get(personVideo,reader)).status,404);
})
