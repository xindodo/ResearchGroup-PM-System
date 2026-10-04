import { randomUUID } from 'node:crypto';
import { fail, text, list } from './security.mjs';
import { transaction } from './database.mjs';

export function projectTime(db,{body,json,project,canManage,member,event,dto}){
  db.exec(`CREATE TABLE IF NOT EXISTS pm_time_entries(
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES pm_projects(id),
    task_id TEXT NOT NULL REFERENCES pm_tasks(id), user_id TEXT NOT NULL REFERENCES users(id),
    creator_id TEXT NOT NULL REFERENCES users(id), start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
    payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS pm_time_project ON pm_time_entries(project_id,deleted);
    CREATE INDEX IF NOT EXISTS pm_time_user ON pm_time_entries(user_id,deleted,start_ms,end_ms);`);
  function entries(p,user){return db.prepare(`SELECT e.*,u.name,t.payload AS task_payload FROM pm_time_entries e
    JOIN users u ON u.id=e.user_id JOIN pm_tasks t ON t.id=e.task_id WHERE e.project_id=? AND e.deleted=0 AND json_extract(t.payload,'$.deletedAt') IS NULL ORDER BY e.start_ms DESC,e.id`).all(p.id).map(e=>({
      ...JSON.parse(e.payload),id:e.id,taskId:e.task_id,userId:e.user_id,person:e.name,task:JSON.parse(e.task_payload).title,
      taskState:JSON.parse(e.task_payload).state,revision:e.revision,durationMinutes:(e.end_ms-e.start_ms)/60000,
      canEdit:canManage(user,p)||e.user_id===user.id}));}
  function time(value,label){
    const result=text(value,label,16,true);
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(result))fail(400,`${label}须包含有效日期和时分`);
    const ms=Date.parse(result+':00+08:00');
    if(!Number.isFinite(ms)||new Date(ms+8*3600000).toISOString().slice(0,16)!==result)fail(400,`${label}无效`);
    return ms;
  }
  async function route(req,res,path,method,user){
    const match=/^\/api\/pm\/projects\/([\w-]+)\/time-entries(?:\/([\w-]+))?$/.exec(path);
    if(!match)return false;
    const p=project(match[1],user);
    if(method==='GET'&&!match[2]){json(res,200,entries(p,user));return true;}
    const input=await body(req);
    const result=transaction(db,()=>{
      const current=project(match[1],user),manage=canManage(user,current);
      const old=match[2]?db.prepare('SELECT * FROM pm_time_entries WHERE id=? AND project_id=? AND deleted=0').get(match[2],current.id):null;
      if(match[2]&&!old)fail(404,'工时记录不存在');
      if(old && !manage && old.user_id!==user.id)fail(403,'只能修改或删除本人的工时记录');
      if(old && input.revision!==old.revision)fail(409,'工时记录已被修改，请刷新后重试');
      const stamp=new Date().toISOString();
      if(method==='DELETE'&&old){db.prepare('UPDATE pm_time_entries SET deleted=1,revision=revision+1,updated_at=? WHERE id=?').run(stamp,old.id);event(user,current.id,'删除工时记录',JSON.parse(old.payload).start);}
      else if(method==='POST'&&!old&&!match[2] || method==='PUT'&&old){
        if(old && input.userIds!==undefined)fail(400,'编辑工时记录只能指定一位成员');
        const userIds=input.userIds===undefined?[text(input.userId||old?.user_id||user.id,'成员',80,true)]:list(input.userIds,'工时成员',200);
        if(!userIds.length)fail(400,'请至少选择一位工时成员');
        for(const userId of userIds){
          if(!manage && userId!==user.id)fail(403,'只能记录本人的工时');
          // Preserve old records for former or inactive project members.
          if(!old || userId!==old.user_id){
            const person=db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role<>'只读访客'").get(userId);
            if(!person || !member(current.id,userId))fail(400,'工时成员须为有效项目参与人员');
          }
        }
        const taskId=text(input.taskId,'任务',80,true),task=db.prepare("SELECT * FROM pm_tasks WHERE id=? AND project_id=? AND json_extract(payload,'$.deletedAt') IS NULL").get(taskId,current.id);
        if(!task)fail(400,'请选择本项目的任务');
        const start_ms=time(input.start,'开始时间'),end_ms=time(input.end,'结束时间');
        if(end_ms<=start_ms)fail(400,'结束时间须晚于开始时间');
        for(const userId of userIds){
          if(db.prepare('SELECT id FROM pm_time_entries WHERE user_id=? AND deleted=0 AND id<>? AND start_ms<? AND end_ms>? LIMIT 1').get(userId,old?.id||'',end_ms,start_ms)){
            const name=db.prepare('SELECT name FROM users WHERE id=?').get(userId)?.name||'该成员';
            fail(409,`${name}在此时间段已有工时记录，请检查时间重叠`);
          }
        }
        const payload={start:input.start,end:input.end,note:text(input.note,'备注',2000),tags:list(input.tags||[],'工时标签',20)};
        for(const userId of userIds){
          const id=old?.id||randomUUID();
          if(old)db.prepare('UPDATE pm_time_entries SET task_id=?,user_id=?,start_ms=?,end_ms=?,payload=?,revision=revision+1,updated_at=? WHERE id=?').run(taskId,userId,start_ms,end_ms,JSON.stringify(payload),stamp,id);
          else db.prepare('INSERT INTO pm_time_entries(id,project_id,task_id,user_id,creator_id,start_ms,end_ms,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,current.id,taskId,userId,user.id,start_ms,end_ms,JSON.stringify(payload),stamp,stamp);
          const name=db.prepare('SELECT name FROM users WHERE id=?').get(userId)?.name||'';
          event(user,current.id,old?'编辑工时记录':'新增工时记录',`${name} · ${JSON.parse(task.payload).title} · ${payload.start} 至 ${payload.end} · ${(end_ms-start_ms)/60000}分钟`);
        }
      }else fail(405,'不支持此方法');
      return dto(current,user);
    });json(res,method==='POST'?201:200,result);return true;
  }
  return {entries,route};
}
