import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests',testMatch:['project-combined.spec.ts','account-import.spec.ts','project-entry.spec.ts','projects.spec.ts','project-personnel.spec.ts','project-organization.spec.ts','project-time.spec.ts','project-milestones.spec.ts','project-gantt.spec.ts','project-settings.spec.ts'],timeout:60000,workers:1,
  outputDir:'test-results/projects',
  use:{baseURL:'http://127.0.0.1:5182',viewport:{width:1440,height:1050},channel:process.env.PLAYWRIGHT_CHANNEL || undefined,trace:'retain-on-failure'},
  webServer:{command:'node ../backend/test/project-browser-server.mjs',url:'http://127.0.0.1:5182/api/health',reuseExistingServer:false},
})
