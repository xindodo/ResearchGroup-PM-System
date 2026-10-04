import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
export function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) fail(400, '密码长度须为10至128位');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, hash) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, expected] = hash.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, 'hex'));
}
export const isAdmin = user => user.role === '系统管理员';
export const isReviewer = user => isAdmin(user);
export const isPublisher = user => ['系统管理员', '导师'].includes(user.role);
export const canRead = (user, record) => !record.deleted && (record.state === 'published' || (user.role !== '只读访客' && (record.creator === user.id || isReviewer(user))));
export const canEdit = (user, record) => user.role !== '只读访客' && canRead(user, record);
export const canDelete = (user, record) => user.role !== '只读访客' && !record.deleted && (record.creator === user.id || isReviewer(user));
export function requireAdmin(user) { if (!isAdmin(user)) fail(403, '只有系统管理员可执行此操作'); }
export function text(value, label, max = 200, required = false) {
  if (value == null) value = '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, `${label}格式不正确或过长`);
  const result = value.trim(); if (required && !result) fail(400, `请填写${label}`); return result;
}
export function date(value, label) {
  const result = text(value, label, 10);
  if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString().slice(0,10) !== result)) fail(400, `${label}不是有效日期`);
  return result;
}
export function list(value, label, max = 100) {
  if (!Array.isArray(value) || value.length > max) fail(400, `${label}须为不超过${max}项的列表`);
  const values = value.map(x => text(x, label, 100, true));
  if (new Set(values).size !== values.length) fail(400, `${label}存在重复项`);
  return values;
}
