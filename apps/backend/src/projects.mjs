import { randomUUID } from 'node:crypto';
import { fail, text, date, list, isReviewer } from './security.mjs';
import { transaction, audit } from './database.mjs';
import { projectTime } from './project-time.mjs';
import { projectMilestones } from './project-milestones.mjs';
import { taskCapacity } from './task-capacity.mjs';

// Older blank project numbers were stored as generated UUIDs in the unique code column.
function projectNumber(p) {
  const payload=JSON.parse(p.payload);
  return payload.projectCode ?? (/^PM-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.code)?'':p.code);
}

export function projectRoutes(db, body, json,taskSaved=()=>{}) {
  // Additive schema only: legacy records, tasks and uploads are untouched.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pm_projects (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      owner_id TEXT NOT NULL REFERENCES users(id), creator_id TEXT NOT NULL REFERENCES users(id),
      payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pm_members (
      project_id TEXT NOT NULL REFERENCES pm_projects(id), user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL, PRIMARY KEY(project_id,user_id));
    CREATE TABLE IF NOT EXISTS pm_tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES pm_projects(id),
      assignee_id TEXT NOT NULL REFERENCES users(id), creator_id TEXT NOT NULL REFERENCES users(id),
      payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS pm_tasks_project ON pm_tasks(project_id);
    CREATE TABLE IF NOT EXISTS pm_options (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL, name TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1, UNIQUE(scope,name));
    CREATE TABLE IF NOT EXISTS pm_unit_order (
      id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pm_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES pm_projects(id),
      actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  // Seed types once; deleted or renamed defaults must not return on restart.
  if(!db.prepare('SELECT version FROM migrations WHERE version=6').get())transaction(db,()=>{
    const types=new Set(['科研课题','工程建设','跨单位项目',...db.prepare('SELECT payload FROM pm_projects').all().map(p=>JSON.parse(p.payload).type).filter(Boolean)]);
    for(const name of types)db.prepare('INSERT OR IGNORE INTO pm_options(id,scope,name) VALUES(?,?,?)').run(randomUUID(),'types',name);
    db.prepare('INSERT INTO migrations VALUES(6,?)').run(new Date().toISOString());
  });
  // Preserve existing project labels as selectable options without rewriting projects.
  transaction(db,()=>{
    for(const row of db.prepare('SELECT payload FROM pm_projects').all()) {
      const p=JSON.parse(row.payload);
      for(const [scope,name] of [['units',p.unit],['sources',p.sponsor]]) if(name)
        db.prepare('INSERT OR IGNORE INTO pm_options(id,scope,name) VALUES(?,?,?)').run(randomUUID(),scope,name);
      for(const unit of p.units||[])if(unit.name)
        db.prepare('INSERT OR IGNORE INTO pm_options(id,scope,name,contact,description) VALUES(?,?,?,?,?)').run(randomUUID(),'participantUnits',unit.name,unit.contact||'',unit.duty||'');
    }
  });
  const options=()=>db.prepare('SELECT * FROM pm_options ORDER BY name,id').all();
  const unitOrder=()=>{
    const saved=db.prepare('SELECT * FROM pm_unit_order WHERE id=1').get();
    const ids=saved?JSON.parse(saved.payload):[];
    const units=db.prepare("SELECT id,name FROM pm_options WHERE scope='units'").all().sort((a,b)=>{
      const ai=ids.indexOf(a.id),bi=ids.indexOf(b.id);
      return (ai<0?Infinity:ai)-(bi<0?Infinity:bi)||a.name.localeCompare(b.name,'zh-CN');
    });
    return {revision:saved?.revision||0,units};
  };
  async function unitOrderRoute(req,res,path,method,user){
    if(path!=='/api/pm/unit-order')return false;
    if(method==='GET'){json(res,200,unitOrder());return true;}
    if(method!=='PUT')fail(405,'不支持此方法');
    if(user.role!=='系统管理员')fail(403,'只有系统管理员可调整课题组顺序');
    const input=await body(req);
    const result=transaction(db,()=>{
      const current=unitOrder();
      if(input.revision!==current.revision)fail(409,'课题组顺序已被修改，请重新打开排序设置');
      if(!Array.isArray(input.ids)||input.ids.length!==current.units.length||new Set(input.ids).size!==input.ids.length||input.ids.some(id=>!current.units.some(unit=>unit.id===id)))fail(400,'单位目录已变化，请重新打开排序设置');
      db.prepare('INSERT INTO pm_unit_order(id,payload,revision) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision').run(JSON.stringify(input.ids),current.revision+1);
      audit(db,user.id,'调整课题组顺序','project-unit-order','保存全账号共用的课题组顺序');
      return unitOrder();
    });json(res,200,result);return true;
  }
  async function optionRoute(req,res,path,method,user) {
    const match=/^\/api\/pm\/options(?:\/([\w-]+))?$/.exec(path);
    if(!match)return false;
    if(method==='GET' && !match[1]){json(res,200,options());return true;}
    if(!isReviewer(user))fail(403,'只有管理员可管理单位和项目来源');
    const input=await body(req);
    const result=transaction(db,()=>{
      const old=match[1] && db.prepare('SELECT * FROM pm_options WHERE id=?').get(match[1]);
      if(match[1]&&!old)fail(404,'选项不存在');
      if((old?.scope||input.scope)==='taskTypes'&&user.role!=='系统管理员')fail(403,'只有系统管理员可维护任务类型');
      if(old && input.revision!==old.revision)fail(409,'选项已被修改，请刷新后重试');
      if(method==='POST'&&!match[1] || method==='PUT'&&old){
        const scope=old?.scope || choose(input.scope,['units','participantUnits','sources','types','taskTypes'],'选项类型');
        const name=text(input.name,'名称',200,true),contact=text(input.contact,'联系人',100),description=text(input.description,'说明',1000);
        if(db.prepare('SELECT id FROM pm_options WHERE scope=? AND name=? AND id<>?').get(scope,name,old?.id||''))fail(409,'名称已存在');
        const id=old?.id||randomUUID();
        if(old){
          db.prepare('UPDATE pm_options SET name=?,contact=?,description=?,revision=revision+1 WHERE id=?').run(name,contact,description,id);
          if(name!==old.name&&scope==='taskTypes')for(const task of db.prepare('SELECT * FROM pm_tasks').all()){
            const payload=JSON.parse(task.payload);
            if(payload.taskType!==old.name)continue;
            payload.taskType=name;
            db.prepare('UPDATE pm_tasks SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(payload),now(),task.id);
            event(user,task.project_id,'更新任务类型',`${old.name} → ${name}`);
          }
          if(name!==old.name&&scope!=='taskTypes')for(const p of db.prepare('SELECT * FROM pm_projects').all()){
            const payload=JSON.parse(p.payload),field=scope==='units'?'unit':scope==='types'?'type':'sponsor';
            if(scope==='participantUnits'){
              if(!(payload.units||[]).some(unit=>unit.name===old.name))continue;
              payload.units=payload.units.map(unit=>unit.name===old.name?{...unit,name}:unit);
            }else{
              if(payload[field]!==old.name)continue;
              payload[field]=name;
            }
            db.prepare('UPDATE pm_projects SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(payload),now(),p.id);
            event(user,p.id,'更新项目选项',`${old.name} → ${name}`);
          }
        }else db.prepare('INSERT INTO pm_options(id,scope,name,contact,description) VALUES(?,?,?,?,?)').run(id,scope,name,contact,description);
        audit(db,user.id,old?'修改项目选项':'新增项目选项',id,name);
      }else if(method==='DELETE'&&old){
        const field=old.scope==='units'?'unit':old.scope==='types'?'type':'sponsor';
        if(old.scope==='taskTypes'){
          if(db.prepare('SELECT payload FROM pm_tasks').all().some(t=>JSON.parse(t.payload).taskType===old.name))fail(409,'该类型正在被任务使用，不能删除；可修改名称');
        }else if(db.prepare('SELECT payload FROM pm_projects').all().some(p=>{const payload=JSON.parse(p.payload);return old.scope==='participantUnits'?(payload.units||[]).some(unit=>unit.name===old.name):payload[field]===old.name}))fail(409,'该选项正在被项目使用，不能删除；可修改名称');
        if(old.scope==='types'&&db.prepare("SELECT count(*) AS n FROM pm_options WHERE scope='types'").get().n<=1)fail(409,'至少保留一个项目类型，保证可新建项目');
        db.prepare('DELETE FROM pm_options WHERE id=?').run(old.id);audit(db,user.id,'删除项目选项',old.id,old.name);
      }else fail(405,'不支持此方法');
      return options();
    });json(res,method==='POST'?201:200,result);return true;
  }
  const now = () => new Date().toISOString();
  const member = (id, userId) => db.prepare('SELECT * FROM pm_members WHERE project_id=? AND user_id=?').get(id,userId);
  const canManage = (user,p) => user.role !== '只读访客' && (isReviewer(user) || p.owner_id === user.id || JSON.parse(p.payload).studentOwnerId === user.id);
  const participates = (user,p) => user.role !== '只读访客' && !!db.prepare(`SELECT id FROM pm_tasks WHERE project_id=? AND json_extract(payload,'$.deletedAt') IS NULL AND (assignee_id=? OR EXISTS(SELECT 1 FROM json_each(pm_tasks.payload,'$.participantIds') WHERE value=?)) LIMIT 1`).get(p.id,user.id,user.id);
  const canRead = (user,p) => !JSON.parse(p.payload).deletedAt && (canManage(user,p) || participates(user,p) || (user.role !== '只读访客' && !!member(p.id,user.id)));
  const canManageTasks = (user,p) => !JSON.parse(p.payload).deletedAt && (canManage(user,p) || participates(user,p));
  const users = () => db.prepare("SELECT id,name,role,active FROM users WHERE role<>'只读访客' ORDER BY name").all().map(u=>({...u,active:!!u.active}));
  function person(id) {
    id=text(id,'人员',80,true);
    const u=db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role<>'只读访客'").get(id);
    if (!u) fail(400,'请选择有效的系统人员');
    return u.id;
  }
  function choose(value, values, label) { if(!values.includes(value)) fail(400,`${label}无效`); return value; }
  function percent(value) { if(!Number.isInteger(value) || value<0 || value>100) fail(400,'进度须为0至100的整数'); return value; }
  function project(id,user) {
    const p=db.prepare('SELECT * FROM pm_projects WHERE id=?').get(id);
    if(!p || !canRead(user,p)) fail(404,'项目不存在或无权查看');
    return p;
  }
  function event(user,id,action,detail) {
    db.prepare('INSERT INTO pm_events(project_id,actor_id,action,detail,created_at) VALUES(?,?,?,?,?)').run(id,user.id,action,detail,now());
    audit(db,user.id,action,id,detail);
  }
  function dto(p,user) {
    const names=new Map(db.prepare('SELECT id,name FROM users').all().map(u=>[u.id,u.name]));
    const milestones=milestoneModule.entries(p,user);
    const studentOwnerId=JSON.parse(p.payload).studentOwnerId || '';
    return {...JSON.parse(p.payload),id:p.id,code:projectNumber(p),ownerId:p.owner_id,owner:names.get(p.owner_id)||'已停用人员',studentOwnerId,studentOwner:studentOwnerId?(names.get(studentOwnerId)||'已停用人员'):'',timeEntries:timeModule.entries(p,user),
      milestones,revision:p.revision,createdAt:p.created_at,updatedAt:p.updated_at,canManage:canManage(user,p),canManageTasks:canManageTasks(user,p),
      members:db.prepare('SELECT m.*,u.active FROM pm_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.rowid').all(p.id).map(m=>({userId:m.user_id,name:names.get(m.user_id)||'已停用人员',role:m.role,active:!!m.active})),
      tasks:db.prepare("SELECT * FROM pm_tasks WHERE project_id=? AND json_extract(payload,'$.deletedAt') IS NULL ORDER BY created_at,id").all(p.id).map(t=>{const payload=JSON.parse(t.payload),participantIds=payload.participantIds||[];return {...payload,participantIds,participants:participantIds.map(id=>({userId:id,name:names.get(id)||'已停用人员'})),createdAt:t.created_at,id:t.id,milestoneIds:milestones.filter(m=>m.taskIds.includes(t.id)).map(m=>m.id),revision:t.revision,assigneeId:t.assignee_id,owner:names.get(t.assignee_id)||'已停用人员',canEdit:canManageTasks(user,p)};}),
      activities:db.prepare('SELECT e.*,u.name FROM pm_events e JOIN users u ON u.id=e.actor_id WHERE project_id=? ORDER BY e.id DESC LIMIT 50').all(p.id).map(e=>({id:e.id,person:e.name,action:e.action,detail:e.detail,date:e.created_at,kind:'项目'}))};
  }
  function saveProject(input,user,old) {
    const defaultType=old?JSON.parse(old.payload).type:db.prepare("SELECT name FROM pm_options WHERE scope='types' ORDER BY (name='科研课题') DESC,name LIMIT 1").get()?.name;
    input={type:defaultType,progress:0,status:'正常推进',lifecycle:'未开始',members:[],units:[],...input};
    if(old && !canManage(user,old)) fail(403,'只有项目负责人、学生负责人或管理员可管理项目');
    if(old && input.revision!==old.revision) fail(409,'项目已被他人修改，请刷新后重试');
    const requestedOwner=input.ownerId || old?.owner_id || user.id;
    const ownerId = old && requestedOwner===old.owner_id ? old.owner_id : person(requestedOwner);
    if(!isReviewer(user) && ownerId!==(old?.owner_id||user.id)) fail(403,'只有管理员可指定其他项目负责人');
    const previousStudentOwner=old?JSON.parse(old.payload).studentOwnerId || '':'';
    const studentOwnerId=text(input.studentOwnerId ?? previousStudentOwner,'学生负责人',80);
    if(studentOwnerId && studentOwnerId!==previousStudentOwner && !db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role='学生'").get(studentOwnerId))fail(400,'学生负责人须选择启用的学生账号');
    const projectCode=text(input.code ?? (old?projectNumber(old):''),'项目编号',80);
    const code=projectCode || (old && !projectNumber(old)?old.code:`PM-${randomUUID()}`);
    if(db.prepare('SELECT id FROM pm_projects WHERE code=? AND id<>?').get(code,old?.id||'')) fail(409,'项目编号已存在');
    const start=date(input.start,'开始日期'),end=date(input.end,'截止日期');
    if(start && end && end<start) fail(400,'截止日期不能早于开始日期');
    if(old && db.prepare("SELECT payload FROM pm_tasks WHERE project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").all(old.id).some(t=>{const task=JSON.parse(t.payload);return (start && task.start<start)||(end && task.due>end);} )) fail(400,'项目周期须覆盖已有任务日期，请先调整任务排期');
    if(old && db.prepare('SELECT payload FROM pm_milestones WHERE project_id=? AND deleted=0').all(old.id).some(m=>{const milestone=JSON.parse(m.payload);return (start&&milestone.planned<start)||(end&&milestone.planned>end)}))fail(400,'项目周期须覆盖已有里程碑日期，请先调整节点排期');
    const type=text(input.type,'项目类型',200,true);if(!db.prepare("SELECT id FROM pm_options WHERE scope='types' AND name=?").get(type))fail(400,'请选择系统设置中有效的项目类型');
    const value={title:text(input.title,'项目名称',150,true),type,studentOwnerId,projectCode,
      unit:text(input.unit,'牵头单位',200),sponsor:text(input.sponsor,'项目来源',200),phase:text(input.phase,'当前阶段',100),
      summary:text(input.summary,'项目目标',10000),start,end,progress:percent(input.progress===''?0:input.progress),
      status:choose(input.status,['正常推进','需要关注','待协调'],'健康状态'),
      lifecycle:choose(input.lifecycle,['未开始','进行中','已暂停','已取消','已完成'],'项目状态'),tags:list(input.tags||[],'标签',20)};
    if(!Array.isArray(input.members)||input.members.length>100) fail(400,'项目成员须为不超过100人的列表');
    const ids=new Set([ownerId]); const members=[{userId:ownerId,role:'项目负责人'}];
    if(studentOwnerId && studentOwnerId!==ownerId){ids.add(studentOwnerId);members.push({userId:studentOwnerId,role:'学生负责人'});}
    for(const m of input.members) {
      if(!m || typeof m!=='object') fail(400,'项目成员格式不正确');
      m.userId=text(m.userId,'成员',80,true);
      if(m.userId===ownerId || m.userId===studentOwnerId) continue;
      if(ids.has(m.userId)) fail(400,'项目成员重复');
      // Existing inactive accounts may retain their historical membership.
      if(!old || !member(old.id,m.userId)) person(m.userId);
      ids.add(m.userId);members.push({userId:m.userId,role:choose(m.role,['项目协调人','项目成员'],'成员角色')});
    }
    if(old && db.prepare("SELECT assignee_id FROM pm_tasks WHERE project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").all(old.id).some(t=>!ids.has(t.assignee_id))) fail(400,'移除成员前请先重新分配其任务');
    if(old && db.prepare("SELECT owner_id FROM pm_milestones WHERE project_id=? AND deleted=0 AND json_extract(payload,'$.state') NOT IN ('已完成','已取消')").all(old.id).some(m=>!ids.has(m.owner_id)))fail(400,'移除成员前请先重新分配其未完成里程碑');
    if(!Array.isArray(input.units)||input.units.length>30) fail(400,'参与单位须为不超过30项的列表');
    value.units=input.units.map(u=>{
      if(!u || typeof u!=='object') fail(400,'参与单位格式不正确');
      return {name:text(u.name,'单位名称',200,true),role:choose(u.role,['牵头单位','协作单位','执行团队'],'单位角色'),contact:text(u.contact,'联系人',100),duty:text(u.duty,'单位职责',1000)};
    });
    const id=old?.id||randomUUID(),stamp=now();
    if(old) db.prepare('UPDATE pm_projects SET code=?,owner_id=?,payload=?,revision=revision+1,updated_at=? WHERE id=?').run(code,ownerId,JSON.stringify(value),stamp,id);
    else db.prepare('INSERT INTO pm_projects(id,code,owner_id,creator_id,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,code,ownerId,user.id,JSON.stringify(value),stamp,stamp);
    db.prepare('DELETE FROM pm_members WHERE project_id=?').run(id);
    for(const m of members) db.prepare('INSERT INTO pm_members VALUES(?,?,?)').run(id,m.userId,m.role);
    event(user,id,old?'修改项目':'创建项目',value.title);
    return dto(project(id,user),user);
  }
  function saveTask(input,user,p,old) {
    const manage=canManageTasks(user,p);
    if(!manage) fail(403,'只有项目管理人员或任务参与人员可管理项目任务');
    if(old && input.revision!==old.revision) fail(409,'任务已被他人修改，请刷新后重试');
    let value=old ? JSON.parse(old.payload) : {},assigneeId=old?.assignee_id;
    if(old)input={...value,assigneeId,...input};
    if(input.completed!==undefined){
      if(!old||typeof input.completed!=='boolean')fail(400,'请选择有效的任务完成状态');
      if(input.completed&&value.state!=='已完成')value.completionPreviousProgress=value.progress;
      const progress=input.completed?100:Number.isFinite(value.completionPreviousProgress)&&value.completionPreviousProgress<100?value.completionPreviousProgress:0;
      input={...value,assigneeId,...input,state:input.completed?'已完成':'进行中',progress};
    }
    if(manage) {
      const taskType=text(input.taskType ?? value.taskType,'任务类型',200);
      if(taskType&&!db.prepare("SELECT id FROM pm_options WHERE scope='taskTypes' AND name=?").get(taskType))fail(400,'请选择有效的任务类型');
      value.taskType=taskType;
      assigneeId=old && input.assigneeId===old.assignee_id ? old.assignee_id : person(input.assigneeId);
      if(!member(p.id,assigneeId)) fail(400,'任务负责人须为项目成员');
      const participantIds=list(input.participantIds ?? value.participantIds ?? [],'任务参与人员',100);
      for(const id of participantIds){
        if((value.participantIds||[]).includes(id))continue;
        person(id);
        if(!member(p.id,id))fail(400,'任务参与人员须为项目成员');
      }
      value.participantIds=participantIds;
      const start=date(input.start,'任务开始日期'),due=date(input.due,'任务截止日期');
      const plan=JSON.parse(p.payload);
      if(!start||!due||due<start||(plan.start && start<plan.start)||(plan.end && due>plan.end)) fail(400,'任务日期须在项目周期内且截止日期不早于开始日期');
      value={...value,title:text(input.title,'任务名称',150,true),start,due,parentId:text(input.parentId,'父任务',80)||null,dependsOn:text(input.dependsOn,'前置任务',80)||null};
      const tasks=db.prepare("SELECT id,payload FROM pm_tasks WHERE project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").all(p.id);
      for(const field of ['parentId','dependsOn']) {
        if(value[field] && (value[field]===old?.id || !tasks.some(t=>t.id===value[field]))) fail(400,'父任务或前置任务须为本项目其他任务');
        const graph=new Map(tasks.map(t=>[t.id,JSON.parse(t.payload)[field]]));
        let cursor=value[field];const visited=new Set([old?.id]);
        while(cursor) { if(visited.has(cursor)) fail(400,'任务关系不能形成循环');visited.add(cursor);cursor=graph.get(cursor); }
      }
    } else {
      if(input.participantIds!==undefined && JSON.stringify(input.participantIds)!==JSON.stringify(value.participantIds||[]))fail(403,'只有项目管理人员可调整任务参与人员');
      for(const field of ['title','start','due','parentId','dependsOn','taskType']) if(input[field]!==undefined && (input[field]||null)!==(value[field]||null)) fail(403,'执行人只能更新任务状态、进度和描述');
      if(input.assigneeId!==undefined && input.assigneeId!==assigneeId) fail(403,'执行人不能重新分配任务');
    }
    const spentDays=input.spentDays===undefined?(value.spentDays??null):input.spentDays;
    if(spentDays!==null&&(typeof spentDays!=='number'||!Number.isFinite(spentDays)||spentDays<0.5||spentDays>10||!Number.isInteger(spentDays*2)))fail(400,'花费工日须为0.5至10.0之间，以0.5递增');
    value.spentDays=spentDays;
    value.description=text(input.description ?? value.description,'任务描述',5000);
    value.state=choose(input.state,['待开始','进行中','测试中','待反馈','已完成'],'任务状态');
    if(old&&value.state!=='已完成'&&db.prepare("SELECT id FROM pm_milestones WHERE project_id=? AND deleted=0 AND json_extract(payload,'$.state')='已完成' AND EXISTS(SELECT 1 FROM json_each(pm_milestones.payload,'$.taskIds') WHERE value=?)").get(p.id,old.id))fail(409,'该任务关联已完成里程碑，请先重新打开里程碑');
    value.progress=percent(input.progress);
    if(value.state==='已完成' && value.progress!==100) fail(400,'已完成任务进度须为100%');
    if(value.state==='待开始' && value.progress!==0) fail(400,'待开始任务进度须为0%');
    const id=old?.id||randomUUID(),stamp=now();
    const milestoneChanges=[];
    if(input.milestoneIds!==undefined){
      const selected=list(input.milestoneIds,'里程碑',100),nodes=db.prepare('SELECT * FROM pm_milestones WHERE project_id=? AND deleted=0').all(p.id);
      for(const nodeId of selected)if(!nodes.some(m=>m.id===nodeId))fail(400,'请选择本项目的有效里程碑');
      for(const node of nodes){const payload=JSON.parse(node.payload),linked=payload.taskIds.includes(id),wanted=selected.includes(node.id);if(linked===wanted)continue;
        if(!manage)fail(403,'执行人不能修改任务所属里程碑');
        if(input.milestoneRevisions?.[node.id]!==node.revision)fail(409,'关联里程碑已被修改，请刷新后重试');
        if(wanted&&payload.state==='已完成'&&value.state!=='已完成')fail(400,'未完成任务不能加入已完成里程碑');
        if(wanted&&payload.taskIds.length>=100)fail(400,'里程碑关联任务不能超过100项');
        payload.taskIds=wanted?[...payload.taskIds,id]:payload.taskIds.filter(taskId=>taskId!==id);milestoneChanges.push({node,payload,wanted});
      }
    }
    if(old) db.prepare('UPDATE pm_tasks SET assignee_id=?,payload=?,revision=revision+1,updated_at=? WHERE id=?').run(assigneeId,JSON.stringify(value),stamp,id);
    else db.prepare('INSERT INTO pm_tasks(id,project_id,assignee_id,creator_id,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,p.id,assigneeId,user.id,JSON.stringify(value),stamp,stamp);
    for(const {node,payload,wanted} of milestoneChanges){db.prepare('UPDATE pm_milestones SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(payload),stamp,node.id);event(user,p.id,'更新里程碑任务关联',`${payload.title} · ${wanted?'关联':'移除'}任务 ${value.title}`)}
    event(user,p.id,old?'更新项目任务':'创建项目任务',`${value.title} · ${value.state} · ${value.progress}%`);
    taskSaved(p,old,db.prepare('SELECT * FROM pm_tasks WHERE id=?').get(id),user);
    return canRead(user,p)?dto(p,user):{id:p.id,accessRevoked:true};
  }
  const capacityRoute=taskCapacity(db,body,json);
  const timeModule=projectTime(db,{body,json,project,canManage,member,event,dto});
  const milestoneModule=projectMilestones(db,{body,json,project,canManage,member,event,dto});
  return async (req,res,path,method,user) => {
    if(!path.startsWith('/api/pm/')) return false;
    if(await capacityRoute(req,res,path,method,user))return true;
    if(await unitOrderRoute(req,res,path,method,user))return true;
    if(await optionRoute(req,res,path,method,user))return true;
    if(await timeModule.route(req,res,path,method,user))return true;
    if(await milestoneModule.route(req,res,path,method,user))return true;
    const deletionMatch=/^\/api\/pm\/projects\/([\w-]+)\/deletion-preview$/.exec(path);
    if(deletionMatch&&method==='GET'){
      const p=project(deletionMatch[1],user);if(user.role!=='系统管理员')fail(403,'只有系统管理员可删除项目');
      const tasks=db.prepare('SELECT id,payload FROM pm_tasks WHERE project_id=?').all(p.id);
      const milestones=db.prepare('SELECT id FROM pm_milestones WHERE project_id=?').all(p.id);
      const timeEntries=db.prepare('SELECT id FROM pm_time_entries WHERE project_id=? AND deleted=0').all(p.id);
      const ids=new Set([p.id,...tasks.map(t=>t.id),...milestones.map(m=>m.id),...timeEntries.map(t=>t.id)]);
      const attachments=db.prepare('SELECT entity_id FROM files').all().filter(file=>ids.has(file.entity_id)).length;
      json(res,200,{revision:p.revision,tasks:tasks.length,workdayTasks:tasks.filter(t=>Number.isFinite(JSON.parse(t.payload).spentDays)).length,timeEntries:timeEntries.length,attachments});return true;
    }
    const descriptionMatch=/^\/api\/pm\/projects\/([\w-]+)\/entries\/(tasks|milestones|time-entries)\/([\w-]+)\/description$/.exec(path);
    if(descriptionMatch && method==='PUT'){
      const input=await body(req);
      const result=transaction(db,()=>{
        const p=project(descriptionMatch[1],user),kind=descriptionMatch[2];
        const table={tasks:'pm_tasks',milestones:'pm_milestones','time-entries':'pm_time_entries'}[kind];
        const row=db.prepare(`SELECT * FROM ${table} WHERE id=? AND project_id=?${kind==='tasks'?" AND json_extract(payload,'$.deletedAt') IS NULL":' AND deleted=0'}`).get(descriptionMatch[3],p.id);
        if(!row)fail(404,'项目记录不存在');
        const owner=kind==='tasks'?row.assignee_id:kind==='milestones'?row.owner_id:row.user_id;
        if(!(kind==='tasks'?canManageTasks(user,p):canManage(user,p))&&owner!==user.id)fail(403,'只能修改本人负责记录的说明');
        if(input.revision!==row.revision)fail(409,'记录已被修改，请刷新后重试');
        const payload=JSON.parse(row.payload);payload[kind==='time-entries'?'note':'description']=text(input.description,'说明',kind==='time-entries'?1000:5000);
        db.prepare(`UPDATE ${table} SET payload=?,revision=revision+1,updated_at=? WHERE id=?`).run(JSON.stringify(payload),now(),row.id);
        event(user,p.id,'修改项目记录说明',`${kind==='tasks'?'任务':kind==='milestones'?'里程碑':'工时'} · ${payload.title||row.id}`);
        return dto(p,user);
      });json(res,200,result);return true;
    }
    if(path==='/api/pm/projects' && method==='GET') json(res,200,{projects:db.prepare('SELECT * FROM pm_projects ORDER BY updated_at DESC').all().filter(p=>canRead(user,p)).map(p=>dto(p,user)),people:users()});
    else if(path==='/api/pm/projects' && method==='POST') { const input=await body(req);json(res,201,transaction(db,()=>saveProject(input,user))); }
    else {
      const match=/^\/api\/pm\/projects\/([\w-]+)(?:\/tasks(?:\/([\w-]+))?)?$/.exec(path);
      if(!match) fail(404,'项目接口不存在');
      const p=project(match[1],user),taskRoute=path.includes('/tasks');
      if(method==='GET' && !taskRoute) json(res,200,dto(p,user));
      else if(method==='DELETE'&&!taskRoute){
        const input=await body(req);transaction(db,()=>{
          const current=project(match[1],user);if(user.role!=='系统管理员')fail(403,'只有系统管理员可删除项目');
          if(input.revision!==current.revision)fail(409,'项目已被修改，请重新确认删除');
          const payload=JSON.parse(current.payload);payload.deletedAt=now();payload.deletedBy=user.id;
          db.prepare('UPDATE pm_projects SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(payload),now(),current.id);
          if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_feishu_messages'").get())db.prepare("UPDATE pm_feishu_messages SET status='已取消',error='项目已删除',updated_at=? WHERE project_id=? AND status IN ('待发送','重试中','发送中')").run(now(),current.id);
          event(user,current.id,'删除项目',payload.title);audit(db,user.id,'删除项目',current.id,payload.title);
        });json(res,200,{deleted:true});
      }
      else if(method==='PUT' && !taskRoute) {const input=await body(req);json(res,200,transaction(db,()=>saveProject(input,user,project(match[1],user))));}
      else if(taskRoute && ((method==='POST' && !match[2])||(method==='PUT' && match[2]))) {
        const input=await body(req);json(res,match[2]?200:201,transaction(db,()=>{
          const current=project(match[1],user);
          const old=match[2]?db.prepare("SELECT * FROM pm_tasks WHERE id=? AND project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").get(match[2],current.id):null;
          if(match[2]&&!old) fail(404,'任务不存在');
          return saveTask(input,user,current,old);
        }));
      } else if(taskRoute&&method==='DELETE'&&match[2]){
        const input=await body(req);transaction(db,()=>{
          const current=project(match[1],user);if(!canManageTasks(user,current))fail(403,'无权删除任务');
          const old=db.prepare("SELECT * FROM pm_tasks WHERE id=? AND project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").get(match[2],current.id);
          if(!old)fail(404,'任务不存在');if(input.revision!==old.revision)fail(409,'任务已被修改，请刷新后重新确认删除');
          const linked=db.prepare("SELECT id FROM pm_tasks WHERE project_id=? AND id<>? AND json_extract(payload,'$.deletedAt') IS NULL AND (json_extract(payload,'$.parentId')=? OR json_extract(payload,'$.dependsOn')=?)").get(current.id,old.id,old.id,old.id);
          if(linked)fail(409,'该任务有子任务或后续任务，请先调整关系后再删除');
          const payload=JSON.parse(old.payload);payload.deletedAt=now();payload.deletedBy=user.id;
          db.prepare('UPDATE pm_tasks SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(payload),now(),old.id);
          for(const node of db.prepare('SELECT * FROM pm_milestones WHERE project_id=? AND deleted=0').all(current.id)){
            const value=JSON.parse(node.payload);if(!value.taskIds.includes(old.id))continue;
            value.taskIds=value.taskIds.filter(id=>id!==old.id);db.prepare('UPDATE pm_milestones SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(value),now(),node.id);
          }
          if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_feishu_messages'").get())db.prepare("UPDATE pm_feishu_messages SET status='已取消',error='任务已删除',updated_at=? WHERE task_id=? AND status IN ('待发送','重试中','发送中')").run(now(),old.id);
          event(user,current.id,'删除项目任务',payload.title);
        });json(res,200,{deleted:true});
      } else fail(405,'不支持此方法');
    }
    return true;
  };
}
