# 项目管理系统仓库结构

- `apps/frontend/src/ProjectSystem.vue`：登录、项目数据加载、表单及页面集成。
- `apps/frontend/src/ProjectPreview.vue`：当前项目系统的页面框架、侧栏和导航；名称沿用开发阶段命名，已无独立静态预览入口。
- `apps/frontend/src/ProjectLiveDetail.vue`：项目概览和任务。
- `apps/frontend/src/ProjectEditors.vue`：项目和任务新增/编辑。
- `ProjectTimesheets.vue`、`ProjectTimeSummary.vue`、`ProjectMilestones.vue`、`ProjectGantt.vue`：工时、统计、里程碑和甘特图。
- `ProjectPersonnel.vue`、`components/PersonDetail.vue`、`PersonnelRecordDetail.vue`：组织人员、个人资料及关联记录。
- `ProjectOrganizationOptions.vue`：单位、来源及项目类型目录。
- `components/SystemAdmin.vue`：系统管理。
- `apps/backend/src/server.mjs`：认证、用户、人员资料、关联记录、附件、目录及审计接口。
- `apps/backend/src/projects.mjs`、`project-time.mjs`、`project-milestones.mjs`：项目领域接口。
- `apps/backend/src/database.mjs`：SQLite 初始化与兼容迁移；保留历史数据的结构。
- `apps/backend/src/backup.mjs`：在线一致性数据库和附件备份。
- `apps/backend/test`、`apps/frontend/tests`：当前项目和共享模块测试。
- `scripts/local-app.mjs`：本地开发启动，复用已运行服务。
- `deploy`：部署说明及服务配置；必须按 `AGENTS.md` 保护正式数据。
- `.local`：忽略的本地数据库、附件、备份和运行日志，不属于待清理程序文件。

前端仅构建 `index.html` 与 `project-system.html`，均加载同一项目管理系统。
