import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const categories = {
  news: ['教务通知', '教学成果', '科研动态', '学术交流'],
  development: ['培训交流', '团队建设', '专业建设'],
  teaching: ['学校工作', '学院工作', '交工系工作'],
  materials: ['培养方案', '课程大纲', '教学日历', '实践教学资料', '实验教学资料', '教学课件', '教学管理文件'],
  achievements: ['专业建设', '教学竞赛', '教研项目', '教研论文', '课程建设', '教材建设', '教学成果奖'],
  students: ['学生竞赛', '学生项目', '荣誉称号'],
  research: ['论文', '专利', '软件成果', '获奖与荣誉', '数据集', '学位论文', '学术活动'],
  projects: ['纵向课题', '横向项目'], daily: ['课堂实录', '实习实践', '生活团建'],
};
export const roles = ['系统管理员', '导师', '学生', '只读访客'];
export function openDatabase(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  mkdirSync(join(dir, 'uploads'), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dir, 'jtgc.sqlite'), { timeout: 5000 });
  chmodSync(join(dir, 'jtgc.sqlite'), 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, account TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL UNIQUE, role TEXT NOT NULL, password TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      profile TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, creator TEXT NOT NULL REFERENCES users(id),
      state TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      review_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS record_kind_state ON records(kind,state,deleted);
    CREATE TABLE IF NOT EXISTS participants(record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, name TEXT NOT NULL, user_id TEXT REFERENCES users(id), PRIMARY KEY(record_id,position));
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
      filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, creator TEXT NOT NULL REFERENCES users(id),
      payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_recipients(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), completed_at TEXT, PRIMARY KEY(task_id,user_id));
    CREATE TABLE IF NOT EXISTS dictionaries(id TEXT PRIMARY KEY, scope TEXT NOT NULL, name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0, UNIQUE(scope,name));
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL,
      action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS announcements(id TEXT PRIMARY KEY, creator TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS related_links(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, revision INTEGER NOT NULL);
    INSERT OR IGNORE INTO related_links VALUES(1,'[]',1);
  `);
  if (!db.prepare('SELECT version FROM migrations WHERE version=1').get()) {
    transaction(db, () => {
      const groups = { ...categories, majors: ['交通工程', '交通运输', '智慧交通'], memberTypes: ['专业教师', '其他'] };
      for (const [scope, values] of Object.entries(groups)) values.forEach((name, i) => db.prepare('INSERT INTO dictionaries VALUES(?,?,?,?)').run(`${scope}-${i}`, scope, name, i));
      db.prepare('INSERT INTO migrations VALUES(1,?)').run(new Date().toISOString());
    });
  }
  if (!db.prepare('SELECT version FROM migrations WHERE version=2').get()) {
    transaction(db, () => {
      // Preserve content, files and old review notes; only retire the review gate.
      const result = db.prepare("UPDATE records SET state='published',revision=revision+1 WHERE state IN ('pending','rejected')").run();
      if (result.changes) audit(db, 'system', '取消审核并发布已有记录', '', String(result.changes));
      db.prepare('INSERT INTO migrations VALUES(2,?)').run(new Date().toISOString());
    });
  }
  if (!db.prepare('SELECT version FROM migrations WHERE version=3').get()) {
    transaction(db, () => {
      categories.students.forEach((name,i)=>db.prepare('INSERT OR IGNORE INTO dictionaries VALUES(?,?,?,?)').run(`students-${i}`,'students',name,i));
      const rows=db.prepare("SELECT id,payload FROM records WHERE kind='achievements' AND json_extract(payload,'$.category')='学生竞赛'").all();
      for(const row of rows) {
        const p=JSON.parse(row.payload);p.kind='students';
        if(p.owner && db.prepare('SELECT id FROM users WHERE name=?').get(p.owner)) {p.advisor=p.advisor || p.owner;p.owner='';}
        db.prepare("UPDATE records SET kind='students',payload=?,revision=revision+1 WHERE id=?").run(JSON.stringify(p),row.id);
      }
      db.prepare("DELETE FROM dictionaries WHERE scope='achievements' AND name='学生竞赛'").run();
      audit(db,'system','迁移学生竞赛至学生成果','',String(rows.length));
      db.prepare('INSERT INTO migrations VALUES(3,?)').run(new Date().toISOString());
    });
  }
  if (!db.prepare('SELECT version FROM migrations WHERE version=4').get()) {
    transaction(db, () => {
      const old=db.prepare("SELECT id FROM dictionaries WHERE scope='students' AND name='学生获奖'").get();
      if(old) {
        if(db.prepare("SELECT id FROM dictionaries WHERE scope='students' AND name='荣誉称号'").get())db.prepare('DELETE FROM dictionaries WHERE id=?').run(old.id);
        else db.prepare("UPDATE dictionaries SET name='荣誉称号' WHERE id=?").run(old.id);
      }
      db.prepare("UPDATE records SET payload=json_set(payload,'$.category','荣誉称号'),revision=revision+1 WHERE kind='students' AND json_extract(payload,'$.category')='学生获奖'").run();
      db.prepare('INSERT INTO migrations VALUES(4,?)').run(new Date().toISOString());
    });
  }
  if (!db.prepare('SELECT version FROM migrations WHERE version=5').get()) {
    transaction(db, () => {
      categories.teaching.forEach((name,i)=>db.prepare('INSERT OR IGNORE INTO dictionaries VALUES(?,?,?,?)').run(`teaching-${i}`,'teaching',name,i));
      db.prepare('INSERT INTO migrations VALUES(5,?)').run(new Date().toISOString());
    });
  }
  migrateAccountRoles(db, dir);
  return db;
}
// Only account roles change; profiles, credentials and business references stay intact.
export function migrateAccountRoles(db, dir) {
  if (db.prepare('SELECT version FROM migrations WHERE version=8').get()) return;
  const legacyRoles = ['专业教师', '系主任', '教学主任', '系管理员'];
  const rows = db.prepare('SELECT id,role FROM users').all().filter(u => legacyRoles.includes(u.role));
  let backupPath = '';
  if (rows.length) {
    const folder = join(dir, 'backups');
    mkdirSync(folder, {recursive:true,mode:0o700});
    backupPath = join(folder, `before-account-roles-${randomUUID()}.sqlite`);
    db.prepare('VACUUM INTO ?').run(backupPath);
    chmodSync(backupPath, 0o600);
    const restored = new DatabaseSync(backupPath, {readOnly:true});
    try {
      if (restored.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || restored.prepare('PRAGMA foreign_key_check').all().length) throw Error('角色迁移备份校验失败');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      for (const {name} of tables) {
        const sql = `SELECT * FROM "${name.replaceAll('"','""')}"`;
        if (JSON.stringify(db.prepare(sql).all()) !== JSON.stringify(restored.prepare(sql).all())) throw Error('角色迁移备份数据不一致');
      }
    } finally { restored.close(); }
  }
  transaction(db, () => {
    for (const row of rows) {
      db.prepare("UPDATE users SET role='导师',revision=revision+1 WHERE id=? AND role=?").run(row.id,row.role);
      audit(db,'system','调整账号角色',row.id,JSON.stringify({from:row.role,to:'导师',backup:backupPath}));
    }
    db.prepare('INSERT INTO migrations VALUES(8,?)').run(new Date().toISOString());
  });
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const value = fn(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function audit(db, actor, action, target, detail = '') {
  db.prepare('INSERT INTO audit(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(actor, action, target, detail, new Date().toISOString());
}
