import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, join, extname, dirname, relative as relativePath, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, transaction, categories, roles, audit } from './database.mjs';
import { fail, text, date, list, token, digest, passwordHash, passwordMatches, isAdmin, isReviewer, canRead, canEdit, canDelete, requireAdmin } from './security.mjs';
import { validateAccountImport } from './account-import.mjs';
import { bindInlineMedia, inlineFileIds } from './inline-media.mjs';
import { saveFiles, uploadFile } from './files.mjs';
import { projectRoutes } from './projects.mjs';
import { organizationModule } from './organization.mjs';
import { feishuModule } from './feishu.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const now = () => new Date().toISOString();
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function body(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, '请使用JSON请求');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 75 * 1024 * 1024) fail(413, '请求过大，请分批上传'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '请求须为对象'); return value; }
  catch { fail(400, '请求不是有效JSON对象'); }
}
export function createApplication(options = {}) {
  const dir = resolve(options.dir || process.env.JTGC_DATA_DIR || join(root, '../.local/jtgc'));
  const db = openDatabase(dir);
  const feishu=feishuModule(db,dir,{body,json,fetcher:options.feishuFetch,worker:options.feishuWorker!==false});
  const handleProjects = projectRoutes(db, body, json,feishu.taskSaved);
  const origins = new Set((process.env.JTGC_ORIGINS || 'http://localhost:5178,http://127.0.0.1:5178,http://localhost:5188,http://127.0.0.1:5188').split(','));
  const secure = process.env.JTGC_SECURE_COOKIE === '1';
  const dist = options.dist || resolve(root, 'frontend/dist');
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    const password = options.password || token().slice(0,24);
    const id = randomUUID();
    db.prepare('INSERT INTO users(id,account,name,role,password,created_at) VALUES(?,?,?,?,?,?)').run(id, 'admin', '系统管理员', '系统管理员', passwordHash(password), now());
    if (!options.password) writeFileSync(join(dir, 'initial-admin.txt'), `本地项目管理系统\n账号：admin\n初始密码：${password}\n请登录后在左下角修改密码。密码不会在再次启动时重置。\n`, { mode: 0o600 });
    audit(db, id, '初始化', id);
  }
  const dummyHash = passwordHash(token());
  const attempts = new Map();
  let activeUploads = 0;
  const getUser = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const publicUser = u => ({ id: u.id, account: u.account, name: u.name, role: u.role, active: !!u.active, revision: u.revision });
  const profile = u => ({ ...Object.fromEntries(['position','title','employmentDate','phone','email','employeeId','orcid','direction','homepage','office','summary'].map(k=>[k,''])), ...JSON.parse(u.profile), id: u.id, name: u.name, role: u.role, revision: u.revision, active: !!u.active, createdAt: u.created_at,
    type: JSON.parse(u.profile).type || '专业教师', attachments: JSON.parse(u.profile).attachments || [], images: JSON.parse(u.profile).images || [] });
  const organization=organizationModule(db,dir,body,json,profile);
  const dictionary = () => { const result = {}; for (const r of db.prepare('SELECT * FROM dictionaries ORDER BY position,name').all()) (result[r.scope] ||= []).push(r); return result; };
  function inDictionary(scope, value) { return !!db.prepare('SELECT id FROM dictionaries WHERE scope=? AND name=?').get(scope, value); }
  function recordDto(r) {
    const payload = JSON.parse(r.payload);
    // Present legacy teaching owners as participants without rewriting stored data.
    if (r.kind === 'teaching' && payload.owner && !payload.participants?.length) {
      payload.participants = [payload.owner]; payload.owner = '';
    }
    return { ...payload, id: r.id, kind: r.kind, creator: r.creator, state: r.state, revision: r.revision, reviewNote: r.review_note, createdAt: r.created_at, updatedAt: r.updated_at };
  }
  function visibleRecords(user) { return db.prepare('SELECT * FROM records WHERE deleted=0 ORDER BY updated_at DESC').all().filter(r => canRead(user, r)).map(recordDto); }
  function recordInput(input, user, id, existing) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, '记录须为对象');
    if (!own(categories, input.kind)) fail(400, '未知栏目');
    if (existing && existing.kind !== input.kind) fail(400, '不能更改记录所属栏目');
    const r = { kind: input.kind, title: text(input.title, '名称', 150, true), category: text(input.category, '类型', 100, true) };
    if (!inDictionary(r.kind, r.category)) fail(400, '请选择已维护的类型');
    for (const k of ['owner','major','version','year','level','source','achievementSource','achievementGrade','course','courseCode','courseType','credits','hours','theory','practice','materialStatus']) r[k] = text(input[k], k, 200);
    r.summary = text(input.summary, '正文／摘要', 100000);
    if(r.kind==='students') {
      r.advisor=text(input.advisor,'指导老师',100,true);
      const teacher=db.prepare('SELECT role FROM users WHERE name=?').get(r.advisor);
      if(!teacher || ['系统管理员','只读访客'].includes(teacher.role))fail(400,'指导老师须选择本系人员');
      if(!r.owner || /[,，、;；\n]/.test(r.owner))fail(400,'请填写一位学生项目主持姓名');
    }
    r.start = date(input.start, '开始日期'); r.end = date(input.end, '结束日期');
    if (r.start && r.end && r.end < r.start) fail(400, '结束日期不能早于开始日期');
    r.participants = list(input.participants || [], '参与人员');
    if (r.participants.some(n => /[,，、;；\n]/.test(n))) fail(400, '每个参与人员只填写一个姓名');
    if (['development', 'teaching', 'daily'].includes(r.kind)) { r.owner = ''; if (!r.participants.length) fail(400, '请填写参加人员'); }
    else if (r.kind === 'news') { r.owner = ''; r.participants = []; }
    else if (r.kind!=='students' && !db.prepare('SELECT id FROM users WHERE name=?').get(r.owner)) fail(400, '负责人／项目主持须为已有人员');
    if (r.kind === 'materials') {
      if (!inDictionary('majors', r.major)) fail(400, '请选择已维护的适用专业');
      if (!['现行', '历史版本'].includes(r.materialStatus)) fail(400, '请选择资料状态');
      if (!r.version) fail(400, '请填写版本');
    }
    if (['achievements','research','students'].includes(r.kind) && r.year && !/^(19|20|21)\d{2}$/.test(r.year)) fail(400, '成果年度格式不正确');
    for (const k of ['credits','hours','theory','practice']) if (r[k] && (!Number.isFinite(Number(r[k])) || Number(r[k]) < 0)) fail(400, '学分学时须为非负数字');
    r.attachments = saveFiles(db, dir, 'record', id, input.attachments || [], false, user.id);
    r.images = saveFiles(db, dir, 'record', id, input.images || [], true, user.id);
    bindInlineMedia(db,dir,'record',id,r.summary,user.id);
    return r;
  }
  function saveRecord(input, user, routeId) {
    const id = routeId || randomUUID(), old = routeId ? db.prepare('SELECT * FROM records WHERE id=?').get(id) : null;
    if (routeId && (!old || old.deleted)) fail(404, '记录不存在');
    if (old && !canEdit(user, old)) fail(403, '无编辑权限');
    if (old && input.revision !== old.revision) fail(409, '记录已被他人修改，请刷新后重试');
    const value = recordInput(input, user, id, old);
    const state = 'published';
    if (old) db.prepare('UPDATE records SET payload=?,state=?,revision=revision+1,review_note=\'\',updated_at=? WHERE id=?').run(JSON.stringify(value), state, now(), id);
    else db.prepare('INSERT INTO records(id,kind,creator,state,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, value.kind, user.id, state, JSON.stringify(value), now(), now());
    db.prepare('DELETE FROM participants WHERE record_id=?').run(id);
    value.participants.forEach((name, i) => db.prepare('INSERT INTO participants VALUES(?,?,?,?)').run(id, i + 1, name, db.prepare('SELECT id FROM users WHERE name=?').get(name)?.id || null));
    audit(db, user.id, old ? '修改记录' : '新增记录', id, value.title);
    return recordDto(db.prepare('SELECT * FROM records WHERE id=?').get(id));
  }
  function cookie(res, value, age) { res.setHeader('Set-Cookie', `jtgc_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`); }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method;
      if (!path.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') fail(405, '不支持此方法');
        const relative = decodeURIComponent(path).replace(/^\/+/, '');
        let file = resolve(dist, relative || 'index.html');
        const within = relativePath(resolve(dist), file);
        if (within.startsWith('..') || isAbsolute(within)) fail(404, '未找到页面');
        if (!existsSync(file) || !statSync(file).isFile()) file = join(dist, 'index.html');
        if (!existsSync(file)) fail(503, '前端尚未构建，请运行本地构建命令');
        const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(file)] || 'application/octet-stream';
        res.setHeader('Content-Type', type); if (method === 'HEAD') return res.end(); return createReadStream(file).pipe(res);
      }
      if (path === '/api/health' && method === 'GET') return json(res, 200, { ok: true, version: 1 });
      const write = !['GET', 'HEAD'].includes(method);
      if (write) {
        const origin = req.headers.origin;
        if (origin && origin !== `${secure ? 'https' : 'http'}://${req.headers.host}` && !origins.has(origin)) fail(403, '请求来源不被允许');
        if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, '不允许跨站请求');
      }
      if (path === '/api/login' && method === 'POST') {
        const data = await body(req), account = text(data.account, '账号', 150, true);
        const key = `${req.socket.remoteAddress}:${account.toLowerCase()}`, limit = attempts.get(key);
        if (limit && limit.until > Date.now() && limit.count >= 5) fail(429, '尝试次数过多，请15分钟后重试');
        const u = db.prepare('SELECT * FROM users WHERE account=? COLLATE NOCASE').get(account);
        if (!passwordMatches(data.password, u?.password || dummyHash) || !u?.active) {
          const count = limit && limit.until > Date.now() ? limit.count + 1 : 1;
          attempts.set(key, { count, until: Date.now() + 15 * 60 * 1000 });
          if (attempts.size > 10000) for (const [k,v] of attempts) if (v.until < Date.now()) attempts.delete(k);
          fail(401, '账号或密码不正确');
        }
        attempts.delete(key); const sessionToken = token(), csrf = token();
        db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
        db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(sessionToken), u.id, csrf, Date.now() + 8 * 3600000);
        cookie(res, sessionToken, 8 * 3600); audit(db, u.id, '登录', u.id);
        return json(res, 200, { user: publicUser(u), csrf });
      }
      const sessionToken = /(?:^|;\s*)jtgc_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
      const session = sessionToken && db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(digest(sessionToken), Date.now());
      const user = session && getUser(session.user_id);
      if (!user?.active) fail(401, '请先登录');
      if (write && req.headers['x-csrf-token'] !== session.csrf) fail(403, '安全校验失败，请刷新页面');
      if (user.role === '只读访客' && write && !['/api/logout','/api/password'].includes(path)) fail(403, '访客账号仅可查看，不能修改业务数据');
      if (await feishu.route(req,res,path,method,user)) return;
      if (await organization.route(req,res,path,method,user)) return;
      if (await handleProjects(req,res,path,method,user)) return;
      if (path === '/api/uploads' && method === 'POST') {
        if(activeUploads >= 2) fail(429,'上传繁忙，请稍后重试');
        activeUploads++;
        try { return json(res,201,await uploadFile(req,db,dir,user.id,url.searchParams.get('name'),url.searchParams.get('image') === '1')); }
        finally { activeUploads--; }
      }
      if (path === '/api/session' && method === 'GET') return json(res, 200, { user: publicUser(user), csrf: session.csrf });
      if (path === '/api/logout' && method === 'POST') { db.prepare('DELETE FROM sessions WHERE token=?').run(session.token); audit(db,user.id,'退出登录',user.id); cookie(res, '', 0); return json(res,200,{ok:true}); }
      if (path === '/api/password' && method === 'POST') {
        const d = await body(req); if (!passwordMatches(d.current, user.password)) fail(400, '当前密码不正确');
        const hash = passwordHash(d.password);
        transaction(db, () => { db.prepare('UPDATE users SET password=? WHERE id=?').run(hash,user.id); db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id,session.token); audit(db,user.id,'修改密码',user.id); });
        return json(res,200,{ok:true});
      }
      if (path === '/api/bootstrap' && method === 'GET') return json(res,200,{ user: publicUser(user), records: visibleRecords(user), personnel: [...db.prepare('SELECT * FROM users ORDER BY created_at').all().map(profile),...organization.snapshot().people.filter(p=>p.organizationPerson)], dictionaries: dictionary() });
      if (path === '/api/records' && method === 'GET') return json(res,200,visibleRecords(user));
      if (path === '/api/trash' && method === 'GET') { requireAdmin(user); return json(res,200,db.prepare('SELECT * FROM records WHERE deleted=1 ORDER BY updated_at DESC').all().map(recordDto)); }
      const restoreMatch = /^\/api\/trash\/([\w-]+)\/restore$/.exec(path);
      if (restoreMatch && method === 'POST') {
        requireAdmin(user); const r=db.prepare('SELECT * FROM records WHERE id=? AND deleted=1').get(restoreMatch[1]);if(!r)fail(404,'记录不存在');
        transaction(db,()=>{db.prepare('UPDATE records SET deleted=0,revision=revision+1,updated_at=? WHERE id=?').run(now(),r.id);audit(db,user.id,'恢复记录',r.id,JSON.parse(r.payload).title)});
        return json(res,200,recordDto(db.prepare('SELECT * FROM records WHERE id=?').get(r.id)));
      }
      if (path === '/api/records' && method === 'POST') { const d = await body(req); return json(res,201,transaction(db, () => saveRecord(d,user))); }
      if (path === '/api/import' && method === 'POST') {
        const d = await body(req); if (!Array.isArray(d.records) || !d.records.length || d.records.length > 500) fail(400, '每次导入1至500条记录');
        return json(res,201,transaction(db, () => d.records.map(r => saveRecord(r,user))));
      }
      const recordMatch = /^\/api\/records\/([\w-]+)(?:\/(review))?$/.exec(path);
      if (recordMatch) {
        const id = recordMatch[1], r = db.prepare('SELECT * FROM records WHERE id=?').get(id);
        if (!r || !canRead(user,r)) fail(404, '记录不存在或无权查看');
        if (method === 'GET') return json(res,200,recordDto(r));
        const d = await body(req);
        if (method === 'POST' && recordMatch[2] === 'review') {
          fail(410, '审核流程已取消，记录保存后直接发布');
        }
        if (method === 'PUT' && !recordMatch[2]) return json(res,200,transaction(db, () => saveRecord(d,user,id)));
        if (method === 'DELETE' && !recordMatch[2]) {
          if (!canDelete(user,r)) fail(403,'无删除权限'); if (d.revision !== r.revision) fail(409,'记录已变化，请刷新');
          transaction(db, () => { db.prepare('UPDATE records SET deleted=1,revision=revision+1,updated_at=? WHERE id=?').run(now(),id); audit(db,user.id,'删除记录',id,JSON.parse(r.payload).title); });
          return json(res,200,{ok:true});
        }
      }
      if (path === '/api/users/import' && method === 'POST') {
        requireAdmin(user); const d = await body(req);
        const batch = validateAccountImport(db,d.users,roles);
        const defaultType=db.prepare("SELECT name FROM dictionaries WHERE scope='memberTypes' ORDER BY position,name LIMIT 1").get()?.name;
        if(!defaultType) fail(400,'请先在系统管理维护至少一个成员类型');
        if(batch.errors.length || d.dryRun === true) return json(res,200,{count:batch.users.length,errors:batch.errors,created:0});
        const created=transaction(db,()=>batch.users.map(row=>{
          const id=randomUUID();
          db.prepare('INSERT INTO users(id,account,name,role,password,profile,created_at) VALUES(?,?,?,?,?,?,?)').run(id,row.account,row.name,row.role,passwordHash(row.password),JSON.stringify({type:defaultType}),now());
          db.prepare('UPDATE participants SET user_id=? WHERE name=? AND user_id IS NULL').run(id,row.name);
          audit(db,user.id,'批量创建账号',id,row.name);
          return publicUser(getUser(id));
        }));
        return json(res,201,{created:created.length,users:created,errors:[]});
      }
      if (path === '/api/users' && method === 'GET') { requireAdmin(user); return json(res,200,db.prepare('SELECT * FROM users ORDER BY created_at DESC,rowid DESC').all().map(publicUser)); }
      if (path === '/api/users' && method === 'POST') {
        requireAdmin(user); const d = await body(req), account = text(d.account,'账号',150,true), name = text(d.name,'姓名',100,true);
        if (!/^[a-zA-Z0-9@._+-]+$/.test(account)) fail(400,'账号仅可使用英文字母、数字及@._+-');
        if (!roles.includes(d.role)) fail(400,'未知角色'); if (/[,，、;；\n]/.test(name)) fail(400,'姓名不能包含分隔符');
        if (db.prepare('SELECT id FROM users WHERE account=? OR name=?').get(account,name)) fail(409,'账号或姓名已存在（同名人员请增加姓名后缀）');
        const hash = passwordHash(d.password), id = randomUUID();
        const defaultType=db.prepare("SELECT name FROM dictionaries WHERE scope='memberTypes' ORDER BY position,name LIMIT 1").get()?.name;
        if(!defaultType) fail(400,'请先在系统管理维护至少一个成员类型');
        transaction(db, () => { db.prepare('INSERT INTO users(id,account,name,role,password,profile,created_at) VALUES(?,?,?,?,?,?,?)').run(id,account,name,d.role,hash,JSON.stringify({type:defaultType}),now()); db.prepare('UPDATE participants SET user_id=? WHERE name=? AND user_id IS NULL').run(id,name); audit(db,user.id,'创建账号',id,name); });
        return json(res,201,publicUser(getUser(id)));
      }
      const userMatch = /^\/api\/users\/([\w-]+)(?:\/(profile))?$/.exec(path);
      if (userMatch && method === 'PUT') {
        const target = getUser(userMatch[1]); if (!target) fail(404,'人员不存在');
        const d = await body(req); if (d.revision !== target.revision) fail(409,'人员资料已变化，请刷新');
        if (userMatch[2]) {
          if (target.id !== user.id && !isReviewer(user)) fail(403,'只能编辑自己的人员资料');
          const p = {};
          for (const field of ['type','position','title','phone','email','employeeId','orcid','direction','homepage','office','summary']) p[field] = text(d[field],field,field === 'summary' ? 10000 : 500);
          if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) fail(400,'工作邮箱格式不正确');
          if (p.homepage && !/^https?:\/\//.test(p.homepage)) fail(400,'学术主页须以http://或https://开头');
          p.employmentDate = date(d.employmentDate === undefined ? JSON.parse(target.profile).employmentDate : d.employmentDate, '入职时间');
          if (p.orcid && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(p.orcid)) fail(400,'ORCID格式不正确');
          if (!p.type) p.type = '专业教师'; if (!inDictionary('memberTypes',p.type)) fail(400,'请选择已维护的成员类型');
          transaction(db, () => { bindInlineMedia(db,dir,'person',target.id,p.summary,user.id); p.attachments = saveFiles(db,dir,'person',target.id,d.attachments || [],false,user.id); p.images = saveFiles(db,dir,'person',target.id,d.images || [],true,user.id); db.prepare('UPDATE users SET profile=?,revision=revision+1 WHERE id=?').run(JSON.stringify(p),target.id); audit(db,user.id,'修改人员资料',target.id); });
          return json(res,200,profile(getUser(target.id)));
        }
        requireAdmin(user);
        if (!roles.includes(d.role) || typeof d.active !== 'boolean') fail(400,'角色或启用状态不正确');
        if (target.id === user.id && (!d.active || d.role !== '系统管理员')) fail(400,'不能停用或降级当前管理员');
        const hash = d.password ? passwordHash(d.password) : target.password;
        const name = d.name === undefined ? target.name : text(d.name,'姓名',100,true);
        if (/[,，、;；\n]/.test(name)) fail(400,'姓名不能包含分隔符');
        if (name !== target.name && db.prepare('SELECT id FROM users WHERE name=?').get(name)) fail(409,'姓名已存在');
        if (name !== target.name && db.prepare('SELECT payload FROM records').all().some(r => { const p=JSON.parse(r.payload); return p.participants?.includes(target.name) && p.participants.includes(name); })) fail(409,'新姓名与某条记录的其他参与人员重名，请先整理该记录的人员名单');
        transaction(db, () => {
          db.prepare('UPDATE users SET name=?,role=?,active=?,password=?,revision=revision+1 WHERE id=?').run(name,d.role,Number(d.active),hash,target.id);
          if (name !== target.name) {
            for (const r of db.prepare('SELECT * FROM records').all()) {
              const p = JSON.parse(r.payload); let changed = false;
              if(p.owner === target.name && r.kind!=='students'){p.owner=name;changed=true}
              if(p.advisor === target.name){p.advisor=name;changed=true}
              if(p.participants?.includes(target.name)){p.participants=p.participants.map(n=>n===target.name?name:n);changed=true}
              if(changed) db.prepare('UPDATE records SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(p),now(),r.id);
            }
            db.prepare('UPDATE participants SET name=? WHERE user_id=?').run(name,target.id);
          }
          if(target.id !== user.id || d.password) db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
          audit(db,user.id,'更新账号',target.id,name);
        });
        return json(res,200,publicUser(getUser(target.id)));
      }
      if (userMatch && method === 'DELETE' && !userMatch[2]) {
        requireAdmin(user); const target = getUser(userMatch[1]); if(!target)fail(404,'账号不存在');if(target.id===user.id)fail(400,'不能删除当前管理员');
        const referenced = db.prepare('SELECT id FROM records WHERE creator=? LIMIT 1').get(target.id) || db.prepare('SELECT record_id FROM participants WHERE user_id=? LIMIT 1').get(target.id) || db.prepare('SELECT id FROM tasks WHERE creator=? LIMIT 1').get(target.id) || db.prepare('SELECT task_id FROM task_recipients WHERE user_id=? LIMIT 1').get(target.id) || db.prepare('SELECT id FROM records WHERE json_extract(payload,\'$.owner\')=? LIMIT 1').get(target.name);
        if(referenced || db.prepare('SELECT id FROM pm_milestones WHERE owner_id=? OR creator_id=? LIMIT 1').get(target.id,target.id) || db.prepare('SELECT id FROM pm_time_entries WHERE user_id=? OR creator_id=? LIMIT 1').get(target.id,target.id) || db.prepare('SELECT id FROM pm_projects WHERE owner_id=? OR creator_id=? LIMIT 1').get(target.id,target.id) || db.prepare('SELECT project_id FROM pm_members WHERE user_id=? LIMIT 1').get(target.id) || db.prepare('SELECT id FROM pm_tasks WHERE assignee_id=? OR creator_id=? LIMIT 1').get(target.id,target.id) || db.prepare('SELECT id FROM pm_events WHERE actor_id=? LIMIT 1').get(target.id) || db.prepare("SELECT id FROM records WHERE json_extract(payload,'$.advisor')=? LIMIT 1").get(target.name) || db.prepare('SELECT id FROM announcements WHERE creator=? LIMIT 1').get(target.id))fail(409,'该账号有关联数据，请改为停用以保留历史信息');
        if(db.prepare('SELECT id FROM pm_organization_people WHERE user_id=? AND organization_id IS NOT NULL').get(target.id))fail(409,'账号属于组织单位，请先移出单位');
        transaction(db,()=>{db.prepare('DELETE FROM pm_organization_people WHERE user_id=?').run(target.id);db.prepare('DELETE FROM users WHERE id=?').run(target.id);audit(db,user.id,'删除未使用账号',target.id,target.name)});return json(res,200,{ok:true});
      }
      if (path === '/api/dictionaries' && method === 'GET') return json(res,200,dictionary());
      if (path === '/api/dictionaries' && method === 'POST') {
        requireAdmin(user); const d = await body(req); if (![...Object.keys(categories),'majors','memberTypes'].includes(d.scope)) fail(400,'未知字典');
        const name = text(d.name,'名称',100,true), id = randomUUID();
        if (inDictionary(d.scope,name)) fail(409,'名称已存在');
        transaction(db, () => { db.prepare('INSERT INTO dictionaries VALUES(?,?,?,?)').run(id,d.scope,name,100); audit(db,user.id,'新增分类',id,name); }); return json(res,201,dictionary());
      }
      const dictMatch = /^\/api\/dictionaries\/([\w-]+)$/.exec(path);
      if (dictMatch && ['PUT','DELETE'].includes(method)) {
        requireAdmin(user); const old = db.prepare('SELECT * FROM dictionaries WHERE id=?').get(dictMatch[1]); if (!old) fail(404,'分类不存在');
        const d = await body(req), name = method === 'PUT' ? text(d.name,'名称',100,true) : '';
        if (method === 'PUT' && name !== old.name && inDictionary(old.scope,name)) fail(409,'名称已存在');
        const rows = db.prepare('SELECT * FROM records').all().filter(r => { const p = JSON.parse(r.payload); return old.scope === 'majors' ? p.major === old.name : r.kind === old.scope && p.category === old.name; });
        const users = old.scope === 'memberTypes' ? db.prepare('SELECT * FROM users').all().filter(u => (JSON.parse(u.profile).type || '专业教师') === old.name) : [];
        const organizationPeople = old.scope === 'memberTypes' ? db.prepare('SELECT * FROM pm_organization_people').all().filter(p => JSON.parse(p.profile).type === old.name) : [];
        if (method === 'DELETE' && (rows.length || users.length || organizationPeople.length)) fail(409,'该选项正在使用，不能删除；可修改名称');
        transaction(db, () => {
          if (method === 'DELETE') db.prepare('DELETE FROM dictionaries WHERE id=?').run(old.id);
          else {
            db.prepare('UPDATE dictionaries SET name=? WHERE id=?').run(name,old.id);
            for (const r of rows) { const p = JSON.parse(r.payload); p[old.scope === 'majors' ? 'major' : 'category'] = name; db.prepare('UPDATE records SET payload=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(p),now(),r.id); }
            for (const u of users) { const p = JSON.parse(u.profile); p.type = name; db.prepare('UPDATE users SET profile=?,revision=revision+1 WHERE id=?').run(JSON.stringify(p),u.id); }
            for (const person of organizationPeople) { const p = JSON.parse(person.profile); p.type = name; db.prepare('UPDATE pm_organization_people SET profile=?,revision=revision+1 WHERE id=?').run(JSON.stringify(p),person.id); }
          }
          audit(db,user.id,method === 'PUT' ? '修改分类' : '删除分类',old.id,old.name);
        }); return json(res,200,dictionary());
      }
      if (path === '/api/audit' && method === 'GET') { requireAdmin(user); const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0); return json(res,200,{ total: db.prepare('SELECT count(*) AS n FROM audit').get().n, rows: db.prepare('SELECT a.*,u.name AS actorName FROM audit a LEFT JOIN users u ON a.actor=u.id ORDER BY a.id DESC LIMIT 50 OFFSET ?').all(offset) }); }
      const fileMatch = /^\/api\/files\/([\w-]+)$/.exec(path);
      if (fileMatch && method === 'GET') {
        const file = db.prepare('SELECT * FROM files WHERE id=?').get(fileMatch[1]); if (!file) fail(404,'文件不存在');
        let payload, content='', allowed=false;
        if(file.entity==='upload')allowed=file.entity_id===user.id;
        else if(file.entity==='record'){
          const entity=db.prepare('SELECT * FROM records WHERE id=?').get(file.entity_id);
          if(entity && !entity.deleted && canRead(user,entity)){payload=JSON.parse(entity.payload);content=payload.summary || '';allowed=true;}
        }else if(file.entity==='organization-person'){
          const entity=db.prepare('SELECT profile FROM pm_organization_people WHERE id=? AND user_id IS NULL').get(file.entity_id);
          if(entity){payload=JSON.parse(entity.profile);content=payload.summary||'';allowed=true;}
        }else if(file.entity==='person'){
          const entity=getUser(file.entity_id);
          if(entity){payload=JSON.parse(entity.profile);content=payload.summary || '';allowed=true;}
        }
        if(!allowed)fail(404,'文件不存在或无权读取');
        if(file.entity!=='upload' && ![...(payload?.attachments || []),...(payload?.images || [])].some(f=>f.id===file.id) && !inlineFileIds(content).includes(file.id))fail(404,'文件已被移除');
        res.setHeader('Content-Type',file.mime);
        res.setHeader('Cache-Control','private, no-store');
        res.setHeader('Accept-Ranges','bytes');
        res.setHeader('Content-Disposition', `${/^(image|video)\//.test(file.mime) && !url.searchParams.has('download') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
        let start=0,end=file.size-1;
        if(req.headers.range){
          const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if(!match || (!match[1] && !match[2])){res.writeHead(416,{'Content-Range':`bytes */${file.size}`});return res.end();}
          if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
          else start=Math.max(0,file.size-Number(match[2]));
          if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=file.size){res.writeHead(416,{'Content-Range':`bytes */${file.size}`});return res.end();}
          res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${file.size}`);
        }
        res.setHeader('Content-Length',end-start+1);
        return createReadStream(join(dir,'uploads',file.hash),{start,end}).on('error',()=>res.destroy()).pipe(res);
      }
      fail(404,'接口不存在');
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (!error.status) console.error('API error:', error.message);
      json(res,error.status || 500,{ error: error.status ? error.message : '服务器处理失败，请稍后重试' });
    }
  });
  server.requestTimeout = 30 * 60 * 1000; server.headersTimeout = 10000;
  return { server, db, dir, feishu, close: async () => {await feishu.close();await new Promise(resolve => server.close(resolve));db.close();} };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApplication();
  app.server.listen(Number(process.env.PORT || 5180), process.env.HOST || '127.0.0.1', () => console.log(`交工系API已启动，端口${process.env.PORT || 5180}；数据目录：${app.dir}`));
  for (const sig of ['SIGINT','SIGTERM']) process.on(sig, async () => { await app.close(); process.exit(0); });
}
