// Explicit administrative operation: creates only a missing guest; never resets an existing account.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { passwordHash } from './security.mjs';
import { transaction, audit } from './database.mjs';
const dir=resolve(process.env.JTGC_DATA_DIR || '.local/jtgc');
if(!existsSync(join(dir,'jtgc.sqlite'))) throw new Error('数据库不存在；不会初始化数据库');
const db=new DatabaseSync(join(dir,'jtgc.sqlite'),{timeout:5000});
try {
  if(db.prepare("SELECT id FROM users WHERE account='guest' COLLATE NOCASE OR name='guest'").get()) throw new Error('guest已存在；停止，未修改账号或密码');
  const file=join(dir,'guest-initial-password.txt');
  if(existsSync(file)) throw new Error('访客密码文件已存在；停止，避免覆盖');
  const password=randomBytes(18).toString('base64url'), id=randomUUID();
  const type=db.prepare("SELECT name FROM dictionaries WHERE scope='memberTypes' ORDER BY position,name LIMIT 1").get()?.name || '其他';
  const hash=passwordHash(password);
  transaction(db,()=>{
    db.prepare('INSERT INTO users(id,account,name,role,password,profile,created_at) VALUES(?,?,?,?,?,?,?)').run(id,'guest','guest','只读访客',hash,JSON.stringify({type}),new Date().toISOString());
    audit(db,'local-administration','创建只读访客',id,'按用户明确授权创建guest');
    writeFileSync(file,`项目管理系统\n账号：guest\n初始密码：${password}\n角色：只读访客；仅可查看获准访问的项目与人员资料。\n`,{mode:0o600,flag:'wx'});
  });
  console.log('guest已创建，密码仅保存在数据目录guest-initial-password.txt');
} finally {db.close()}
