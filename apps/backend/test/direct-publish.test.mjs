import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database.mjs';

test('retiring review publishes legacy records once without altering content or deleting data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jtgc-publish-'));
  let db;
  try {
    db = openDatabase(dir);
    db.prepare('DELETE FROM migrations WHERE version=2').run();
    db.prepare('INSERT INTO users(id,account,name,role,password,created_at) VALUES(?,?,?,?,?,?)').run('u','u','教师','专业教师','unchanged','2026-01-01');
    for (const state of ['pending','rejected','published']) {
      db.prepare('INSERT INTO records(id,kind,creator,state,payload,review_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(state,'news','u',state,'{"title":"旧新闻","attachments":["file"]}','原意见','2026-01-01','2026-01-01');
    }
    db.close(); db = openDatabase(dir);
    const rows = db.prepare('SELECT * FROM records ORDER BY id').all();
    assert.equal(rows.length,3);
    for (const r of rows) {
      assert.equal(r.state,'published');
      assert.equal(r.payload,'{"title":"旧新闻","attachments":["file"]}');
      assert.equal(r.review_note,'原意见');
      assert.equal(r.revision,r.id === 'published' ? 1 : 2);
    }
    db.close(); db = openDatabase(dir);
    assert.deepEqual(db.prepare('SELECT * FROM records ORDER BY id').all(),rows);
  } finally { db?.close(); rmSync(dir,{recursive:true,force:true}); }
});
