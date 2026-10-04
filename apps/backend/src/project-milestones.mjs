import { randomUUID } from 'node:crypto';
import { fail,text,date,list } from './security.mjs';
import { transaction } from './database.mjs';
export function projectMilestones(db,{body,json,project,canManage,member,event,dto}){
 db.exec(`CREATE TABLE IF NOT EXISTS pm_milestones(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES pm_projects(id),owner_id TEXT NOT NULL REFERENCES users(id),creator_id TEXT NOT NULL REFERENCES users(id),payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,deleted INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS pm_milestones_project ON pm_milestones(project_id,deleted);`);
 const states=['待开始','进行中','待验收','已完成','已暂停','已取消'];
 function entries(p,user){return db.prepare('SELECT m.*,u.name FROM pm_milestones m JOIN users u ON u.id=m.owner_id WHERE project_id=? AND deleted=0 ORDER BY created_at,id').all(p.id).map(m=>{
  const value=JSON.parse(m.payload),tasks=value.taskIds.map(id=>db.prepare("SELECT payload FROM pm_tasks WHERE id=? AND project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").get(id,p.id)).filter(Boolean).map(t=>JSON.parse(t.payload));
  return {...value,id:m.id,ownerId:m.owner_id,owner:m.name,revision:m.revision,createdAt:m.created_at,updatedAt:m.updated_at,canEdit:canManage(user,p)||m.owner_id===user.id,canManage:canManage(user,p),taskCount:tasks.length,completedTasks:tasks.filter(t=>t.state==='已完成').length,taskProgress:tasks.length?Math.round(tasks.reduce((sum,t)=>sum+t.progress,0)/tasks.length):0};
 });}
 async function route(req,res,path,method,user){
  const match=/^\/api\/pm\/projects\/([\w-]+)\/milestones(?:\/([\w-]+))?$/.exec(path);if(!match)return false;
  const p=project(match[1],user);if(method==='GET'&&!match[2]){json(res,200,entries(p,user));return true}
  const input=await body(req);const result=transaction(db,()=>{
   const current=project(match[1],user),manage=canManage(user,current),old=match[2]?db.prepare('SELECT * FROM pm_milestones WHERE id=? AND project_id=? AND deleted=0').get(match[2],p.id):null;
   if(match[2]&&!old)fail(404,'里程碑不存在');if(!manage&&(!old||old.owner_id!==user.id))fail(403,'只有项目负责人、学生负责人、管理员或该里程碑负责人可编辑');
   if(old&&old.revision!==input.revision)fail(409,'里程碑已被修改，请刷新后重试');const stamp=new Date().toISOString();
   if(method==='DELETE'&&old){if(!manage)fail(403,'只有项目负责人、学生负责人或管理员可删除里程碑');if(db.prepare("SELECT id FROM pm_milestones WHERE project_id=? AND deleted=0 AND json_extract(payload,'$.dependsOn')=?").get(p.id,old.id))fail(409,'其他里程碑依赖此节点，请先解除前置关系');db.prepare('UPDATE pm_milestones SET deleted=1,revision=revision+1,updated_at=? WHERE id=?').run(stamp,old.id);event(user,p.id,'删除里程碑',JSON.parse(old.payload).title)}
   else if(method==='POST'&&!match[2]||method==='PUT'&&old){
    let value=old?JSON.parse(old.payload):{},ownerId=old?.owner_id;
    const planning=['title','planned','ownerId','description','deliverable','acceptance','priority','taskIds','dependsOn','tags'];
    if(!manage){for(const field of planning)if(input[field]!==undefined&&JSON.stringify(input[field])!==JSON.stringify(field==='ownerId'?ownerId:value[field]))fail(403,'里程碑负责人只能更新状态、进度、实际日期和执行记录')}
    else{
     ownerId=text(input.ownerId||old?.owner_id||current.owner_id,'负责人',80,true);
     if(!old||ownerId!==old.owner_id){if(!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role<>'只读访客'").get(ownerId)||!member(p.id,ownerId))fail(400,'负责人须为有效项目成员')}
     const planned=date(input.planned,'计划日期'),plan=JSON.parse(current.payload);if(!planned||(plan.start&&planned<plan.start)||(plan.end&&planned>plan.end))fail(400,'计划日期须在项目周期内');
     const taskIds=list(input.taskIds||[],'关联任务',100);for(const id of taskIds)if(!db.prepare("SELECT id FROM pm_tasks WHERE id=? AND project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").get(id,p.id))fail(400,'关联任务须属于本项目');
     const dependsOn=text(input.dependsOn,'前置里程碑',80);let cursor=dependsOn;const visited=new Set(old?[old.id]:[]);while(cursor){if(visited.has(cursor))fail(400,'里程碑前置关系不能形成循环');visited.add(cursor);const node=db.prepare('SELECT payload FROM pm_milestones WHERE id=? AND project_id=? AND deleted=0').get(cursor,p.id);if(!node)fail(400,'请选择本项目的有效前置里程碑');cursor=JSON.parse(node.payload).dependsOn}
     if(!['高','中','低'].includes(input.priority||'中'))fail(400,'优先级无效');
     value={title:text(input.title,'里程碑名称',150,true),planned,description:text(input.description,'说明',5000),deliverable:text(input.deliverable,'交付成果',3000),acceptance:text(input.acceptance,'验收标准',3000),priority:input.priority||'中',taskIds,dependsOn,tags:list(input.tags||[],'标签',20)};
    }
    value.state=input.state??value.state??'待开始';value.progress=input.progress??value.progress??0;value.actual=date(input.actual??value.actual,'实际完成日期');value.result=text(input.result??value.result,'执行记录',5000);
    if(!states.includes(value.state))fail(400,'里程碑状态无效');if(!Number.isInteger(value.progress)||value.progress<0||value.progress>100)fail(400,'进度须为0至100的整数');
    if(!['已完成','已取消'].includes(value.state)&&!member(p.id,ownerId))fail(400,'未完成里程碑负责人须为项目成员，请重新分配负责人');
    if(value.state==='待开始'&&value.progress!==0)fail(400,'待开始里程碑进度须为0%');
    if(value.state==='已完成'){
     if(value.progress!==100||!value.actual)fail(400,'已完成里程碑须填写实际日期且进度为100%');
     if(value.actual>new Date(Date.now()+8*3600000).toISOString().slice(0,10))fail(400,'实际完成日期不能晚于今天');
     if(value.dependsOn){const dependency=db.prepare('SELECT payload FROM pm_milestones WHERE id=? AND deleted=0').get(value.dependsOn);if(!dependency||JSON.parse(dependency.payload).state!=='已完成')fail(400,'请先完成前置里程碑')}
     if(value.taskIds.some(id=>{const task=db.prepare("SELECT payload FROM pm_tasks WHERE id=? AND json_extract(payload,'$.deletedAt') IS NULL").get(id);return !task||JSON.parse(task.payload).state!=='已完成'}))fail(400,'请先完成全部关联任务');
    }else if(value.actual)fail(400,'实际完成日期仅在已完成状态填写');
    if(old&&JSON.parse(old.payload).state==='已完成'&&value.state!=='已完成'&&db.prepare("SELECT id FROM pm_milestones WHERE project_id=? AND deleted=0 AND json_extract(payload,'$.dependsOn')=? AND json_extract(payload,'$.state')='已完成'").get(p.id,old.id))fail(409,'已有完成的后续节点，不能重新打开此前置里程碑');
    const id=old?.id||randomUUID();if(old)db.prepare('UPDATE pm_milestones SET owner_id=?,payload=?,revision=revision+1,updated_at=? WHERE id=?').run(ownerId,JSON.stringify(value),stamp,id);else db.prepare('INSERT INTO pm_milestones(id,project_id,owner_id,creator_id,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,p.id,ownerId,user.id,JSON.stringify(value),stamp,stamp);
    event(user,p.id,old?'更新里程碑':'新增里程碑',`${value.title} · ${value.state} · ${value.progress}%`);
   }else fail(405,'不支持此方法');return dto(current,user);
  });json(res,method==='POST'?201:200,result);return true;
 }
 return {entries,route};
}
