import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase,roles} from '../src/database.mjs';
import {isReviewer,isPublisher} from '../src/security.mjs';

test('legacy account roles migrate once with a recoverable backup and preserve identities, profiles and files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pm-role-upgrade-'));
  let db=openDatabase(dir);
  const oldRoles=['专业教师','系主任','教学主任','系管理员','系统管理员','只读访客','学生'];
  oldRoles.forEach((role,i)=>db.prepare('INSERT INTO users(id,account,name,role,password,profile,revision,created_at) VALUES(?,?,?,?,?,?,?,?)').run(String(i),'account'+i,'name'+i,role,'original-hash',JSON.stringify({type:'专业教师'}),3,'2026-01-01'));
  const before=db.prepare('SELECT * FROM users ORDER BY id').all();
  writeFileSync(join(dir,'uploads','existing.txt'),'existing attachment');
  db.prepare('DELETE FROM migrations WHERE version=8').run();db.close();
  db=openDatabase(dir);
  const after=db.prepare('SELECT * FROM users ORDER BY id').all();
  assert.deepEqual(after.map(u=>({...u})),before.map((u,i)=>i<4?{...u,role:'导师',revision:4}:{...u}));
  const backups=readdirSync(join(dir,'backups'));assert.equal(backups.length,1);
  const restored=new DatabaseSync(join(dir,'backups',backups[0]),{readOnly:true});
  assert.deepEqual(restored.prepare('SELECT * FROM users ORDER BY id').all(),before);restored.close();
  assert.equal(readFileSync(join(dir,'uploads','existing.txt'),'utf8'),'existing attachment');
  db.close();db=openDatabase(dir);assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),after);db.close();
  assert.equal(readdirSync(join(dir,'backups')).length,1);
});

test('four account roles keep global administration separate from ordinary project members',()=>{
  assert.deepEqual(roles,['系统管理员','导师','学生','只读访客']);
  for(const role of roles)assert.equal(isReviewer({role}),role==='系统管理员');
  assert.equal(isPublisher({role:'导师'}),true);
  assert.equal(isPublisher({role:'学生'}),false);
  assert.equal(isPublisher({role:'只读访客'}),false);
});
