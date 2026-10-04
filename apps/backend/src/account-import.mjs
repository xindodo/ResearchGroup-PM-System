import { text, fail } from './security.mjs';

// Validate the whole batch before writing; existing accounts are never overwritten.
export function validateAccountImport(db, rows, roles) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) fail(400, '每次请导入1至500个账号');
  const accounts = new Set(db.prepare('SELECT lower(account) account FROM users').all().map(r => r.account));
  const names = new Set(db.prepare('SELECT name FROM users').all().map(r => r.name));
  const errors = [], users = [];
  rows.forEach((row, index) => {
    try {
      if (!row || typeof row !== 'object') fail(400, '账号数据格式不正确');
      const account = text(row.account, '账号', 150, true), name = text(row.name, '姓名', 100, true);
      const role = text(row.role, '角色', 100) || '导师';
      if (!/^[a-zA-Z0-9@._+-]+$/.test(account)) fail(400, '账号仅可使用英文字母、数字及@._+-');
      if (/[,，、;；\n]/.test(name)) fail(400, '姓名不能包含分隔符');
      if (!roles.includes(role)) fail(400, '未知角色：'+role);
      if (typeof row.password !== 'string' || row.password.length < 10 || row.password.length > 128) fail(400, '初始密码长度须为10至128位');
      if (accounts.has(account.toLowerCase())) fail(400, '账号已存在或在导入文件中重复');
      if (names.has(name)) fail(400, '姓名已存在或在导入文件中重复，同名人员请增加姓名后缀');
      accounts.add(account.toLowerCase()); names.add(name);
      users.push({account,name,role,password:row.password});
    } catch (e) { errors.push({row:index+2,message:e.message}); }
  });
  return {users,errors};
}
