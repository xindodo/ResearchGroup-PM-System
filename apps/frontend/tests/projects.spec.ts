import ExcelJS from 'exceljs'
async function excelText(path:string){const book=new ExcelJS.Workbook();await book.xlsx.readFile(path);return JSON.stringify(book.worksheets[0]!.getSheetValues())}
import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
const password='project-browser-password-123'
async function signIn(page:Page,name='admin'){
  await page.goto('/project-system.html');await page.getByLabel('账号',{exact:true}).fill(name);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('navigation',{name:'主导航'})).toBeVisible()
  if(name==='admin')await page.evaluate(async()=>{
    const session=await fetch('/api/session').then(r=>r.json()),directory=await fetch('/api/organization').then(r=>r.json())
    for(const name of ['武汉理工大学','联合研究单位'])if(!directory.units.some((unit:{name:string})=>unit.name===name)){
      const response=await fetch('/api/organization/units',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({name,category:'校内单位'})})
      if(!response.ok)throw Error(await response.text())
    }
  })
  await page.goto('/project-system.html?view=projects');await expect(page.getByRole('button',{name:'新建项目',exact:true})).toBeVisible()
}
test('only project name is required and workbench has no toolbar',async({page})=>{
  await signIn(page);
  await expect(page.getByText('项目协作',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'新建项目',exact:true}).click();const editor=page.getByRole('dialog');
  await expect(editor.locator('input[required]')).toHaveCount(1);
  await editor.getByLabel('项目名称',{exact:true}).fill('只填名称的新项目');
  await editor.getByRole('button',{name:'添加参与单位',exact:true}).click();
  await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden();
  await expect(page.getByRole('button',{name:'只填名称的新项目',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'只填名称的新项目',exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'工作台',exact:true}).click();
  await expect(page.locator('.pm-toolbar')).toHaveCount(0);
});

test('account menu refreshes and logs out on desktop and mobile without top toolbars',async({page})=>{
  await signIn(page);
  for(const view of ['home','projects','milestones','tasks','timesheets','organization']){
    await page.goto(`/project-system.html?view=${view}`);await expect(page.getByLabel('用户菜单',{exact:true})).toBeVisible();
    await expect(page.locator('.pm-toolbar')).toHaveCount(0);await expect(page.getByRole('button',{name:'退出登录',exact:true})).toBeHidden();
  }
  await page.getByLabel('用户菜单',{exact:true}).click();await page.getByRole('button',{name:'刷新数据',exact:true}).click();await expect(page.getByRole('button',{name:'刷新数据',exact:true})).toBeEnabled();
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'退出登录',exact:true})).toBeHidden();
  await page.getByLabel('用户菜单',{exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();
  await signIn(page);await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'打开导航',exact:true}).click();
  await page.getByLabel('用户菜单',{exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();
});

test('organization catalogs feed project dropdowns and account profile and password reuse original pages',async({page})=>{
  await signIn(page);await page.goto('/project-system.html?view=organization');
  
  await page.getByRole('button',{name:'新增单位',exact:true}).click();await page.getByLabel('单位名称',{exact:true}).fill('测试牵头单位');await page.getByRole('button',{name:'保存单位',exact:true}).click();
  const units=page.getByRole('table',{name:'单位列表',exact:true});await expect(units).toContainText('测试牵头单位');
  await page.getByLabel('搜索单位名称',{exact:true}).fill('查无单位');await expect(units.locator('tbody tr')).toHaveCount(0);await page.getByLabel('搜索单位名称',{exact:true}).fill('');
  await page.getByRole('button',{name:'系统管理',exact:true}).click();await page.getByRole('button',{name:'项目来源',exact:true}).click();await page.getByRole('button',{name:'新增项目来源',exact:true}).click();await page.getByLabel('名称',{exact:true}).fill('测试科研计划');await page.getByRole('button',{name:'保存项目来源',exact:true}).click();
  await page.goto('/project-system.html?view=projects');await page.getByRole('button',{name:'新建项目',exact:true}).click();const editor=page.getByRole('dialog');
  await editor.getByLabel('项目名称',{exact:true}).fill('目录关联项目');await editor.getByLabel('牵头单位',{exact:true}).selectOption('测试牵头单位');await editor.getByLabel('项目来源',{exact:true}).selectOption('测试科研计划');await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden();
  await page.goto('/project-system.html?view=organization');
  const row=units.getByRole('row').filter({hasText:'测试牵头单位'});await row.getByRole('button',{name:'删除',exact:true}).click();await row.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByRole('alert')).toContainText('正在被项目使用');
  await row.getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('单位名称',{exact:true}).fill('改名牵头单位');await page.getByRole('button',{name:'保存单位',exact:true}).click();await expect(units).toContainText('改名牵头单位');
  await page.getByRole('button',{name:'新增单位',exact:true}).click();await page.getByLabel('单位名称',{exact:true}).fill('未使用单位');await page.getByRole('button',{name:'保存单位',exact:true}).click();const unused=units.getByRole('row').filter({hasText:'未使用单位'});await unused.getByRole('button',{name:'删除',exact:true}).click();await unused.getByRole('button',{name:'确认删除',exact:true}).click();await expect(unused).toHaveCount(0);
  await page.goto('/project-system.html?view=projects');await page.getByRole('button',{name:'目录关联项目',exact:true}).click();await expect(page.getByText('改名牵头单位',{exact:true})).toBeVisible();await expect(page.getByText('测试科研计划',{exact:true})).toBeVisible();
  await page.getByLabel('用户菜单',{exact:true}).click();for(const action of ['个人资料','修改密码','刷新数据','退出登录'])await expect(page.getByRole('button',{name:action,exact:true})).toBeVisible();await page.screenshot({path:'test-results/projects/account-menu-desktop.png'});
  await page.getByRole('button',{name:'个人资料',exact:true}).click();await expect(page.getByRole('region',{name:'人员基本信息'})).toBeVisible();await expect(page.getByRole('button',{name:'编辑人员信息',exact:true})).toBeVisible();
  await page.getByLabel('用户菜单',{exact:true}).click();await page.getByRole('button',{name:'修改密码',exact:true}).click();const passwordDialog=page.getByRole('dialog',{name:'修改密码',exact:true});await expect(passwordDialog.getByLabel('当前密码',{exact:true})).toBeVisible();await passwordDialog.getByRole('button',{name:'取消',exact:true}).click();
  await page.evaluate(async(password)=>{const s=await fetch('/api/session').then(r=>r.json());const r=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({account:'account-profile-test',name:'账号操作教师',role:'导师',password})});if(!r.ok)throw Error(await r.text())},password);
  await page.getByLabel('用户菜单',{exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await signIn(page,'account-profile-test');
  await page.getByLabel('用户菜单',{exact:true}).click();await page.getByRole('button',{name:'个人资料',exact:true}).click();await page.getByRole('button',{name:'编辑人员信息',exact:true}).click();await page.getByRole('dialog').getByLabel('研究方向',{exact:true}).fill('交通规划');await page.getByRole('button',{name:'保存人员信息',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();await expect(page.getByRole('region',{name:'人员基本信息'})).toContainText('交通规划');
  await page.getByLabel('用户菜单',{exact:true}).click();await page.getByRole('button',{name:'修改密码',exact:true}).click();await passwordDialog.getByLabel('当前密码',{exact:true}).fill(password);await passwordDialog.getByLabel('新密码',{exact:true}).fill('changed-account-password');await passwordDialog.getByLabel('确认新密码',{exact:true}).fill('changed-account-password');await passwordDialog.getByRole('button',{name:'保存密码',exact:true}).click();await expect(passwordDialog).toBeHidden();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByLabel('用户菜单',{exact:true}).click();await expect(page.getByRole('button',{name:'个人资料',exact:true})).toBeVisible();await page.screenshot({path:'test-results/projects/account-menu-mobile.png'});await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.getByLabel('账号',{exact:true}).fill('account-profile-test');await page.getByLabel('密码',{exact:true}).fill('changed-account-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('navigation',{name:'主导航'})).toBeAttached();
  await page.goto('/project-system.html?view=organization');await expect(page.getByRole('button',{name:'新增单位',exact:true})).toHaveCount(0);
});

test('participant unit directory supports CRUD and dropdowns in project creation and editing',async({page})=>{
  await signIn(page);await page.goto('/project-system.html?view=organization');
  await page.getByRole('button',{name:'新增单位',exact:true}).click();await page.getByLabel('单位名称',{exact:true}).fill('参与目录测试单位');await page.getByRole('button',{name:'保存单位',exact:true}).click();const table=page.getByRole('table',{name:'单位列表',exact:true});await expect(table).toContainText('参与目录测试单位');
  await page.getByLabel('搜索单位名称',{exact:true}).fill('不匹配');await expect(table.locator('tbody tr')).toHaveCount(0);await page.getByLabel('搜索单位名称',{exact:true}).fill('');
  await page.goto('/project-system.html?view=projects');await page.getByRole('button',{name:'新建项目',exact:true}).click();const editor=page.getByRole('dialog');await editor.getByLabel('项目名称',{exact:true}).fill('参与单位下拉测试');await editor.getByRole('button',{name:'添加参与单位',exact:true}).click();await editor.getByLabel('单位名称',{exact:true}).selectOption('参与目录测试单位');await expect(editor.getByLabel('联系人',{exact:true})).toContainText('该单位暂无人员');await editor.getByLabel('单位职责',{exact:true}).fill('专项研究');await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden();
  await page.getByRole('button',{name:'参与单位下拉测试',exact:true}).click();await page.getByRole('button',{name:'编辑项目',exact:true}).click();await expect(editor.getByLabel('单位名称',{exact:true})).toHaveValue('参与目录测试单位');await expect(editor.getByLabel('联系人',{exact:true})).toHaveValue('');await editor.getByLabel('单位名称',{exact:true}).selectOption('联合研究单位');await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden();
  await page.goto('/project-system.html?view=organization');
  const unused=table.getByRole('row').filter({hasText:'参与目录测试单位'});await unused.getByRole('button',{name:'删除',exact:true}).click();await unused.getByRole('button',{name:'确认删除',exact:true}).click();await expect(unused).toHaveCount(0);
  const used=table.getByRole('row').filter({hasText:'联合研究单位'});await used.getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('单位名称',{exact:true}).fill('联合研究机构');await page.getByRole('button',{name:'保存单位',exact:true}).click();const renamed=table.getByRole('row').filter({hasText:'联合研究机构'});await renamed.getByRole('button',{name:'删除',exact:true}).click();await renamed.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByRole('alert')).toContainText('正在被项目使用');
  await page.goto('/project-system.html?view=projects');await page.getByRole('button',{name:'参与单位下拉测试',exact:true}).click();await page.getByRole('button',{name:'编辑项目',exact:true}).click();await expect(editor.getByLabel('单位名称',{exact:true})).toHaveValue('联合研究机构');await expect(editor.getByLabel('单位职责',{exact:true})).toHaveValue('专项研究');await editor.getByRole('button',{name:'关闭编辑',exact:true}).click();
});

test('system management reuses accounts, member types, trash and logs with administrator-only access',async({page,browser})=>{
  await signIn(page);await page.getByRole('button',{name:'系统管理',exact:true}).click();await expect(page.getByRole('heading',{name:'系统管理',exact:true})).toBeVisible();
  for(const title of ['用户账号','成员类型','回收站','操作日志'])await expect(page.getByRole('button',{name:title,exact:true})).toBeVisible();
  await page.getByLabel('账号',{exact:true}).fill('settings-test-user');await page.getByLabel('姓名',{exact:true}).fill('系统管理教师');await page.getByLabel('初始密码',{exact:true}).fill(password);await page.getByRole('button',{name:'保存账号',exact:true}).click();
  const accountRow=page.getByRole('row').filter({hasText:'settings-test-user'});await expect(accountRow).toContainText('系统管理教师');await accountRow.getByRole('button',{name:'编辑账号',exact:true}).click();await page.getByLabel('姓名',{exact:true}).fill('系统管理改名教师');await page.getByRole('button',{name:'保存账号',exact:true}).click();await expect(accountRow).toContainText('系统管理改名教师');
  await page.getByRole('button',{name:'成员类型',exact:true}).click();await page.getByLabel('新增名称',{exact:true}).fill('系统管理测试分类');await page.getByRole('button',{name:'添加选项',exact:true}).click();await expect(page.getByText('系统管理测试分类',{exact:true})).toBeVisible();
  await page.evaluate(async()=>{const s=await fetch('/api/session').then(r=>r.json()),data=await fetch('/api/bootstrap').then(r=>r.json()),headers={'Content-Type':'application/json','X-CSRF-Token':s.csrf};const r=await fetch('/api/records',{method:'POST',headers,body:JSON.stringify({kind:'news',title:'系统管理回收测试',category:data.dictionaries.news[0].name,summary:'恢复验证',attachments:[],images:[]})});if(!r.ok)throw Error(await r.text());const record=await r.json();const deleted=await fetch('/api/records/'+record.id,{method:'DELETE',headers,body:JSON.stringify({revision:record.revision})});if(!deleted.ok)throw Error(await deleted.text())});
  await page.reload();await page.getByRole('button',{name:'回收站',exact:true}).click();const deletedRow=page.locator('.dictionary-row').filter({hasText:'系统管理回收测试'});await expect(deletedRow).toBeVisible();await deletedRow.getByRole('button',{name:'恢复记录',exact:true}).click();await expect(deletedRow).toHaveCount(0);
  await page.getByRole('button',{name:'操作日志',exact:true}).click();await expect(page.getByRole('heading',{name:'操作日志',exact:true})).toBeVisible();await expect(page.getByRole('table')).toContainText('恢复记录');await page.reload();await expect(page.getByRole('heading',{name:'操作日志',exact:true})).toBeVisible();await page.getByRole('button',{name:'返回系统管理',exact:true}).click();await expect(page.getByRole('heading',{name:'系统管理',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('button',{name:'系统管理',exact:true}).click();await expect(page.getByRole('heading',{name:'系统管理',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/projects/system-settings-mobile.png',fullPage:true});
  const context=await browser.newContext({baseURL:'http://127.0.0.1:5182'}),other=await context.newPage();await signIn(other,'settings-test-user');await expect(other.getByRole('button',{name:'系统管理',exact:true})).toHaveCount(0);await other.goto('/project-system.html?view=settings&settings=logs');await expect(other.getByRole('heading',{name:'系统管理',exact:true})).toHaveCount(0);await expect(other.getByRole('heading',{name:'操作日志',exact:true})).toHaveCount(0);expect(await other.evaluate(async()=>({users:(await fetch('/api/users')).status,audit:(await fetch('/api/audit')).status,trash:(await fetch('/api/trash')).status}))).toEqual({users:403,audit:403,trash:403});await context.close();
});

test('project participants can be selected together and overview lists every person and unit',async({page})=>{
  await signIn(page);await page.evaluate(async(password)=>{const s=await fetch('/api/session').then(r=>r.json()),headers={'Content-Type':'application/json','X-CSRF-Token':s.csrf};for(const [account,name] of [['participants-a','参与教师甲'],['participants-b','参与教师乙']]){const r=await fetch('/api/users',{method:'POST',headers,body:JSON.stringify({account,name,role:'导师',password})});if(!r.ok)throw Error(await r.text())}const r=await fetch('/api/pm/options',{method:'POST',headers,body:JSON.stringify({scope:'participantUnits',name:'第二参与单位'})});if(!r.ok)throw Error(await r.text())},password);
  await page.reload();await page.getByRole('button',{name:'新建项目',exact:true}).click();const editor=page.getByRole('dialog');await editor.getByLabel('项目名称',{exact:true}).fill('参与人员多选测试');
  await editor.getByRole('button',{name:'选择参与人员',exact:true}).click();await editor.getByLabel('搜索参与人员',{exact:true}).fill('参与教师');await editor.getByLabel('参与教师甲',{exact:true}).check();await editor.getByLabel('参与教师乙',{exact:true}).check();await editor.getByRole('button',{name:'完成选择（3人）',exact:true}).click();await editor.getByLabel('参与教师甲的项目角色',{exact:true}).selectOption('项目协调人');
  await editor.getByRole('button',{name:'添加参与单位',exact:true}).click();await editor.getByLabel('单位名称',{exact:true}).selectOption('联合研究机构');await editor.getByRole('button',{name:'添加参与单位',exact:true}).click();await editor.getByLabel('单位名称',{exact:true}).nth(1).selectOption('第二参与单位');await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden();
  await page.getByRole('button',{name:'参与人员多选测试',exact:true}).click();const facts=page.locator('.overview-facts');const people=facts.locator('div').filter({has:page.locator('dt').filter({hasText:/^参与人员$/})});const units=facts.locator('div').filter({has:page.locator('dt').filter({hasText:/^参与单位$/})});for(const name of ['系统管理员','参与教师甲','参与教师乙'])await expect(people).toContainText(name);for(const name of ['联合研究机构','第二参与单位'])await expect(units).toContainText(name);
  const labels=await facts.locator('dt').allTextContents();expect(labels).toContain('项目负责人');expect(labels).toContain('学生负责人');expect(labels).toContain('参与人员');expect(labels).toContain('参与单位');
  await page.reload();await page.getByRole('button',{name:'编辑项目',exact:true}).click();await expect(editor.getByLabel('参与教师甲的项目角色',{exact:true})).toHaveValue('项目协调人');await editor.getByRole('button',{name:'选择参与人员',exact:true}).click();await editor.getByLabel('参与教师乙',{exact:true}).uncheck();await editor.getByRole('button',{name:'完成选择（2人）',exact:true}).click();await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden();await expect(people).not.toContainText('参与教师乙');await expect(people).toContainText('参与教师甲');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'编辑项目',exact:true}).click();await editor.getByRole('button',{name:'选择参与人员',exact:true}).click();await editor.getByLabel('搜索参与人员',{exact:true}).fill('参与教师');await page.keyboard.press('Escape');await expect(editor).toBeVisible();await expect(editor.getByLabel('搜索参与人员',{exact:true})).toHaveCount(0);await editor.getByRole('button',{name:'选择参与人员',exact:true}).click();await editor.getByLabel('参与教师乙',{exact:true}).check();await editor.getByRole('button',{name:'完成选择（3人）',exact:true}).click();await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden();await expect(people).toContainText('参与教师乙');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('project creation, units, task hierarchy, workbench and member progress persist',async({page,browser})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await signIn(page)
  await page.evaluate(async(password)=>{const s=await fetch('/api/session').then(r=>r.json());for(const name of ['协作教师','其他教师']){const r=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({account:name==='协作教师'?'pm-member':'pm-other',name,role:'导师',password})});if(!r.ok)throw Error(await r.text())}},password)
  await page.reload()
  await page.getByRole('button',{name:'新建项目',exact:true}).click()
  const editor=page.getByRole('dialog')
  await editor.getByLabel('项目名称',{exact:true}).fill('协作开发测试项目');await editor.getByLabel('项目编号',{exact:true}).fill('E2E-001');await editor.getByLabel('牵头单位',{exact:true}).selectOption('武汉理工大学')
  await editor.getByLabel('开始日期',{exact:true}).fill('2026-10-01');await editor.getByLabel('截止日期',{exact:true}).fill('2026-12-31')
  await editor.getByRole('button',{name:'选择参与人员',exact:true}).click();await editor.getByLabel('协作教师',{exact:true}).check();await editor.getByRole('button',{name:'完成选择（2人）',exact:true}).click();await editor.getByRole('combobox',{name:'项目状态',exact:true}).selectOption('进行中')
  await editor.getByRole('button',{name:'添加参与单位',exact:true}).click();await editor.getByLabel('单位名称',{exact:true}).selectOption('联合研究机构');await editor.getByLabel('单位职责',{exact:true}).fill('数据归集')
  await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden()
  await page.getByRole('navigation').getByRole('button',{name:'项目',exact:true}).click();await page.getByRole('button',{name:'协作开发测试项目',exact:true}).click()
  await page.getByRole('button',{name:'编辑项目',exact:true}).click()
  await page.evaluate(async()=>{const s=await fetch('/api/session').then(r=>r.json()),id=new URL(location.href).searchParams.get('project');const p=await fetch(`/api/pm/projects/${id}`).then(r=>r.json());const r=await fetch(`/api/pm/projects/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({...p,phase:'服务端变更'})});if(!r.ok)throw Error(await r.text())})
  await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('项目已被他人修改');await editor.getByRole('button',{name:'关闭编辑',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:'编辑项目',exact:true})).toBeVisible();await page.getByRole('tab',{name:'里程碑与任务',exact:true}).click()
  await page.getByRole('button',{name:'添加任务',exact:true}).click();await editor.getByLabel('任务名称',{exact:true}).fill('现场监测任务');await editor.getByRole('combobox',{name:'负责人',exact:true}).selectOption({label:'协作教师'});await editor.getByLabel('任务截止日期',{exact:true}).fill('2026-10-20');await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden()
  await page.getByRole('tab',{name:'里程碑与任务',exact:true}).click();await expect(page.locator('.combined-list')).toContainText('现场监测任务')
  await page.getByRole('button',{name:'添加任务',exact:true}).click();await editor.getByLabel('任务名称',{exact:true}).fill('整理监测报告');await editor.getByRole('combobox',{name:'父任务',exact:true}).selectOption({label:'现场监测任务'});await editor.getByRole('combobox',{name:'前置任务',exact:true}).selectOption({label:'现场监测任务'});await editor.getByRole('button',{name:'保存',exact:true}).click();await expect(editor).toBeHidden()
  await expect(page.locator('.combined-list')).toContainText('整理监测报告')
  const projectUrl=page.url()
  await page.reload();await expect(page.locator('.combined-list')).toContainText('现场监测任务')
  await page.getByRole('tab',{name:'概览',exact:true}).click();await expect(page.locator('.overview-facts')).toContainText('联合研究机构');await expect(page.locator('.overview-facts')).toContainText('协作教师');for(const label of ['参与单位与人员','文件','讨论区'])await expect(page.getByRole('tab',{name:label,exact:true})).toHaveCount(0)
  await page.getByRole('navigation').getByRole('button',{name:'工作台',exact:true}).click();await expect(page.locator('.wb-managed')).toContainText('现场监测任务');await expect(page.locator('.wb-managed')).toContainText('整理监测报告')
  const memberContext=await browser.newContext({baseURL:'http://127.0.0.1:5182'});const member=await memberContext.newPage();await signIn(member,'pm-member');await member.goto(projectUrl)
  await expect(member.getByRole('button',{name:'编辑项目',exact:true})).toHaveCount(0)
  await member.locator('.tree-task').filter({has:member.getByText('现场监测任务',{exact:true})}).getByRole('button',{name:'更新进度',exact:true}).click()
  const memberEditor=member.getByRole('dialog');await expect(memberEditor.getByRole('combobox',{name:'负责人',exact:true})).toHaveCount(0);await memberEditor.getByRole('combobox',{name:'任务状态',exact:true}).selectOption('已完成');await expect(memberEditor.getByLabel('任务进度（%）',{exact:true})).toHaveValue('100');await memberEditor.getByRole('button',{name:'保存',exact:true}).click();await expect(memberEditor).toBeHidden();await expect(member.locator('.tree-task').filter({has:member.getByText('现场监测任务',{exact:true})})).toContainText('已完成')
  await member.reload();await expect(member.locator('.tree-task').filter({has:member.getByText('现场监测任务',{exact:true})})).toContainText('100%')
  await memberContext.close();await page.reload();await expect(page.locator('.wb-managed')).toContainText('已完成')
  await page.screenshot({path:'test-results/projects/workbench-desktop.png',fullPage:true})
  await page.goto('/project-system.html?view=organization');await expect(page.getByRole('table',{name:'单位列表'})).toContainText('联合研究机构')
  await page.goto('/project-system.html?project=missing');await expect(page.getByText('项目不存在或无权查看。',{exact:true})).toBeVisible()
  const otherContext=await browser.newContext({baseURL:'http://127.0.0.1:5182'});const other=await otherContext.newPage();await signIn(other,'pm-other');await other.goto(projectUrl);await expect(other.getByText('项目不存在或无权查看。',{exact:true})).toBeVisible();await otherContext.close()
  await page.goto('/');await expect(page).toHaveTitle('项目管理系统');await expect(page.getByRole('navigation',{name:'主导航'})).toBeVisible()
  expect(errors).toEqual([])
})
test('project list groups by lead unit with filtered counts and pagination',async({page})=>{
 await signIn(page)
 await page.evaluate(async()=>{const session=await fetch('/api/session').then(r=>r.json());for(let i=0;i<12;i++){const response=await fetch('/api/pm/projects',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({title:`单位分组项目${i}`,unit:i<10?'甲牵头单位':i===10?'乙牵头单位':''})});if(!response.ok)throw Error(await response.text())}})
 await page.reload();await page.getByLabel('搜索项目',{exact:true}).fill('单位分组项目');await page.getByLabel('每页显示条数').selectOption('10');const groups=page.locator('.project-unit-heading');await expect(groups).toHaveCount(1);await expect(groups).toContainText('甲牵头单位');await expect(groups).toContainText('10 个项目');await expect(page.locator('.project-data-row')).toHaveCount(10)
 await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(groups).toHaveCount(2);await expect(groups.nth(0)).toContainText('乙牵头单位');await expect(groups.nth(1)).toContainText('未设置牵头单位');await expect(page.locator('.project-data-row')).toHaveCount(2)
 await page.getByLabel('搜索项目',{exact:true}).fill('单位分组项目0');await expect(groups).toHaveCount(1);await expect(groups).toContainText('1 个项目');await expect(page.locator('.project-data-row')).toHaveCount(1);await page.getByRole('button',{name:'单位分组项目0',exact:true}).click();await expect(page.getByRole('heading',{name:'单位分组项目0',exact:true})).toBeVisible()
})
test('Excel export uses the filtered real projects and escapes spreadsheet formulas',async({page})=>{
  await signIn(page)
  await page.evaluate(async()=>{const s=await fetch('/api/session').then(r=>r.json());const r=await fetch('/api/pm/projects',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({title:'=1+1',code:'EXPORT-001',ownerId:s.user.id,type:'科研课题',unit:'导出单位',sponsor:'=2+2',start:'2026-10-01',end:'2026-12-31',progress:0,status:'正常推进',lifecycle:'未开始',members:[],units:[]})});if(!r.ok)throw Error(await r.text())})
  await page.goto('/project-system.html?view=projects');await page.getByLabel('搜索项目',{exact:true}).fill('EXPORT-001')
  await expect(page.locator('.project-list-table .project-data-row')).toHaveCount(1)
  const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'导出',exact:true}).click();const download=await waiting
  expect(download.suggestedFilename()).toBe('项目台账-筛选结果.xlsx')
  const exportBook=new ExcelJS.Workbook();await exportBook.xlsx.readFile((await download.path())!);expect(exportBook.worksheets[0]!.getCell(2,2).type).toBe(ExcelJS.ValueType.String);const csv=await excelText((await download.path())!);expect(csv).toContain('=1+1');expect(csv).not.toContain('E2E-001')
})
test('mobile project navigation, form and date-based gantt',async({page})=>{
  await page.setViewportSize({width:390,height:844});await signIn(page)
  await page.evaluate(async()=>{
    const s=await fetch('/api/session').then(r=>r.json()),headers={'Content-Type':'application/json','X-CSRF-Token':s.csrf}
    const response=await fetch('/api/pm/projects',{method:'POST',headers,body:JSON.stringify({title:'移动端测试项目',code:'MOBILE-001',ownerId:s.user.id,type:'工程建设',unit:'牵头单位',start:'2026-10-01',end:'2026-12-31',progress:0,status:'正常推进',lifecycle:'进行中',members:[],units:[]})});if(!response.ok)throw Error(await response.text());const p=await response.json()
    for(const [title,due] of [['现场监测任务','2026-10-20'],['整理监测报告','2026-12-31']]){const r=await fetch(`/api/pm/projects/${p.id}/tasks`,{method:'POST',headers,body:JSON.stringify({title,due,start:'2026-10-01',assigneeId:s.user.id,state:'待开始',progress:0})});if(!r.ok)throw Error(await r.text())}
  });await page.reload();await expect(page.getByRole('button',{name:'新建项目',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'项目',exact:true}).click();await page.getByRole('button',{name:'移动端测试项目',exact:true}).click()
  await page.getByRole('button',{name:'编辑项目',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByLabel('当前阶段',{exact:true}).fill('现场试验');await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('tab',{name:'甘特图',exact:true}).click();await expect(page.locator('.gantt-bar')).toHaveCount(2);await expect(page.locator('.gantt-bar').first()).toHaveAttribute('style',/left: 0%; width: 21/)
  await page.screenshot({path:'test-results/projects/detail-mobile.png',fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
