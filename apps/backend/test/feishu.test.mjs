import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../src/server.mjs';

async function setup(t){
 const dir=mkdtempSync(join(tmpdir(),'pm-feishu-')),calls=[];let mode='ok';
 const fetcher=async(url,options)=>{const data=JSON.parse(options.body);calls.push({url,data,headers:options.headers});if(mode==='network')throw Error('DO NOT EXPOSE SECRET');if(url.includes('/auth/'))return Response.json({code:0,tenant_access_token:'fake-token',expire:7200});if(mode==='fail')return Response.json({code:230013,msg:'DO NOT EXPOSE SECRET'});return Response.json({code:0,data:{message_id:'om_fake'}});};
 let app=createApplication({dir,password:'feishu-test-password',feishuFetch:fetcher,feishuWorker:false}),base;
 async function listen(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api`;}
 await listen();t.after(()=>app.close());
 async function call(path,actor,method='GET',data){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function login(account){const r=await call('/login',null,'POST',{account,password:'feishu-test-password'});assert.equal(r.status,200);return {...r.value,cookie:r.cookie};}
 const admin=await login('admin');
 async function add(name){const r=await call('/users',admin,'POST',{account:name,name,role:'学生',password:'feishu-test-password'});assert.equal(r.status,201);return login(name);}
 async function config(patch={}){const r=await call('/feishu',admin);const saved=await call('/feishu/config',admin,'PUT',{...r.value.config,appId:'cli_test123',appSecret:r.value.config.hasSecret?'':'dummy-app-secret',...patch});assert.equal(saved.status,200);return saved.value;}
 async function bind(user,id='ou_'+user.user.id.replaceAll('-','')){const data=(await call('/feishu',admin)).value;const p=data.people.find(p=>p.id===user.user.id);return call('/feishu/bindings/'+user.user.id,admin,'PUT',{idType:'open_id',receiveId:id,revision:p.revision});}
 return {get app(){return app},call,admin,add,config,bind,calls,setMode(v){mode=v},async reopen(){await app.close();app=createApplication({dir,password:'unused-password',feishuFetch:fetcher,feishuWorker:false});await listen();},dir,login};
}

test('Feishu settings are admin-only, secrets encrypted and retained, bindings unique and tests explicit',async t=>{
 const x=await setup(t),student=await x.add('feishu-student');assert.equal((await x.call('/feishu',student)).status,403);assert.equal((await x.call('/feishu',null)).status,401);
 const cfg=await x.config();assert.equal(cfg.enabled,false);assert.equal(cfg.hasSecret,true);assert.ok(!JSON.stringify((await x.call('/feishu',x.admin)).value).includes('dummy-app-secret'));
 assert.ok(!x.app.db.prepare('SELECT secret FROM pm_feishu_config').get().secret.includes('dummy-app-secret'));assert.equal(readFileSync(join(x.dir,'feishu-secret.key')).length,32);
 assert.equal((await x.call('/feishu/config',x.admin,'PUT',{...cfg,appSecret:'',revision:0})).status,409);
 assert.equal((await x.call('/feishu/config',x.admin,'PUT',{...cfg,siteUrl:'http://example.com'})).status,400);
 assert.equal((await x.bind(x.admin,'ou_same')).status,200);assert.equal((await x.bind(student,'ou_same')).status,409);
 assert.equal((await x.call('/feishu/test',x.admin,'POST',{userId:student.user.id})).status,400);assert.equal(x.calls.length,0);
 assert.equal((await x.call('/feishu/test',student,'POST',{userId:x.admin.user.id})).status,403);
 const result=await x.call('/feishu/test',x.admin,'POST',{userId:x.admin.user.id});assert.equal(result.value.ok,true);assert.equal(x.calls.length,2);assert.equal(x.calls[1].data.receive_id,'ou_same');assert.equal(x.calls[1].data.msg_type,'text');assert.ok(JSON.parse(x.calls[1].data.content).text.includes('通知测试'));
 await x.config();assert.equal(x.app.db.prepare('SELECT secret FROM pm_feishu_config').get().secret.length>0,true);
 await x.reopen();const again=await x.call('/feishu/test',x.admin,'POST',{userId:x.admin.user.id});assert.equal(again.value.ok,true);assert.equal(x.calls.at(-2).data.app_secret,'dummy-app-secret');
 x.setMode('fail');const failed=await x.call('/feishu/test',x.admin,'POST',{userId:x.admin.user.id});assert.equal(failed.value.ok,false);assert.ok(failed.value.error.includes('230013'));assert.ok(!JSON.stringify(failed).includes('DO NOT EXPOSE'));assert.equal(x.app.db.prepare("SELECT status FROM pm_feishu_messages WHERE id=?").get(failed.value.logs[0].id).status,'失败');
});

test('task notifications commit atomically, deduplicate recipients and retry without blocking task saves',async t=>{
 const x=await setup(t),a=await x.add('feishu-a'),b=await x.add('feishu-b');await x.config({enabled:true});await x.bind(a);await x.bind(b);
 let p=(await x.call('/pm/projects',x.admin,'POST',{title:'飞书项目',ownerId:a.user.id,members:[{userId:b.user.id,role:'项目成员'}]})).value;
 const task={title:'飞书任务',assigneeId:a.user.id,participantIds:[a.user.id,b.user.id],start:'2026-10-01',due:'2026-10-10',state:'待开始',progress:0,description:'研究内容'};
 const created=await x.call(`/pm/projects/${p.id}/tasks`,x.admin,'POST',task);assert.equal(created.status,201);p=created.value;const saved=p.tasks[0];
 assert.equal(x.calls.length,0);assert.equal(x.app.db.prepare('SELECT count(*) AS n FROM pm_feishu_messages').get().n,2);
 const stale=await x.call(`/pm/projects/${p.id}/tasks/${saved.id}`,x.admin,'PUT',{...saved,revision:0});assert.equal(stale.status,409);assert.equal(x.app.db.prepare('SELECT count(*) AS n FROM pm_feishu_messages').get().n,2);
 x.setMode('fail');await x.app.feishu.drain();assert.equal(x.app.db.prepare("SELECT count(*) AS n FROM pm_feishu_messages WHERE status='重试中'").get().n,2);assert.equal(x.app.db.prepare('SELECT payload FROM pm_tasks WHERE id=?').get(saved.id).payload.includes('研究内容'),true);
 const first=x.calls.find(c=>c.url.includes('/messages'));const uuid=first.data.uuid;assert.ok(JSON.parse(first.data.content).text.includes('group=project_milestones'));
 x.setMode('ok');x.app.db.prepare("UPDATE pm_feishu_messages SET next_at=0").run();await x.app.feishu.drain();assert.equal(x.app.db.prepare("SELECT count(*) AS n FROM pm_feishu_messages WHERE status='已发送'").get().n,2);assert.equal(x.calls.filter(c=>c.data.uuid===uuid).length,2);
 const before=x.calls.length;await x.app.feishu.drain();assert.equal(x.calls.length,before);
 assert.equal((await x.call(`/pm/projects/${p.id}/tasks/${saved.id}`,x.admin,'PUT',saved)).status,200);assert.equal(x.app.db.prepare('SELECT count(*) AS n FROM pm_feishu_messages').get().n,2);
 const current=(await x.call('/pm/projects/'+p.id,x.admin)).value.tasks[0];assert.equal((await x.call(`/pm/projects/${p.id}/tasks/${saved.id}`,x.admin,'PUT',{...current,due:'2026-10-11'})).status,200);assert.equal(x.app.db.prepare('SELECT count(*) AS n FROM pm_feishu_messages').get().n,4);
 await x.config({enabled:false});const calls=x.calls.length;await x.app.feishu.drain();assert.equal(x.calls.length,calls);
 await x.config({enabled:true});await x.bind(b,'ou_newBinding');await x.app.feishu.drain();assert.equal(x.app.db.prepare("SELECT count(*) AS n FROM pm_feishu_messages WHERE status='已取消'").get().n,1);
 const updated=(await x.call('/pm/projects/'+p.id,x.admin)).value.tasks[0];await x.call(`/pm/projects/${p.id}/tasks/${saved.id}`,x.admin,'PUT',{...updated,title:'更改应用前的任务'});
 await x.config({appId:'cli_newapp',appSecret:'new-dummy-secret'});assert.equal(x.app.db.prepare('SELECT count(*) AS n FROM pm_feishu_bindings').get().n,0);assert.equal(x.app.db.prepare("SELECT count(*) AS n FROM pm_feishu_messages WHERE status='待发送'").get().n,0);
});

test('missing bindings, disabled accounts, recovery and maximum attempts are visible and safe',async t=>{
 const x=await setup(t),a=await x.add('feishu-missing');await x.config({enabled:true});
 let p=(await x.call('/pm/projects',x.admin,'POST',{title:'待绑定项目',members:[{userId:a.user.id,role:'项目成员'}]})).value;
 p=(await x.call(`/pm/projects/${p.id}/tasks`,x.admin,'POST',{title:'未绑定任务',assigneeId:a.user.id,start:'2026-10-01',due:'2026-10-10',state:'待开始',progress:0})).value;
 const row=x.app.db.prepare('SELECT * FROM pm_feishu_messages').get();assert.equal(row.status,'未绑定');assert.equal((await x.call('/feishu/messages/'+row.id+'/retry',x.admin,'POST',{})).status,400);
 await x.bind(a);assert.equal((await x.call('/feishu/messages/'+row.id+'/retry',x.admin,'POST',{})).status,200);
 x.setMode('network');for(let i=0;i<5;i++){x.app.db.prepare('UPDATE pm_feishu_messages SET next_at=0').run();await x.app.feishu.drain();}const failed=x.app.db.prepare('SELECT * FROM pm_feishu_messages').get();assert.equal(failed.status,'失败');assert.equal(failed.attempts,5);assert.ok(!failed.error.includes('DO NOT EXPOSE'));
 assert.equal((await x.call('/feishu/messages/'+row.id+'/retry',a,'POST',{})).status,403);
 x.app.db.prepare("UPDATE pm_feishu_messages SET status='发送中'").run();await x.reopen();assert.equal(x.app.db.prepare('SELECT status FROM pm_feishu_messages').get().status,'重试中');x.setMode('ok');await x.app.feishu.drain();assert.equal(x.app.db.prepare('SELECT id,status FROM pm_feishu_messages').get().id,row.id);assert.equal(x.app.db.prepare('SELECT status FROM pm_feishu_messages').get().status,'已发送');
 const task=(await x.call('/pm/projects/'+p.id,x.admin)).value.tasks[0];await x.call(`/pm/projects/${p.id}/tasks/${task.id}`,x.admin,'PUT',{...task,description:'停用后不发送'});
 x.app.db.prepare('UPDATE users SET active=0 WHERE id=?').run(a.user.id);const before=x.calls.length;await x.app.feishu.drain();assert.equal(x.calls.length,before);assert.equal(x.app.db.prepare("SELECT count(*) AS n FROM pm_feishu_messages WHERE status='已取消'").get().n,1);
});
