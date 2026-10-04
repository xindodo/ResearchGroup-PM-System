import { test, expect, type Page } from '@playwright/test'
const password='project-browser-password-123'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPqUAAAAASUVORK5CYII=','base64')
async function signIn(page:Page,account='admin'){
  await page.goto('/project-system.html?view=organization&unit=unassigned');await page.getByLabel('账号',{exact:true}).fill(account);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('heading',{name:'人员信息',exact:true})).toBeVisible()
}
async function fixture(page:Page,prefix:string){
  return page.evaluate(async({prefix,password})=>{
    const session=await fetch('/api/session').then(r=>r.json()),headers={'Content-Type':'application/json','X-CSRF-Token':session.csrf}
    async function request(path:string,method:string,data:unknown){const r=await fetch('/api'+path,{method,headers,body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json()}
    const a=await request('/users','POST',{account:prefix+'-a',name:prefix+'科研教师甲',role:'导师',password}),b=await request('/users','POST',{account:prefix+'-b',name:prefix+'科研教师乙',role:'导师',password})
    const guest=await request('/users','POST',{account:prefix+'-guest',name:prefix+'只读访客',role:'只读访客',password})
    await request(`/users/${a.id}/profile`,'PUT',{revision:a.revision,type:'专业教师',direction:'智慧交通',position:'科研负责人',title:'副教授',employmentDate:'2020-09-01',phone:'13800000000',email:'research@example.com',employeeId:'WHUT-001',orcid:'0000-0000-0000-000X',homepage:'https://example.com/research',office:'交通楼301',summary:'**科研简介**',attachments:[],images:[]})
    await request(`/users/${b.id}/profile`,'PUT',{revision:b.revision,type:'其他',direction:'交通安全',attachments:[],images:[]})
    let project=await request('/pm/projects','POST',{title:prefix+'参与项目',ownerId:a.id,members:[{userId:a.id,role:'项目成员'},{userId:b.id,role:'项目成员'}]})
    project=await request(`/pm/projects/${project.id}/tasks`,'POST',{title:prefix+'负责任务',assigneeId:a.id,start:'2026-10-01',due:'2026-10-10',state:'进行中',progress:25})
    const task=project.tasks[0]
    project=await request(`/pm/projects/${project.id}/tasks`,'POST',{title:prefix+'参与任务',assigneeId:b.id,participantIds:[a.id],start:'2026-10-01',due:'2026-10-12',state:'待开始',progress:0})
    await request(`/pm/projects/${project.id}/time-entries`,'POST',{taskId:task.id,userId:a.id,start:'2026-10-02T09:00',end:'2026-10-02T10:30',note:'本人工作'})
    await request(`/pm/projects/${project.id}/time-entries`,'POST',{taskId:task.id,userId:b.id,start:'2026-10-02T09:00',end:'2026-10-02T11:00',note:'其他人员工作'})
    const directory=await request('/organization/people','POST',{name:prefix+'独立人员'})
    const independent=directory.people.find((p:{name:string})=>p.name===prefix+'独立人员')
    return {a,b,guest,project,task,independent}

  },{prefix,password})
}
test('personnel module retains all fields, associations, profile editing, files, images and project-app persistence',async({page,browser})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('Failed to resolve component'))errors.push(m.text())})
  await signIn(page);const data=await fixture(page,'desktop');await page.reload();await expect(page.getByRole('heading',{name:'人员信息',exact:true})).toBeVisible()
  const table=page.getByRole('table',{name:'人员列表',exact:true});await expect(table).toContainText(data.a.name);await expect(table).not.toContainText('系统管理员');await expect(table).not.toContainText(data.guest.name)
  await page.getByLabel('研究方向筛选').selectOption('智慧交通');await expect(table.locator('tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'清空',exact:true}).click()
  await page.getByLabel('成员类型筛选').selectOption('其他');await expect(table).toContainText(data.b.name);await expect(table).not.toContainText(data.a.name);await page.getByRole('button',{name:'清空',exact:true}).click()
  await page.getByLabel('搜索人员姓名').fill(data.a.name);await table.getByRole('button',{name:data.a.name,exact:true}).click()
  await expect(page).toHaveURL(new RegExp('person='+data.a.id));await expect(page.getByRole('tablist',{name:'人员关联内容'}).getByRole('tab')).toHaveCount(4)
  const basic=page.getByRole('region',{name:'人员基本信息'});for(const label of ['姓名','成员类型','职务','职称','入职时间','手机号','工作邮箱','工号/学号','ORCID号','研究方向','办公地点','个人学术主页'])await expect(basic.locator('dt')).toContainText([label])
  await expect(basic).toContainText('0000-0000-0000-000X');await expect(page.locator('.summary-text strong')).toHaveText('科研简介')
  await expect(page.getByRole('tablist',{name:'人员关联内容'}).getByRole('tab')).toHaveText(['基本信息','项目参与','任务参与','工时'])
  await page.getByRole('tab',{name:'项目参与',exact:true}).click();await expect(page.getByRole('table',{name:'项目参与列表'})).toContainText(data.project.title)
  await page.getByRole('tab',{name:'任务参与',exact:true}).click();const tasks=page.getByRole('table',{name:'任务参与列表'});await expect(tasks.locator('tbody tr')).toHaveCount(2);await expect(tasks).toContainText(data.task.title);await expect(tasks).toContainText('参与人员')
  await page.getByRole('tab',{name:'工时',exact:true}).click();await page.getByLabel('统计周',{exact:true}).fill('2026-10-02');await page.getByLabel('统计月',{exact:true}).fill('2026-10');await expect(page.locator('.hour-totals strong')).toHaveText(['01:30','01:30','01:30']);await expect(page.getByRole('table',{name:'人员工时列表'})).toContainText('本人工作');await expect(page.getByRole('table',{name:'人员工时列表'})).not.toContainText('其他人员工作')
  await page.goto('/project-system.html?view=organization&person='+data.independent.id);await expect(page.getByRole('heading',{name:data.independent.name,exact:true})).toBeVisible();await page.getByRole('tab',{name:'项目参与',exact:true}).click();await expect(page.getByRole('tabpanel')).toContainText('暂无项目参与记录');await page.getByRole('tab',{name:'任务参与',exact:true}).click();await expect(page.getByRole('tabpanel')).toContainText('暂无任务参与记录');await page.getByRole('tab',{name:'工时',exact:true}).click();await expect(page.locator('.hour-totals strong')).toHaveText(['00:00','00:00','00:00'])
  await page.goto('/project-system.html?view=organization&person='+data.a.id);await expect(basic).toBeVisible()
  const chosen=page.waitForEvent('filechooser');await page.getByRole('button',{name:'上传附件',exact:true}).click();await (await chosen).setFiles({name:'科研履历.txt',mimeType:'text/plain',buffer:Buffer.from('research biography')});await expect(page.getByText('附件已上传并保存',{exact:true})).toBeVisible();await expect(page.locator('.side-file')).toContainText('科研履历.txt')
  await page.getByRole('button',{name:'编辑人员信息',exact:true}).click();const editor=page.getByRole('dialog',{name:'编辑人员信息',exact:true})
  await editor.getByLabel('职称',{exact:true}).fill('教授');await editor.getByLabel('ORCID号',{exact:true}).fill('invalid');await editor.getByRole('button',{name:'保存人员信息',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('ORCID')
  await editor.getByLabel('ORCID号',{exact:true}).fill('0000-0000-0000-000x');await editor.getByLabel('研究方向',{exact:true}).fill('智能交通与科研管理');await editor.getByLabel('办公地点',{exact:true}).fill('交通楼501')
  await editor.getByLabel('上传人员附件').setInputFiles({name:'科研材料.txt',mimeType:'text/plain',buffer:Buffer.from('research materials')});await expect(editor.getByRole('button',{name:'保存人员信息',exact:true})).toBeEnabled();await editor.getByRole('button',{name:'保存人员信息',exact:true}).click();await expect(editor).toBeHidden();await expect(basic).toContainText('教授');await expect(page.locator('.side-file')).toHaveCount(2)
  await page.getByLabel('上传相关图片').setInputFiles({name:'科研照片.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('button',{name:'放大科研照片.png',exact:true})).toBeVisible();await page.getByRole('button',{name:'放大科研照片.png',exact:true}).click();await expect(page.getByRole('dialog',{name:'图片预览',exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭图片预览',exact:true}).click()
  const download=page.waitForEvent('download');await page.locator('.side-file').filter({hasText:'科研履历.txt'}).getByRole('button',{name:'下载',exact:true}).click();expect((await download).suggestedFilename()).toBe('科研履历.txt')
  await page.reload();await expect(basic).toContainText('智能交通与科研管理');await expect(page.locator('.side-file')).toHaveCount(2);await expect(page.getByRole('button',{name:'放大科研照片.png',exact:true})).toBeVisible()
  await page.screenshot({path:'test-results/projects/personnel-desktop.png',fullPage:true})
  await page.goto('/project-system.html?view=organization&person='+data.a.id);await expect(page.getByRole('region',{name:'人员基本信息'})).toContainText('教授');await expect(page.locator('.side-file')).toHaveCount(2)
  const context=await browser.newContext({baseURL:'http://127.0.0.1:5182'});const teacher=await context.newPage();await signIn(teacher,data.a.account);await teacher.getByRole('table',{name:'人员列表',exact:true}).getByRole('button',{name:data.a.name,exact:true}).click();await expect(teacher.getByRole('button',{name:'编辑人员信息',exact:true})).toBeVisible();await teacher.getByRole('button',{name:'编辑人员信息',exact:true}).click();await teacher.getByRole('dialog').getByLabel('办公地点',{exact:true}).fill('本人更新办公室');await teacher.getByRole('dialog').getByRole('button',{name:'保存人员信息',exact:true}).click();await expect(teacher.getByRole('dialog',{name:'编辑人员信息',exact:true})).toBeHidden();await expect(teacher.getByRole('region',{name:'人员基本信息'})).toContainText('本人更新办公室')
  await teacher.getByRole('button',{name:'返回人员信息',exact:true}).click();await teacher.getByRole('table',{name:'人员列表',exact:true}).getByRole('button',{name:data.b.name,exact:true}).click();await expect(teacher.getByRole('button',{name:'编辑人员信息',exact:true})).toHaveCount(0);await expect(teacher.getByRole('button',{name:'上传附件',exact:true})).toHaveCount(0)
  const status=await teacher.evaluate(async id=>{const s=await fetch('/api/session').then(r=>r.json());const d=await fetch('/api/bootstrap').then(r=>r.json());const p=d.personnel.find((u:{id:string})=>u.id===id);const r=await fetch(`/api/users/${id}/profile`,{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({...p,title:'越权修改'})});return r.status},data.b.id);expect(status).toBe(403);await context.close()
  const guestContext=await browser.newContext({baseURL:'http://127.0.0.1:5182'});const guest=await guestContext.newPage();await signIn(guest,data.guest.account);await guest.getByRole('table',{name:'人员列表',exact:true}).getByRole('button',{name:data.a.name,exact:true}).click();await expect(guest.getByRole('button',{name:'编辑人员信息',exact:true})).toHaveCount(0);await expect(guest.getByLabel('上传相关图片')).toHaveCount(0);await guestContext.close()
  expect(errors).toEqual([])
})
test('mobile personnel details preserve identity after rename and handle history, missing people and stale edits',async({page})=>{
  await page.setViewportSize({width:390,height:844});await signIn(page);const data=await fixture(page,'mobile');await page.reload();await expect(page.getByRole('heading',{name:'人员信息',exact:true})).toBeVisible();await page.getByRole('table',{name:'人员列表',exact:true}).getByRole('button',{name:data.a.name,exact:true}).click();const url=page.url()
  await page.getByRole('button',{name:'编辑人员信息',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(async id=>{const s=await fetch('/api/session').then(r=>r.json());const d=await fetch('/api/bootstrap').then(r=>r.json());const p=d.personnel.find((u:{id:string})=>u.id===id);const r=await fetch(`/api/users/${id}/profile`,{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({...p,office:'其他窗口更新'})});if(!r.ok)throw Error(await r.text())},data.a.id)
  await page.getByRole('dialog').getByRole('button',{name:'保存人员信息',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('人员资料已变化');await page.getByRole('button',{name:'关闭人员编辑',exact:true}).click();await page.reload();await expect(page.getByRole('region',{name:'人员基本信息'})).toContainText('其他窗口更新')
  await page.evaluate(async id=>{const s=await fetch('/api/session').then(r=>r.json()),headers={'Content-Type':'application/json','X-CSRF-Token':s.csrf};const users=await fetch('/api/users').then(r=>r.json());const u=users.find((u:{id:string})=>u.id===id);const r=await fetch(`/api/users/${id}`,{method:'PUT',headers,body:JSON.stringify({...u,name:'改名后的科研教师'})});if(!r.ok)throw Error(await r.text())},data.a.id)
  await page.reload();await expect(page.getByRole('heading',{name:'改名后的科研教师',exact:true})).toBeVisible();await expect(page).toHaveURL(url);await page.getByRole('tab',{name:'项目参与',exact:true}).click();await expect(page.getByRole('tabpanel')).toContainText(data.project.title);await page.getByRole('tab',{name:'基本信息',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/projects/personnel-mobile.png',fullPage:true})
  await page.getByRole('button',{name:'返回人员信息',exact:true}).click();await expect(page.getByRole('table',{name:'人员列表',exact:true})).toBeVisible();await page.goBack();await expect(page.getByRole('heading',{name:'改名后的科研教师',exact:true})).toBeVisible()
  await page.goto('/project-system.html?view=organization&person=missing');await expect(page.getByRole('heading',{name:'未找到该成员',exact:true})).toBeVisible()
})
