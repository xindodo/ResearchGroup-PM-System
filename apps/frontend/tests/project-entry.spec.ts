import {test,expect} from '@playwright/test'
test('default entry is the project system and retired standalone APIs are unavailable',async({page})=>{
 await page.goto('/');await expect(page).toHaveTitle('项目管理系统');await expect(page.getByRole('heading',{name:'项目管理系统',exact:true})).toBeVisible();
 await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('project-browser-password-123');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('navigation',{name:'主导航'})).toBeVisible();
 await expect(page.getByRole('button',{name:'工作日常',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'通知公告',exact:true})).toHaveCount(0);
 const status=await page.evaluate(async()=>{const s=await fetch('/api/session').then(r=>r.json());return Promise.all(['/announcements','/related-links','/tasks'].map(async path=>{const r=await fetch('/api'+path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:'{}'});return r.status}))});expect(status).toEqual([404,404,404]);
 await page.goto('/project-preview.html');await expect(page).toHaveTitle('项目管理系统');await expect(page.getByRole('navigation',{name:'主导航'})).toBeVisible();
})
