import {randomUUID} from 'node:crypto';
import {transaction,audit} from './database.mjs';
import {fail,text,date,isReviewer} from './security.mjs';
import {saveFiles} from './files.mjs';
import {bindInlineMedia} from './inline-media.mjs';

export function organizationModule(db,dir,body,json,profile){
 db.exec(`CREATE TABLE IF NOT EXISTS pm_organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,category TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS pm_organization_people(id TEXT PRIMARY KEY,user_id TEXT UNIQUE REFERENCES users(id),organization_id TEXT REFERENCES pm_organizations(id),name TEXT NOT NULL,profile TEXT NOT NULL DEFAULT '{}',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);`);
 if(!db.prepare('SELECT version FROM migrations WHERE version=7').get())transaction(db,()=>{
  for(const {name} of db.prepare("SELECT DISTINCT name FROM pm_options WHERE scope IN ('units','participantUnits')").all())db.prepare('INSERT OR IGNORE INTO pm_organizations(id,name,category) VALUES(?,?,?)').run(randomUUID(),name,'校内单位');
  db.prepare('INSERT INTO migrations VALUES(7,?)').run(new Date().toISOString());
 });
 const now=()=>new Date().toISOString();
 const account=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 function personDto(row){
  const user=row.user_id&&account(row.user_id);
  return {...(user?profile(user):{...JSON.parse(row.profile),id:row.id,name:row.name,active:true,role:'人员档案',revision:row.revision,createdAt:row.created_at,attachments:JSON.parse(row.profile).attachments||[],images:JSON.parse(row.profile).images||[]}),organizationId:row.organization_id,userId:row.user_id,organizationRevision:row.revision,organizationPerson:!user};
 }
 function snapshot(){
  const people=db.prepare('SELECT * FROM pm_organization_people ORDER BY created_at,id').all().map(personDto);
  const ids=new Set(people.map(person=>person.userId));
  // Independent personnel can precede a same-name login account. Keep their
  // stable archive ID and profile instead of adding a second unassigned row.
  const archiveNames=new Set(people.filter(person=>!person.userId).map(person=>person.name));
  for(const user of db.prepare("SELECT * FROM users WHERE role NOT IN ('系统管理员','只读访客') ORDER BY created_at").all()){
   if(!ids.has(user.id)&&!archiveNames.has(user.name))people.push({...profile(user),userId:user.id,organizationId:null,organizationRevision:0,organizationPerson:false});
  }
  return {units:db.prepare('SELECT * FROM pm_organizations ORDER BY name,id').all(),people};
 }

 function syncOptions(old,name){
  for(const scope of ['units','participantUnits']){
   const option=old&&db.prepare('SELECT * FROM pm_options WHERE scope=? AND name=?').get(scope,old);
   const duplicate=db.prepare('SELECT * FROM pm_options WHERE scope=? AND name=?').get(scope,name);
   if(option&&option.name!==name){if(duplicate)db.prepare('DELETE FROM pm_options WHERE id=?').run(option.id);else db.prepare('UPDATE pm_options SET name=?,revision=revision+1 WHERE id=?').run(name,option.id);}
   else if(!duplicate)db.prepare('INSERT INTO pm_options(id,scope,name) VALUES(?,?,?)').run(randomUUID(),scope,name);
  }
 }
 async function route(req,res,path,method,user){
  if(!path.startsWith('/api/organization'))return false;
  if(path==='/api/organization'&&method==='GET'){json(res,200,snapshot());return true;}
  if(!isReviewer(user))fail(403,'只有管理员可维护单位和人员档案');
  const input=await body(req),unitMatch=/^\/api\/organization\/units(?:\/([\w-]+))?$/.exec(path),personMatch=/^\/api\/organization\/people(?:\/([\w-]+)(?:\/(profile))?)?$/.exec(path);
  if(!unitMatch&&!personMatch)fail(404,'组织接口不存在');
  const result=transaction(db,()=>{
   if(unitMatch){
    const old=unitMatch[1]&&db.prepare('SELECT * FROM pm_organizations WHERE id=?').get(unitMatch[1]);
    if(unitMatch[1]&&!old)fail(404,'单位不存在');if(old&&input.revision!==old.revision)fail(409,'单位已变化，请刷新');
    if(method==='DELETE'&&old){
     if(db.prepare('SELECT id FROM pm_organization_people WHERE organization_id=? LIMIT 1').get(old.id))fail(409,'单位还有人员，请先移出人员');
     if(db.prepare('SELECT payload FROM pm_projects').all().some(p=>{const v=JSON.parse(p.payload);return v.unit===old.name||(v.units||[]).some(x=>x.name===old.name)}))fail(409,'单位正在被项目使用，不能删除');
     db.prepare("DELETE FROM pm_options WHERE scope IN ('units','participantUnits') AND name=?").run(old.name);db.prepare('DELETE FROM pm_organizations WHERE id=?').run(old.id);audit(db,user.id,'删除组织单位',old.id,old.name);
    }else if(method==='POST'&&!old||method==='PUT'&&old){
     const name=text(input.name,'单位名称',200,true),category=input.category;if(!['校内单位','其他高校','科研院所','其他企业','校外单位'].includes(category))fail(400,'请选择单位分类');
     if(db.prepare('SELECT id FROM pm_organizations WHERE name=? AND id<>?').get(name,old?.id||''))fail(409,'单位名称已存在');
     const id=old?.id||randomUUID();if(old)db.prepare('UPDATE pm_organizations SET name=?,category=?,revision=revision+1 WHERE id=?').run(name,category,id);else db.prepare('INSERT INTO pm_organizations(id,name,category) VALUES(?,?,?)').run(id,name,category);
     syncOptions(old?.name,name);
     if(old&&old.name!==name)for(const project of db.prepare('SELECT * FROM pm_projects').all()){
      const value=JSON.parse(project.payload);if(value.unit!==old.name&&!(value.units||[]).some(x=>x.name===old.name))continue;
      if(value.unit===old.name)value.unit=name;value.units=(value.units||[]).map(x=>x.name===old.name?{...x,name}:x);
      db.prepare('UPDATE pm_projects SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(value),now(),project.id);
      db.prepare('INSERT INTO pm_events(project_id,actor_id,action,detail,created_at) VALUES(?,?,?,?,?)').run(project.id,user.id,'更新组织单位',`${old.name} → ${name}`,now());
     }
     audit(db,user.id,old?'修改组织单位':'新增组织单位',id,name);
    }else fail(405,'不支持此方法');
   }else{
    let old=personMatch[1]&&db.prepare('SELECT * FROM pm_organization_people WHERE id=? OR user_id=?').get(personMatch[1],personMatch[1]);
    const linked=!old&&personMatch[1]&&account(personMatch[1]);
    if(personMatch[1]&&!old&&!linked)fail(404,'人员不存在');
    if(input.revision!==(old?.revision||0)&&!(method==='POST'&&!personMatch[1]))fail(409,'人员归属已变化，请刷新');
    if(method==='DELETE'&&old){
     if(!old.user_id&&db.prepare('SELECT id FROM records WHERE creator=? OR json_extract(payload,\'$.owner\')=? OR json_extract(payload,\'$.advisor\')=? LIMIT 1').get(old.id,old.name,old.name))fail(409,'人员有关联记录，不能删除');
     if(!old.user_id&&db.prepare('SELECT record_id FROM participants WHERE name=? LIMIT 1').get(old.name))fail(409,'人员有关联记录，不能删除');
     if(old.user_id)db.prepare('UPDATE pm_organization_people SET organization_id=NULL,revision=revision+1 WHERE id=?').run(old.id);else db.prepare('DELETE FROM pm_organization_people WHERE id=?').run(old.id);
     audit(db,user.id,old.user_id?'移出单位人员':'删除人员档案',old.id,old.name);
    }else if(method==='POST'||method==='PUT'){
     if(personMatch[2]){
      if(!old||old.user_id)fail(400,'账号人员请通过个人资料接口编辑');
      const p={};for(const key of ['type','position','title','phone','email','employeeId','orcid','direction','homepage','office','summary'])p[key]=text(input[key],key,key==='summary'?10000:500);
      if(p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))fail(400,'工作邮箱格式不正确');if(p.homepage&&!/^https?:\/\//.test(p.homepage))fail(400,'学术主页须以http://或https://开头');if(p.orcid&&!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(p.orcid))fail(400,'ORCID格式不正确');p.employmentDate=date(input.employmentDate,'入职时间');
      if(!db.prepare("SELECT id FROM dictionaries WHERE scope='memberTypes' AND name=?").get(p.type))fail(400,'请选择已维护的成员类型');
      bindInlineMedia(db,dir,'organization-person',old.id,p.summary,user.id);p.attachments=saveFiles(db,dir,'organization-person',old.id,input.attachments||[],false,user.id);p.images=saveFiles(db,dir,'organization-person',old.id,input.images||[],true,user.id);
      db.prepare('UPDATE pm_organization_people SET profile=?,revision=revision+1 WHERE id=?').run(JSON.stringify(p),old.id);
      audit(db,user.id,'修改人员档案',old.id,old.name);return personDto(db.prepare('SELECT * FROM pm_organization_people WHERE id=?').get(old.id));
     }
     const organizationId=input.organizationId||null;if(organizationId&&!db.prepare('SELECT id FROM pm_organizations WHERE id=?').get(organizationId))fail(400,'请选择有效单位');
     const userId=old?old.user_id:linked?.id||input.userId||null,selected=userId&&account(userId);if(userId&&(!selected||['系统管理员','只读访客'].includes(selected.role)))fail(400,'请选择有效人员账号');
     const name=selected?.name||text(input.name,'人员姓名',100,true);if(/[,，、;；\n]/.test(name))fail(400,'姓名不能包含分隔符');
     const duplicate=db.prepare('SELECT id FROM pm_organization_people WHERE (name=? OR user_id=?) AND id<>?').get(name,userId,old?.id||'');if(duplicate||(!selected&&(!old||old.name!==name)&&db.prepare('SELECT id FROM users WHERE name=?').get(name)))fail(409,'人员已存在，请选择已有账号或编辑人员');
     const id=old?.id||userId||'org-'+randomUUID();if(old)db.prepare('UPDATE pm_organization_people SET name=?,organization_id=?,revision=revision+1 WHERE id=?').run(name,organizationId,id);else{const type=db.prepare("SELECT name FROM dictionaries WHERE scope='memberTypes' ORDER BY position,name LIMIT 1").get()?.name;if(!type)fail(400,'请先在系统管理维护至少一个成员类型');db.prepare('INSERT INTO pm_organization_people(id,user_id,organization_id,name,profile,created_at) VALUES(?,?,?,?,?,?)').run(id,userId,organizationId,name,JSON.stringify({type,attachments:[],images:[]}),now());}
     if(old&&!old.user_id&&old.name!==name){for(const r of db.prepare('SELECT * FROM records').all()){const v=JSON.parse(r.payload);let changed=false;if(v.owner===old.name){v.owner=name;changed=true;}if(v.advisor===old.name){v.advisor=name;changed=true;}if(v.participants?.includes(old.name)){v.participants=v.participants.map(n=>n===old.name?name:n);changed=true;}if(changed)db.prepare('UPDATE records SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(v),now(),r.id);}db.prepare('UPDATE participants SET name=? WHERE name=? AND user_id IS NULL').run(name,old.name);}
     audit(db,user.id,old?'修改人员归属':'新增单位人员',id,name);
    }else fail(405,'不支持此方法');
   }
   return snapshot();
  });json(res,method==='POST'?201:200,result);return true;
 }
 return {route,snapshot,personDto};
}
