import { fail, text } from './security.mjs';
import { transaction, audit } from './database.mjs';

export function taskCapacity(db, body, json) {
  db.exec(`CREATE TABLE IF NOT EXISTS pm_task_capacity (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    daily_limit INTEGER NOT NULL CHECK(daily_limit BETWEEN 1 AND 1000),
    revision INTEGER NOT NULL DEFAULT 1)`);
  const all=()=>db.prepare('SELECT user_id AS userId,daily_limit AS dailyLimit,revision FROM pm_task_capacity ORDER BY user_id').all();
  return async (req,res,path,method,user)=>{
    if(path==='/api/pm/task-capacity'&&method==='GET'){json(res,200,all());return true;}
    const match=/^\/api\/pm\/task-capacity\/([\w-]+)$/.exec(path);
    if(!match)return false;
    if(method!=='PUT')fail(405,'不支持此方法');
    if(user.role==='只读访客'||(user.role!=='系统管理员'&&match[1]!==user.id))fail(403,'只能设置本人的任务上限，管理员可设置所有人员');
    const input=await body(req),id=text(match[1],'人员',80,true);
    if(!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role<>'只读访客'").get(id))fail(400,'请选择有效的系统人员');
    if(!Number.isInteger(input.dailyLimit)||input.dailyLimit<1||input.dailyLimit>1000)fail(400,'每日任务上限须为1至1000的整数');
    const saved=transaction(db,()=>{
      const old=db.prepare('SELECT revision FROM pm_task_capacity WHERE user_id=?').get(id);
      if(input.revision!==(old?.revision||0))fail(409,'任务上限已被修改，请刷新后重试');
      db.prepare('INSERT INTO pm_task_capacity(user_id,daily_limit) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET daily_limit=excluded.daily_limit,revision=revision+1').run(id,input.dailyLimit);
      audit(db,user.id,'设置每日任务上限',id,String(input.dailyLimit));
      return all();
    });json(res,200,saved);return true;
  };
}
