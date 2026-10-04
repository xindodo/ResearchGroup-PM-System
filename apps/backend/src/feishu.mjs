import {randomUUID,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {fail,text,requireAdmin} from './security.mjs';
import {transaction,audit} from './database.mjs';

// Outbound only: no public callbacks, contact-list permission or incoming message access.
export function feishuModule(db,dir,{body,json,fetcher=fetch,worker=true}) {
 db.exec(`CREATE TABLE IF NOT EXISTS pm_feishu_config(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,secret TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS pm_feishu_bindings(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,id_type TEXT NOT NULL,receive_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,UNIQUE(id_type,receive_id));
 CREATE TABLE IF NOT EXISTS pm_feishu_messages(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,person TEXT NOT NULL,project_id TEXT NOT NULL DEFAULT '',task_id TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL,app_id TEXT NOT NULL,id_type TEXT NOT NULL,receive_id TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',message_id TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS pm_feishu_queue ON pm_feishu_messages(status,next_at);`);
 const defaults={appId:'',enabled:false,notifyCreated:true,notifyChanged:true,siteUrl:'https://pm.jtgc.cc'};
 const now=()=>new Date().toISOString(),keyPath=join(dir,'feishu-secret.key');
 function key(create=false){if(!existsSync(keyPath)){if(!create)throw Error('飞书密钥文件缺失');writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});}chmodSync(keyPath,0o600);const value=readFileSync(keyPath);if(value.length!==32)throw Error('飞书密钥文件无效');return value;}
 function encrypt(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(true),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(v=>v.toString('base64')).join('.');}
 function decrypt(value){const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64')),cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');}
 function config(){const row=db.prepare('SELECT * FROM pm_feishu_config WHERE id=1').get();return {...defaults,...(row?JSON.parse(row.payload):{}),revision:row?.revision||0,secret:row?.secret||''};}
 function publicConfig(){const {secret,...value}=config();return {...value,hasSecret:!!secret};}
 function people(){return db.prepare('SELECT u.id,u.name,u.account,u.active,u.role,b.id_type,b.receive_id,b.revision FROM users u LEFT JOIN pm_feishu_bindings b ON b.user_id=u.id ORDER BY u.name').all().map(u=>({...u,active:!!u.active,idType:u.id_type||'open_id',receiveId:u.receive_id||'',revision:u.revision||0}));}
 function logs(){return db.prepare('SELECT id,person,kind,status,attempts,error,created_at AS createdAt,updated_at AS updatedAt FROM pm_feishu_messages ORDER BY created_at DESC,rowid DESC LIMIT 100').all();}
 function saveConfig(input,user){
  const old=config();if(input.revision!==old.revision)fail(409,'飞书配置已变化，请刷新');
  const appId=text(input.appId,'App ID',100,true);if(!/^cli_[a-zA-Z0-9]+$/.test(appId))fail(400,'App ID须为cli_开头的应用标识');
  const siteUrl=text(input.siteUrl,'系统地址',500,true);let url;try{url=new URL(siteUrl)}catch{fail(400,'系统地址无效');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)fail(400,'系统地址须为不含账号和查询参数的HTTPS地址');
  for(const k of ['enabled','notifyCreated','notifyChanged'])if(typeof input[k]!=='boolean')fail(400,'通知开关无效');
  const raw=text(input.appSecret,'App Secret',256);if(old.appId!==appId&&!raw)fail(400,'更换App ID时请填写对应App Secret');
  const secret=raw?encrypt(raw):old.secret;if(!secret)fail(400,'请填写App Secret');
  const value={appId,siteUrl:siteUrl.replace(/\/+$/,''),enabled:input.enabled,notifyCreated:input.notifyCreated,notifyChanged:input.notifyChanged};
  transaction(db,()=>{
   if(old.appId&&old.appId!==appId){db.prepare("UPDATE pm_feishu_messages SET status='已取消',error='应用已更换',updated_at=? WHERE status IN ('待发送','重试中','发送中')").run(now());db.prepare('DELETE FROM pm_feishu_bindings').run();}
   if(old.revision)db.prepare('UPDATE pm_feishu_config SET payload=?,secret=?,revision=revision+1 WHERE id=1').run(JSON.stringify(value),secret);else db.prepare('INSERT INTO pm_feishu_config(id,payload,secret) VALUES(1,?,?)').run(JSON.stringify(value),secret);
   audit(db,user.id,'更新飞书通知配置','feishu',value.enabled?'自动通知已启用':'自动通知已关闭');
  });cachedToken=null;return publicConfig();
 }
 function saveBinding(id,input,user){
  if(!db.prepare('SELECT id FROM users WHERE id=?').get(id))fail(404,'系统账号不存在');
  const old=db.prepare('SELECT * FROM pm_feishu_bindings WHERE user_id=?').get(id);if(input.revision!==(old?.revision||0))fail(409,'飞书绑定已变化，请刷新');
  const receiveId=text(input.receiveId,'飞书接收标识',254),idType=input.idType;
  if(!['open_id','user_id','email'].includes(idType))fail(400,'请选择有效标识类型');
  if(receiveId&&(idType==='open_id'?!/^ou_[a-zA-Z0-9_-]+$/.test(receiveId):idType==='email'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiveId):! /^[a-zA-Z0-9_-]+$/.test(receiveId)))fail(400,'飞书标识格式无效');
  const value=idType==='email'?receiveId.toLowerCase():receiveId;
  if(value&&db.prepare('SELECT user_id FROM pm_feishu_bindings WHERE id_type=? AND receive_id=? AND user_id<>?').get(idType,value,id))fail(409,'该飞书标识已绑定其他账号');
  transaction(db,()=>{if(!value)db.prepare('DELETE FROM pm_feishu_bindings WHERE user_id=?').run(id);else if(old)db.prepare('UPDATE pm_feishu_bindings SET id_type=?,receive_id=?,revision=revision+1 WHERE user_id=?').run(idType,value,id);else db.prepare('INSERT INTO pm_feishu_bindings(user_id,id_type,receive_id) VALUES(?,?,?)').run(id,idType,value);audit(db,user.id,value?'绑定飞书账号':'解除飞书绑定',id);});
  return people();
 }
 function queue(userId,kind,content,p={},taskId='',cfg=config()){
  const u=db.prepare('SELECT id,name,active FROM users WHERE id=?').get(userId);if(!u?.active)return;
  const b=db.prepare('SELECT * FROM pm_feishu_bindings WHERE user_id=?').get(userId),stamp=now(),id=randomUUID();
  db.prepare('INSERT INTO pm_feishu_messages(id,user_id,person,project_id,task_id,kind,app_id,id_type,receive_id,content,status,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,u.id,u.name,p.id||'',taskId,kind,cfg.appId,b?.id_type||'',b?.receive_id||'',content,b?'待发送':'未绑定',b?'':'未绑定飞书账号',stamp,stamp);return id;
 }
 function taskSaved(p,old,task,actor){
  const cfg=config();if(!cfg.enabled||!cfg.secret||(!old&&!cfg.notifyCreated)||(old&&!cfg.notifyChanged))return;
  const value=JSON.parse(task.payload),previous=old&&JSON.parse(old.payload);
  if(old&&old.assignee_id===task.assignee_id&&JSON.stringify(previous)===JSON.stringify(value))return;
  const plan=JSON.parse(p.payload),names=new Map(db.prepare('SELECT id,name FROM users').all().map(u=>[u.id,u.name]));
  const kind=old?'任务变更':'新任务分配',url=new URL(cfg.siteUrl+'/');url.searchParams.set('project',p.id);url.searchParams.set('group','project_milestones');
  const content=`${kind}\n项目：${plan.title}\n任务：${value.title}\n负责人：${names.get(task.assignee_id)||'未填写'}\n参与人员：${(value.participantIds||[]).map(id=>names.get(id)||'未填写').join('、')||'无'}\n开始日期：${value.start}\n截止日期：${value.due}\n状态：${value.state} · ${value.progress}%\n描述：${value.description||'未填写'}\n操作人员：${actor.name}\n查看所属项目任务：${url}`;
  for(const id of new Set([task.assignee_id,...(value.participantIds||[])]))queue(id,kind,content,p,task.id,cfg);
 }
 let cachedToken=null,inFlight=null,closing=false;
 async function request(path,data,token){
  let response,result;try{response=await fetcher('https://open.feishu.cn/open-apis/'+path,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(10000)});result=await response.json();}catch{throw Error('飞书网络连接失败或超时');}
  if(!response.ok||result.code!==0){const code=Number.isInteger(result.code)?result.code:response.status;if([99991663,99991668].includes(code))cachedToken=null;throw Error(`飞书返回错误（${code}），请检查应用权限、可用范围和接收标识`);}return result;
 }
 async function accessToken(cfg){
  if(cachedToken?.appId===cfg.appId&&cachedToken.until>Date.now())return cachedToken.value;
  let secret;try{secret=decrypt(cfg.secret)}catch{throw Error('飞书密钥不可读取，请重新保存App Secret');}
  const value=await request('auth/v3/tenant_access_token/internal',{app_id:cfg.appId,app_secret:secret});
  if(!value.tenant_access_token||!Number.isFinite(value.expire)||value.expire<=0)throw Error('飞书访问凭证响应无效');
  cachedToken={appId:cfg.appId,value:value.tenant_access_token,until:Date.now()+Math.max(0,value.expire-60)*1000};return cachedToken.value;
 }
 async function deliver(row){
  const cfg=config(),binding=db.prepare('SELECT * FROM pm_feishu_bindings WHERE user_id=?').get(row.user_id),user=db.prepare('SELECT active FROM users WHERE id=?').get(row.user_id);
  if(!user?.active||cfg.appId!==row.app_id||!binding||binding.id_type!==row.id_type||binding.receive_id!==row.receive_id){db.prepare("UPDATE pm_feishu_messages SET status='已取消',error='账号已停用或飞书绑定已变更',updated_at=? WHERE id=?").run(now(),row.id);return;}
  if(row.task_id){const task=db.prepare("SELECT assignee_id,payload FROM pm_tasks WHERE id=? AND project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").get(row.task_id,row.project_id);if(!task||!db.prepare('SELECT user_id FROM pm_members WHERE project_id=? AND user_id=?').get(row.project_id,row.user_id)||!new Set([task.assignee_id,...(JSON.parse(task.payload).participantIds||[])]).has(row.user_id)){db.prepare("UPDATE pm_feishu_messages SET status='已取消',error='人员已不参与该任务或项目',updated_at=? WHERE id=?").run(now(),row.id);return;}}
  db.prepare("UPDATE pm_feishu_messages SET status='发送中',attempts=attempts+1,updated_at=? WHERE id=?").run(now(),row.id);
  try{
   const token=await accessToken(cfg),result=await request('im/v1/messages?receive_id_type='+row.id_type,{receive_id:row.receive_id,msg_type:'text',content:JSON.stringify({text:row.content}),uuid:row.id},token);
   if(!result.data?.message_id)throw Error('飞书未返回消息ID');
   db.prepare("UPDATE pm_feishu_messages SET status='已发送',message_id=?,error='',updated_at=? WHERE id=? AND status='发送中'").run(result.data.message_id,now(),row.id);
  }catch(e){const attempts=row.attempts+1;db.prepare("UPDATE pm_feishu_messages SET status=?,error=?,next_at=?,updated_at=? WHERE id=? AND status='发送中'").run(attempts>=5?'失败':'重试中',e.message,Date.now()+Math.min(300000,30000*2**(attempts-1)),now(),row.id);}
 }
 async function drain(){if(closing)return;if(inFlight)return inFlight;inFlight=(async()=>{if(!config().enabled)return;for(let i=0;i<20&&!closing&&config().enabled;i++){const row=db.prepare("SELECT * FROM pm_feishu_messages WHERE status IN ('待发送','重试中') AND next_at<=? ORDER BY rowid LIMIT 1").get(Date.now());if(!row)break;await deliver(row);}})();try{await inFlight}finally{inFlight=null;}}
 // A stopped process can leave an in-flight entry; the same UUID is reused on recovery.
 db.prepare("UPDATE pm_feishu_messages SET status='重试中',next_at=?,error='服务重启后恢复发送' WHERE status='发送中'").run(Date.now());
 const timer=worker?setInterval(()=>void drain().catch(()=>{}),5000):null;timer?.unref();
 async function route(req,res,path,method,user){
  if(!path.startsWith('/api/feishu'))return false;requireAdmin(user);
  if(path==='/api/feishu'&&method==='GET'){json(res,200,{config:publicConfig(),people:people(),logs:logs()});return true;}
  const input=await body(req);
  if(path==='/api/feishu/config'&&method==='PUT'){json(res,200,saveConfig(input,user));return true;}
  const binding=/^\/api\/feishu\/bindings\/([\w-]+)$/.exec(path);
  if(binding&&method==='PUT'){json(res,200,saveBinding(binding[1],input,user));return true;}
  if(path==='/api/feishu/test'&&method==='POST'){
   const cfg=config();if(!cfg.appId||!cfg.secret)fail(400,'请先保存飞书应用配置');
   const id=text(input.userId,'测试接收人',80,true);if(!db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(id))fail(400,'请选择启用中的账号');if(!db.prepare('SELECT user_id FROM pm_feishu_bindings WHERE user_id=?').get(id))fail(400,'请先绑定该人员的飞书账号');
   const message=queue(id,'连接测试','项目管理系统飞书通知测试\n收到此消息表示应用配置和人员绑定有效。',{},'',cfg);await deliver(db.prepare('SELECT * FROM pm_feishu_messages WHERE id=?').get(message));
   const row=db.prepare('SELECT status,error FROM pm_feishu_messages WHERE id=?').get(message);
   // A test failure is terminal; it must not turn into an unexpected later notification.
   if(row.status!=='已发送')db.prepare("UPDATE pm_feishu_messages SET status='失败' WHERE id=? AND status='重试中'").run(message);
   audit(db,user.id,'测试飞书通知',id,row.status==='已发送'?'成功':'失败');json(res,200,{ok:row.status==='已发送',error:row.error,logs:logs()});return true;
  }
  const retry=/^\/api\/feishu\/messages\/([\w-]+)\/retry$/.exec(path);
  if(retry&&method==='POST'){
   const cfg=config();if(!cfg.enabled)fail(400,'请先启用自动通知');const row=db.prepare('SELECT * FROM pm_feishu_messages WHERE id=?').get(retry[1]);if(!row)fail(404,'通知记录不存在');if(!['失败','未绑定'].includes(row.status))fail(409,'该通知无需重试');if(cfg.appId!==row.app_id)fail(409,'该记录属于旧应用，不能重发');
   const u=db.prepare('SELECT active FROM users WHERE id=?').get(row.user_id),b=db.prepare('SELECT * FROM pm_feishu_bindings WHERE user_id=?').get(row.user_id);if(!u?.active||!b)fail(400,'请先启用账号并绑定飞书');
   db.prepare("UPDATE pm_feishu_messages SET status='待发送',attempts=0,next_at=0,error='',id_type=?,receive_id=?,updated_at=? WHERE id=?").run(b.id_type,b.receive_id,now(),row.id);audit(db,user.id,'重试飞书通知',row.id);json(res,200,{logs:logs()});return true;
  }
  fail(404,'飞书接口不存在');
 }
 return {route,taskSaved,drain,close:async()=>{closing=true;if(timer)clearInterval(timer);if(inFlight)await inFlight;}};
}
