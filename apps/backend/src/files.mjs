import { randomUUID, createHash } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fail, text, digest } from './security.mjs';

function imageMime(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.subarray(0,6).toString())) return 'image/gif';
  if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') return 'image/webp';
  return '';
}
export const MAX_FILE_BYTES = 500 * 1024 * 1024;
function videoMime(bytes,name){
  if(/\.mp4$/i.test(name) && bytes.subarray(4,8).toString()==='ftyp')return 'video/mp4';
  if(/\.webm$/i.test(name) && bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return 'video/webm';
  return '';
}
export async function uploadFile(req, db, dir, userId, name, images = false) {
  name = text(name, '文件名称', 200, true).replace(/[\/\\]/g, '_');
  if (Number(req.headers['content-length']) > MAX_FILE_BYTES) fail(413, '每个文件不超过500MB');
  const temporary = join(dir, 'uploads', '.upload-' + randomUUID());
  const handle = await open(temporary, 'wx', 0o600);
  let size = 0, header = Buffer.alloc(0); const hash = createHash('sha256');
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_FILE_BYTES) fail(413, '每个文件不超过500MB');
      if (header.length < 16) header = Buffer.concat([header, chunk.subarray(0, 16 - header.length)]);
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) { const { bytesWritten } = await handle.write(chunk, offset); offset += bytesWritten; }
    }
    if (!size) fail(400, '不能上传空文件');
    let mime = imageMime(header);
    if (images && !mime) fail(400, '图片仅支持PNG、JPEG、GIF和WebP');
    if (!mime) mime = videoMime(header,name) || (header.subarray(0,5).toString() === '%PDF-' ? 'application/pdf' : 'application/octet-stream');
    const value = hash.digest('hex'); await handle.close();
    if (!existsSync(join(dir,'uploads',value))) await rename(temporary, join(dir,'uploads',value));
    const id = randomUUID();
    db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?)').run(id, 'upload', userId, name, mime, size, value);
    return { id, name, type: mime, size, data: `/api/files/${id}` };
  } finally { await handle.close().catch(()=>{}); await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e}); }
}
export function saveFiles(db, dir, entity, entityId, files, images = false, userId = '') {
  if (!Array.isArray(files)) fail(400, '文件列表格式不正确');
  return files.map(file => {
    if (!file || typeof file !== 'object') fail(400, '附件格式不正确');
    if (typeof file.data === 'string' && /^\/api\/files\/[\w-]+$/.test(file.data)) {
      const id = file.data.split('/').pop();
      let old = db.prepare('SELECT * FROM files WHERE id=? AND entity=? AND entity_id=?').get(id, entity, entityId);
      if (!old && userId) {
        old = db.prepare("SELECT * FROM files WHERE id=? AND entity='upload' AND entity_id=?").get(id,userId);
        if(old) db.prepare('UPDATE files SET entity=?,entity_id=? WHERE id=?').run(entity,entityId,id);
      }
      if (!old || (images && !old.mime.startsWith('image/'))) fail(400, '附件不属于当前记录');
      return { id: old.id, name: old.filename, type: old.mime, size: old.size, data: `/api/files/${old.id}` };
    }
    const name = text(file.name, '文件名称', 200, true).replace(/[\/\\]/g, '_');
    const match = typeof file.data === 'string' && /^data:[^;,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(file.data);
    if (!match) fail(400, '文件编码不正确');
    const bytes = Buffer.from(match[1], 'base64');
    // Compatibility for older small inline files; large files must use the streaming endpoint.
    if (!bytes.length) fail(400, '不能上传空文件');
    if (bytes.length > (images ? 5 : 10) * 1024 * 1024) fail(400, '内嵌文件过大，请使用独立上传接口（单文件不超过500MB）');
    let mime = imageMime(bytes);
    if (images && !mime) fail(400, '图片仅支持PNG、JPEG、GIF和WebP');
    if (!mime) mime = videoMime(bytes,name) || (bytes.subarray(0,5).toString() === '%PDF-' ? 'application/pdf' : 'application/octet-stream');
    const hash = digest(bytes), path = join(dir, 'uploads', hash);
    if (!existsSync(path)) writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
    const id = randomUUID();
    db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?)').run(id, entity, entityId, name, mime, bytes.length, hash);
    return { id, name, type: mime, size: bytes.length, data: `/api/files/${id}` };
  });
}
