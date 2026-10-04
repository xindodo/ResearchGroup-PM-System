# pm.jtgc.cc 部署记录

2026-10-02 首次部署到服务器 `101.42.100.204`。

- 地址：https://pm.jtgc.cc
- 程序目录：`/www/wwwroot/jtgc.cc/pm`
- 独立数据目录：`/www/wwwroot/jtgc.cc/pm/data`（数据库、WAL/SHM、uploads 均须保留）
- 服务：`pm-management.service`，www 用户运行，监听 `127.0.0.1:18082`，开机自启。
- Node：`/www/server/nodejs/v24.21.0/bin/node`
- Nginx：`/www/server/panel/vhost/nginx/pm.jtgc.cc.conf`，HTTP 跳转 HTTPS，500MiB 上传限制。
- 证书：`/www/server/panel/vhost/letsencrypt/pm.jtgc.cc/`，独立覆盖 pm.jtgc.cc。
- 续期：`pm-renew-cert.timer` 每日检查，剩余有效期不足 30 天时为该域名单独签发并重载 Nginx。
- 当前账号和密码：已按用户要求迁入本地账号及原有密码。服务器 `data/initial-admin.txt` 仅为首次空库初始化的历史凭据，不再代表当前管理员密码。

首次部署时目标目录为空，未上传本地数据库、账号、人员资料、项目或附件。初始数据库只有系统管理员账号，不影响旧站点正式数据。以后部署只上传程序和前端构建产物，保留整个 data 目录，不重置密码。结构升级前须先备份并验证备份可恢复。

本次包 `pm-release-20261002.tar.gz` 仅包含后端 src/package.json、前端 dist 和服务配置。SHA256：`a9ed2268f67cd694c88549f752f9a267370a17b44a41ee7030517bb7c28fa71b`。

原 jtgc.cc 配置已备份为 `/www/server/panel/vhost/nginx/jtgc.cc.conf.before-pm-20261002-151724`。仅将其中原 pm.jtgc.cc 绑定块移到独立配置；jtgc.cc 和 project.jtgc.cc 配置保留。HTTPS 启用前的项目站点配置也保留在 `pm.jtgc.cc.conf.before-https-20261002`。

验证：本地构建、25 项接口测试和 23 项浏览器测试通过；线上证书验证、首页及接口、管理员登录/退出、Secure Cookie、SQLite 完整性、服务及续期任务正常。首次部署业务记录和附件均为 0。

首次上线备份：`data/backups/2026-10-02T07-27-00.791Z`，已验证数据库完整性、外键检查和初始账号数量。

```sh
systemctl status pm-management
systemctl restart pm-management
journalctl -u pm-management -n 100 --no-pager
systemctl list-timers pm-renew-cert.timer
runuser -u www -- env JTGC_DATA_DIR=/www/wwwroot/jtgc.cc/pm/data /www/server/nodejs/v24.21.0/bin/node /www/wwwroot/jtgc.cc/pm/apps/backend/src/backup.mjs
```

首次 HTTPS 证书签发使用服务器已有宝塔 ACME 工具，不下载或编译服务器依赖。代码、构建产物和后续配置的参考文件在本目录；配置变更须先核对实际服务器状态，不覆盖其他站点配置。

## 本地数据迁移（2026-10-02）

用户明确要求上传本地业务数据和账号后，使用 SQLite 在线备份取得一致快照，迁入新站点。迁移前确认新站点只有初始管理员、默认配置及初始化审计记录，没有业务数据。旧正式系统 `/www/wwwroot/whut.cc/jtgc` 未改动。

已迁入 5 个账号、5 个项目、9 条成员关联、4 个任务、1 个里程碑、2 条工时、7 个单位、4 条单位人员关联、21 条项目字典选项及项目活动记录、人员资料和本地审计记录。保留所有账号 ID、密码哈希和业务关联；不迁移登录会话。源库附件记录为 0，没有需要迁入的上传附件；旧库备份和历史孤立附件未上传。

新站点迁移前备份：`data/backups/before-local-import-20261002T073643Z`。备份已验证完整性、外键及账号内容。迁移源快照、清单和迁移包存入 `data/backups/local-source-20261002`，目录权限 700，数据库和归档权限 600。源数据库 SHA256：`c4463d05e1de2904ac36b0af5b053f7746080c49925e8f9be19c4b1d279bfe48`。

迁移通过事务写入现有数据库，保留并映射初始化审计记录；验证所有迁入表与源快照内容一致、数据库完整性和外键检查通过。服务重新启动后再次逐表核对业务内容，HTTPS 健康检查及使用本地管理员原密码登录通过，线上项目列表显示全部 5 个项目。

此次授权只适用于本次首次业务数据迁入。后续常规部署继续保留整个生产 data 目录，不覆盖数据库、不导入本地测试数据、不重置账号密码。

## 功能更新部署（2026-10-02 19:04）

按用户“请部署”的明确要求，上线账号批量导入（CSV 模板、预览、逐行校验、整批原子创建）及成员类型名称维护（独立入口、同步账号和单位人员资料）。不包含数据库结构变更。

更新包 SHA256：`5931c4f51d224226f142d2dea1216c0d3c28763ad2a763b9dc22f23cec6f0677`。仅包含后端代码/package.json 和本地编译的前端 dist，不含本地数据库、密码文件或测试数据。

部署前数据库与 uploads 备份：`data/backups/before-code-update-20261002T110416Z`；代码备份：`deploy/before-code-update-20261002T110416Z.tar.gz`。已校验备份数据库完整性、外键和逐表内容可恢复。服务启动后再次逐表比对（审计与登录会话除外），业务数据、所有账号密码哈希及附件保持一致；现有账号 5、项目 5、任务 4、工时 2、单位 7、单位人员关联 5。线上 HTTPS 健康检查 200，服务 active，前端 JS/CSS 与本地构建 SHA256 一致。

本地 27 项接口测试、CSV 解析测试及 2 项管理界面浏览器测试通过。上线界面登录时发现线上管理员密码已不同于本地历史存档，未重置线上密码；此次部署保留线上现有密码。线上管理员登录后的页面未作直接浏览验证。

## 里程碑与任务、项目记录更新（2026-10-02 19:44）

按用户明确部署要求，上线项目内“里程碑与任务”合并标签页（里程碑分组、任务与子任务折叠）、按业务日期从早到晚排列的项目记录、逐项说明编辑及备注标签页置后。旧里程碑详情链接映射到合并页；全局里程碑维护和甘特图继续保留。说明编辑有权限及乐观版本检查，保持原任务排期、状态和关联。不涉及数据库结构迁移。

更新包：`pm-timeline-update-20261002.tar.gz`，SHA256 `afa8dd039d152935aeb604171033b7c4c75b3977344fee4e933015b65169dda2`。本地构建及 28 项接口测试、26 项浏览器测试通过；仅上传后端代码和前端 dist，无本地数据或密码文件。

部署前数据备份：`data/backups/before-timeline-update-20261002T114457Z`；代码备份：`deploy/before-timeline-update-20261002T114457Z.tar.gz`。验证数据备份完整性、外键及逐表内容；启动后核对全部业务表和账号密码哈希一致、uploads 文件哈希一致。线上当时账号 12、项目 5、任务 4、里程碑 1、工时 2、附件 0，全部保留。

线上服务 active，HTTPS 健康检查 200，新版 JS/CSS SHA256 与本地构建一致。使用历史保存的项目负责人密码进行一次登录验证时返回密码错误，未重置密码，也未修改账号或业务数据；登录后页面尚未直接浏览验证。核验清单保存在服务器 `deploy/last-timeline-update.json`，截图在本地 `.local/deploy/pm-timeline-deployed.png`。旧正式站点未改动。

## 项目列表与里程碑任务列表更新（2026-10-02 20:03）

按用户明确部署要求，仅更新前端 dist：项目列表增加相邻的项目类型、负责人列；项目内里程碑与任务改为五列列表，保留分组与子任务折叠、编辑；里程碑名称 15px、任务名称 14px，折叠图标样式统一。无数据库结构变更。本地构建及合并页浏览器回归检查通过。

包 `pm-list-update-20261002.tar.gz`，SHA256 `02a50fba69415ed5539081c7c8621a400b8a3dea9f0f4abf0b53bcca92c05365`。仅上传前端构建产物。

数据备份：`data/backups/before-list-update-20261002T120351Z`；前端备份：`deploy/before-list-update-20261002T120351Z.tar.gz`。SQLite 备份已验证完整性、外键及逐表内容，uploads 备份哈希一致；更新前后及服务启动后，业务表、账号密码哈希和附件均一致。服务 active、HTTPS 健康检查 200，首页引用及 JS/CSS 哈希与本地构建一致。核验清单 `deploy/last-list-update.json`，本地截图 `.local/deploy/pm-list-deployed.png`。未尝试登录或重置密码，登录后页面未在线直接浏览验证。旧正式站点未改动。

## 任务详情、标签和成员分配入口更新（2026-10-03 10:09）

用户明确要求部署。上线名称点击查看里程碑及任务详情、末列编辑操作、胶囊标签，以及项目负责人查看全部项目成员并从成员旁直接分配任务的入口；执行人自动选中所点击成员，停用成员仅保留历史展示。后端成员 DTO 补充 active 状态，沿用既有负责人任务权限，不增加新管理员角色，不迁移数据库结构。

本地构建、项目接口检查与合并页浏览器检查通过。包 `pm-member-update-20261003.tar.gz`，SHA256 `8d7dd549f69fbecdae45b120e8f89e7adb9a74aeb38b04e94a7b29eb818925d2`，只包含后端 src/package.json 和前端 dist，不上传本地数据。

线上数据备份 `data/backups/before-member-update-20261003T020904Z`、代码备份 `deploy/before-member-update-20261003T020904Z.tar.gz`。SQLite 备份完整性、外键及逐表内容验证通过，附件备份哈希一致；部署后及重启后业务数据、账号密码哈希和上传附件保持一致。服务 active，HTTPS 健康检查 200，HTML 引用与 JS/CSS 哈希匹配本地构建。核验清单 `deploy/last-member-update.json`，截图 `.local/deploy/pm-member-deployed.png`。未重置密码，登录后页面未直接线上浏览验证。旧正式站点未改动。

## 任务编辑入口显示改进（2026-10-03 11:05）

按用户明确部署要求，仅更新前端 dist：里程碑与任务列表末列固定在右侧，任务详情增加编辑任务或更新进度入口，无权限时明确显示仅查看。既有任务权限保持不变，无数据库迁移。本地构建与任务详情编辑入口浏览器检查通过。

包 `pm-task-edit-update-20261003.tar.gz`，SHA256 `edff1f5691684256963ed615cfceb0a3acfbbcac2ece3b7a1a91e5c279c87677`。数据备份 `data/backups/before-task-edit-update-20261003T030517Z`，前端备份 `deploy/before-task-edit-update-20261003T030517Z.tar.gz`。备份 SQLite 完整性、外键与逐表内容通过，附件备份哈希一致；部署与启动后业务数据、账号密码哈希和附件保持一致。服务 active、HTTPS 200、HTML 和 JS/CSS 哈希匹配本地构建。清单 `deploy/last-task-edit-update.json`，截图 `.local/deploy/pm-task-edit-deployed.png`。登录后页面未直接线上验证；不改密码，不操作旧正式站点。

## 账号角色更新（2026-10-03 12:38）

用户明确要求部署角色调整；之前已确认旧专业教师、系主任、教学主任、系管理员统一归为导师。账号角色现为系统管理员、导师、学生、只读访客；新增及批量导入默认导师，全局管理限系统管理员，项目权限按负责人和成员身份执行。

更新包 pm-roles-update-20261003.tar.gz，SHA256 20ff15bce67fdd6b1e9c8484e0646a8500e3ef256278ae92713a5f86832ccc8d，仅包含后端 src/package.json 和前端 dist。本地构建、30项接口测试、CSV测试和管理界面浏览器检查通过。

部署前备份 data/backups/before-roles-update-20261003T043855Z；代码备份 deploy/before-roles-update-20261003T043855Z.tar.gz。数据库备份完整性、外键及逐表内容一致性校验通过，uploads备份哈希一致。新版迁移8另行生成并验证迁移前数据库备份。

线上11个旧角色账号转为导师，1个系统管理员保留，目前学生和访客账号均为0。逐项验证用户数据只变更角色及revision，密码哈希、资料及其他字段完整保留；业务表和附件一致，原审计及迁移记录保留。12账号、5项目、4任务、1里程碑、2工时保留，uploads当前无文件。服务active、HTTPS健康检查200，线上HTML引用及JS/CSS哈希匹配本地。核验清单 deploy/last-roles-update.json，凭证 .local/deploy/pm-roles-deployed.png。未重置密码；登录后界面未直接线上验证。旧正式站点未改动。

## 侧栏字号与宽度调整（2026-10-03 12:42）

按用户明确要求，仅部署前端 dist。参考图片统一侧栏宽度224px、菜单16px、顶部系统名称22px；保留菜单内容和紧凑间距。本地构建、桌面计算样式、手机导航及用户菜单检查通过，窄屏无横向溢出。

包 pm-sidebar-update-20261003.tar.gz，SHA256 6e9cae5b3cbf000cbaee73af4cd73deac0874ca97bc9fe04c9297a0c4a57c0c3。数据备份 data/backups/before-sidebar-update-20261003T044214Z，前端备份 deploy/before-sidebar-update-20261003T044214Z.tar.gz。备份数据库完整性、外键及逐表内容一致性通过，附件备份哈希一致。上线后业务数据、账号及密码哈希、角色和迁移记录、附件均一致；服务active、HTTPS200、前端HTML引用及JS/CSS哈希匹配本地。核验清单 deploy/last-sidebar-update.json，截图 .local/deploy/pm-sidebar-deployed.png。没有后端或数据库迁移；旧正式站点未操作，登录后页面未直接在线浏览验证。

## 紧凑侧栏尺寸更新（2026-10-03 12:51）

按用户明确部署要求，仅更新前端dist：侧栏宽度200px、菜单14px、顶部标题19px，保留标题文字。构建及桌面、手机显示核验通过。

包pm-sidebar-compact-20261003.tar.gz，SHA256 263902d31bd694460518af17ca85b34494851a1f058bc30e03e9b538f95420be。数据备份data/backups/before-sidebar-compact-20261003T045119Z，前端备份deploy/before-sidebar-compact-20261003T045119Z.tar.gz。数据库备份完整性、外键、逐表内容及附件哈希验证通过，启动后业务数据、账号密码及角色、迁移记录、附件均一致。服务active，HTTPS200，HTML与JS/CSS哈希匹配本地。清单deploy/last-sidebar-compact.json，凭证.local/deploy/pm-sidebar-compact-deployed.png。没有数据库迁移，未操作旧正式站点；登录后页面未直接在线浏览验证。

## 学生负责人功能部署（2026-10-03 13:32）

按用户明确部署要求，上线“项目负责人”名称与可选“学生负责人”字段。学生负责人自动加入项目，可编辑所属项目、里程碑和任务；导师沿用原有权限。字段存于已有项目JSON，不迁移结构、不改写历史项目。本地构建、31项后端测试及学生负责人表单和编辑权限浏览器检查通过。

包pm-student-owner-20261003.tar.gz，SHA256 25bc05f2c1fbef21541c9e5cbae9259e94c0bac1f48705ae86f83415a6efde79，仅包含后端src/package.json与前端dist。数据备份data/backups/before-student-owner-20261003T053224Z，代码备份deploy/before-student-owner-20261003T053224Z.tar.gz。数据库备份完整性、外键及逐表内容校验通过，附件备份哈希一致。部署后业务数据、账号密码、角色及迁移记录、附件完全保留；12账号、5项目、4任务、1里程碑、2工时，uploads当前无文件。服务active、HTTPS200，线上HTML和JS/CSS哈希匹配本地。清单deploy/last-student-owner.json，凭证.local/deploy/pm-student-owner-deployed.png。未重置密码，未操作旧正式站点；登录后页面未直接在线浏览验证。

## 项目过程、任务参与人员与工作台更新（2026-10-03 14:31）

按用户明确部署要求，上线待部署修改：移除分类与专业维护标签；未填项目编号显示未填写，保留内部唯一编号及历史数据；任务描述加入新增/编辑表单，执行人名称改为负责人，参与人员可从项目成员中多选或留空；项目记录改为项目过程，仅按时间展示任务和里程碑，列为时间、里程碑/任务、负责人/参与人员、描述；我的任务拆成六列并收窄进度列，今天至未来3天内截止日期标红；移除我的提醒、三块统计卡片及工作台辅助说明。导师权限沿用原样，参与人员字段不增加编辑权限。无需数据库结构迁移，不改写旧项目或任务。

本地构建、31项后端测试、任务参与人员多选与项目过程页面浏览器测试通过。包pm-workbench-process-20261003.tar.gz，SHA256 b8f338793e19d7c64fd9aef07361394b00f44bba38546dbe3d67751c9e210069，只含后端src/package.json及前端dist。数据备份data/backups/before-workbench-process-20261003T063113Z，代码备份deploy/before-workbench-process-20261003T063113Z.tar.gz，备份数据库完整性、外键和逐表一致性通过，uploads备份哈希一致。部署后业务数据、账号密码、角色及迁移记录、附件完整保留；12账号、6项目、5任务、1里程碑、2工时，uploads当前无文件。服务active、HTTPS200，线上HTML引用及JS/CSS哈希匹配本地，登录页重新加载正常。未登录修改线上业务数据，登录后页面未直接线上浏览验证。清单deploy/last-workbench-process.json，凭证.local/deploy/pm-workbench-process-deployed.png。未重置密码，未操作旧正式站点。


## 人员参与标签与Excel功能部署（2026-10-03 15:08）

按用户明确部署要求，仅更新前端dist。人员详情标签改为基本信息、项目参与、任务参与、工时，按账号ID展示项目、负责/参与任务及工时明细和总/周/月汇总；保留资料编辑、附件与图片功能。一起上线任务截止日期倒序、工作台统计与项目名称同行、移除项目成员分配条、工时记录按钮移至导出统计左侧、所有活跃导入导出与模板改为真实xlsx，以及项目过程表格对齐。沿用既有权限，无后端或数据库结构迁移。

本地构建和人员桌面/手机浏览器测试通过；Excel导入导出、工时和合并列表相关检查此前通过。部署包pm-personnel-excel-20261003.tar.gz，SHA256 a9190528ced1a36fa43d0f3f0e6290e2c33a0521db1d77ac8212025cc1582e21，只含前端构建产物。数据备份data/backups/before-personnel-excel-20261003T070837Z，前端备份deploy/before-personnel-excel-20261003T070837Z.tar.gz。SQLite备份完整性、外键和逐表一致性通过，uploads备份哈希一致；更新并启动后业务数据、账号密码哈希、角色、迁移记录和附件均保持一致。12账号、6项目、5任务、1里程碑、2工时，uploads当前无文件。服务active、HTTPS200，JS/CSS及新增Excel动态组件资源哈希匹配本地，登录页面重新加载正常。清单deploy/last-personnel-excel.json，凭证.local/deploy/pm-personnel-excel-deployed.png。未操作旧正式站点；未登录修改线上数据，登录后页面未直接在线浏览验证。

## 飞书通知与截止日期升序部署（2026-10-03 15:48）

按用户明确部署要求，上线系统管理中的飞书通知配置、人员绑定、测试通知及通知日志。任务创建或变更可通知负责人和参与人员，持久化队列提供有限重试；App Secret加密保存，备份功能同时保留密钥文件。一起上线工作台任务截止日期升序排序（未填日期置后）和开始/结束日期斜杠对齐。自动通知默认关闭，尚未填写真实凭证或发送真实飞书消息。

本地前端构建通过；34项后端测试和飞书配置浏览器测试此前通过。包pm-feishu-20261003.tar.gz，SHA256 8726b958b14c7c7fdfd5811c5102bacf17e22b547aaa45ec8a4d6c965a9acbdc，仅包含后端src/package.json及前端dist。数据备份data/backups/before-feishu-20261003T074813Z，代码备份deploy/before-feishu-20261003T074813Z.tar.gz，SQLite备份完整性、外键和逐表内容一致性、附件哈希核验通过。升级仅新增3张空飞书表及队列索引；旧业务表、账号密码哈希、角色、迁移记录和附件均保持一致，密钥状态保留。当前12账号、6项目、7任务、2里程碑、2工时，uploads无文件。服务active、HTTPS200，所有前端资源哈希匹配本地；核验清单deploy/last-feishu.json，部署凭证.local/deploy/pm-feishu-deployed.png。未操作旧正式站点，未登录修改线上数据。真实通知需完成凭证、绑定和测试后启用。

## 页面配色、工作台字号与里程碑拆列部署（2026-10-03 16:20）

按用户明确部署要求，仅更新前端dist：工作台、任务及工时页与项目列表统一暖白/米色、棕橙强调和蓝色进行中标签，工作台列表字号14px及名称/表头字重统一；里程碑列表拆分里程碑和所属项目列，保留详情与项目跳转。保持紧凑间距，不改变业务权限。

本地构建通过，任务与工时桌面/手机检查通过，手机无页面横向溢出；工作台配色桌面/手机检查通过。旧完整项目流程测试在选择未被测试准备创建的“联合研究机构”时超时，未宣称该测试通过。包pm-page-style-20261003.tar.gz，SHA256 7bb0e90df30b74631a58ae48f7f42bc1d5781dae10748ef8bb9d7372158c2aa7，只包含前端dist。数据备份data/backups/before-page-style-20261003T082042Z、前端备份deploy/before-page-style-20261003T082042Z.tar.gz；SQLite备份完整性、外键、逐表内容和附件哈希核验通过。更新前后所有业务表、账号密码、角色、迁移记录、飞书配置/绑定/发送记录及密钥状态一致，12账号、6项目、7任务、2里程碑、2工时，uploads无文件。服务active、HTTPS200、线上前端资源哈希匹配本地。清单deploy/last-page-style.json，凭证.local/deploy/pm-page-style-deployed.png。没有数据库结构变更，未操作旧正式站点；登录后页面未直接线上验证。

## 任务列表与工时紧凑展示部署（2026-10-03 16:42）

按用户明确部署要求，仅更新前端dist。工作台标题红色、项目名蓝色、任务名红色不加粗；负责项目任务合并为统一列表，同项目名称合并单元格显示一次；任务栏目采用同样列表样式，包含项目名称、任务名称、负责人、状态、任务进度、截止日期、操作，进度列145px，同项目内截止日期升序。项目/全局/人员工时统一只显示时:分，删除换算行、十进制小时列及导出中的换算列，保留原有分钟计算和业务数据。

本地构建、任务列表合并/排序/样式/跳转/手机无溢出检查及90分钟显示01:30的工时页面检查通过。包pm-compact-lists-20261003.tar.gz，SHA256 56a6f10dc310d79072b7e3a61d8cc48bb59378bfc04d761bc84edf23fb5e9906，仅包含前端dist。数据备份data/backups/before-compact-lists-20261003T084216Z，前端备份deploy/before-compact-lists-20261003T084216Z.tar.gz，SQLite备份完整性、外键及逐表内容一致性、附件哈希验证通过。部署前后业务数据、账号密码、角色、迁移记录、飞书配置/绑定/发送记录及密钥状态一致，12账号、6项目、7任务、2里程碑、2工时，uploads无文件。服务active、HTTPS200、所有前端资源哈希匹配本地，登录页面刷新正常。清单deploy/last-compact-lists.json，凭证.local/deploy/pm-compact-lists-deployed.png。未修改后端或数据库结构，未操作旧正式站点；登录后业务页面未直接线上浏览验证。

## 胶囊标签、深红色与任务名称列部署（2026-10-03 16:48）

按用户明确要求，仅更新前端dist：项目过程类型使用胶囊标签，名称常规字重；工作台标题、任务名称及任务栏目标题统一项目页强调色#a4522e；任务名称列加宽，项目名称列20%，负责人100px、进度135px、表格最小宽度1160px，保持横向滚动和紧凑间距。前端构建通过。

部署包pm-task-refinement-20261003.tar.gz，SHA256 aecf48b18a60153e77fc9f3edcd96699c0dd8d987845f67a73845a6215f06fec。数据备份data/backups/before-task-refinement-20261003T084816Z，前端备份deploy/before-task-refinement-20261003T084816Z.tar.gz。SQLite备份完整性、外键和逐表一致性及附件备份哈希通过；部署前后业务表、账号密码、角色、迁移记录、飞书配置/绑定/消息记录和密钥保持一致。12账号、6项目、7任务、2里程碑、2工时，uploads无文件。服务active、HTTPS200，线上全部资源哈希匹配本地，登录页刷新正常。清单deploy/last-task-refinement.json，凭证.local/deploy/pm-task-refinement-deployed.png。无数据库结构变更，未操作旧正式站点；登录后业务页面未直接线上浏览验证。

## 任务类型与列表布局部署（2026-10-03 17:06）

按用户明确要求部署后端src/package.json与前端dist。任务详情及新增/编辑任务增加可选任务类型，系统管理新增任务类型目录，支持查询、新增、修改、删除。任务类型改名同步引用并递增任务版本，已被使用的类型禁止删除，只有系统管理员可维护。使用已有pm_options和任务JSON，不迁移结构、不播种类型、不重写历史任务。一起上线任务栏目全宽及桌面自适应列宽、临近截止日期统一强调色、工作台上下状态/进度/截止/操作列对齐、项目名称常规字重。

前端构建、35项后端测试及任务类型目录新增/任务详情/编辑选项/清空类型浏览器检查通过，前述桌面无横向滚动及上下列坐标检查通过。包pm-task-types-20261003.tar.gz，SHA256 fb32d52f50a87b6d8b11aeac7fa1021ec4b3e9921f8de202df6b25b36e1aca48。数据备份data/backups/before-task-types-20261003T090612Z，代码备份deploy/before-task-types-20261003T090612Z.tar.gz。SQLite备份完整性、外键和逐表一致性及附件哈希验证通过；部署前后业务表、账号密码、角色、迁移记录、飞书配置/绑定/消息记录和密钥一致。12账号、6项目、7任务、2里程碑、2工时，uploads无文件。服务active、HTTPS200，所有前端资源哈希匹配本地，登录页刷新正常。清单deploy/last-task-types.json，凭证.local/deploy/pm-task-types-deployed.png。未操作旧正式站点；登录后业务页面未直接线上浏览验证。


## 里程碑紧凑列表与字号统一部署（2026-10-03 17:17）

按用户明确要求，仅更新前端dist：里程碑列表移除实际日期、日期提醒及关联任务统计的小字，进度条与百分比同行，表头改为计划日期、状态、进度并缩小行距；工作台标题、统计数及日程文字与项目页统一为14px；任务类型管理移除说明文字。前端构建通过，无后端或数据库结构修改。

部署包pm-milestone-compact-20261003.tar.gz，SHA256 304300ecc8e032bb371fed9d7917fff6f56d38138905e335972843c48f970d38。数据备份data/backups/before-milestone-compact-20261003T091745Z，代码备份deploy/before-milestone-compact-20261003T091745Z.tar.gz。SQLite备份完整性、外键及逐表内容一致性、附件哈希验证通过。部署前后业务数据、账号密码、角色、迁移记录、飞书配置/绑定/消息和密钥一致：12账号、6项目、7任务、2里程碑、2工时，uploads无文件。服务active、HTTPS200，线上全部前端资源哈希匹配本地，登录页刷新正常。清单deploy/last-milestone-compact.json，凭证.local/deploy/pm-milestone-compact-deployed.png。未操作旧正式站点；登录后业务页面未直接在线浏览验证。


## 人员任务饱和度部署（2026-10-03 17:36）

按用户明确要求更新后端src/package.json和前端dist。任务栏目新增人员饱和度标签页：按负责人及参与人员逐日统计任务，已完成任务不占额度，起止日期包含端点，无日期任务单独计数；设置每人每日任务数量上限，展示14天负荷、未完成、已完成、逾期及当日饱和度，支持搜索、超负荷筛选和姓名/日期明细。仅系统管理员可设置所有人员，其他人员只可设置本人；统计沿用项目可见范围。新增pm_task_capacity空表，不播种上限、不改写旧任务。一起上线相关任务列表的任务类型列，以及项目蓝色与工作台统一为#315d94。

本地前端构建、36项后端测试通过；计算边界/参与人去重检查、浏览器保存持久性/筛选/明细及手机无页面横向溢出检查通过。包pm-task-capacity-20261003.tar.gz，SHA256 b619384e53762090d3569b54421cf4aca81c3013b8f4df1b278b8c249c4c645e。数据备份data/backups/before-task-capacity-20261003T093624Z，代码备份deploy/before-task-capacity-20261003T093624Z.tar.gz。SQLite备份完整性、外键和逐表内容一致性及附件哈希通过。部署后只新增空配置表，旧业务表、账号密码、角色、迁移记录、飞书配置/绑定/发送记录和密钥均一致。12账号、6项目、7任务、2里程碑、2工时，uploads无文件。服务active、HTTPS200、前端资源哈希匹配，登录页刷新正常。清单deploy/last-task-capacity.json，凭证.local/deploy/pm-task-capacity-deployed.png。未操作旧正式站点；登录后业务页面未直接在线浏览验证。


## 多人工时与项目过程展示部署（2026-10-03 18:04）

按用户明确要求更新后端src/package.json及前端dist。新增工时记录可多选项目人员，同一任务、时间、备注及标签为每人生成独立记录，事务内先验证全部人员权限和跨项目时间重叠，任一失败整批不写入；编辑继续逐条处理。原有权限不变，无数据库结构修改。一起上线工号/学号名称、项目过程任务按截止日期/里程碑按计划日期升序（空日期最后）、负责人和参与人员分列、任务胶囊及项目内任务名称使用工作台蓝色。

前端构建、37项后端测试及多选录入/独立90分钟记录/单条编辑浏览器检查通过。包pm-batch-time-process-20261003.tar.gz，SHA256 60d40b27396882a02ab361643821a27370bdedea7d85b54c0acce89b91addbab。数据备份data/backups/before-batch-time-process-20261003T100418Z，代码备份deploy/before-batch-time-process-20261003T100418Z.tar.gz。SQLite备份完整性、外键、逐表一致性和附件备份哈希通过。部署前后业务数据、账号密码、角色、每日任务上限配置、飞书配置/绑定/消息/密钥及附件保持一致。当前13账号、6项目、9任务、3里程碑、3工时，uploads无文件。服务active、HTTPS200、线上全部前端资源哈希匹配本地，登录页刷新正常。清单deploy/last-batch-time-process.json，凭证.local/deploy/pm-batch-time-process-deployed.png。未操作旧正式站点；登录后业务页面未直接在线浏览验证。


## 工作台项目任务折叠与甘特图排版部署（2026-10-03 18:25）

按用户明确要求，仅更新前端dist。工作台负责项目任务列表改为项目/任务树，项目行可收起其全部任务，不显示里程碑；保留子任务折叠、详情及编辑，任务类型等列沿用项目里程碑/任务组件，字号14px、任务名称蓝色#315d94与项目内一致。项目名称只显示一次，保持常规字重；未关联里程碑的任务也纳入项目树，空项目仍可展示。一起上线甘特图名称列加宽、名称和任务数量不换行，以及区分未完成棕红色与已完成绿色的图例。

前端构建、项目折叠/子任务折叠/未关联任务/空项目/任务详情浏览器检查及任务字号颜色与项目列表对比通过。部署包pm-project-task-fold-20261003.tar.gz，SHA256 e9bc6f8c8afb3f6533a6b62ac01c0f2ee35bd81ebf34cbd42a2f074867df6d02。数据备份data/backups/before-project-task-fold-20261003T102552Z，前端备份deploy/before-project-task-fold-20261003T102552Z.tar.gz。SQLite备份完整性、外键、逐表一致性和附件备份哈希验证通过；部署前后业务数据、账号密码、角色、每日任务上限配置、飞书配置/绑定/消息/密钥和附件均保持一致。当前13账号、6项目、9任务、3里程碑、5工时，uploads无文件。服务active、HTTPS200、线上全部前端资源哈希匹配本地、登录页面刷新正常。清单deploy/last-project-task-fold.json，凭证.local/deploy/pm-project-task-fold-deployed.png。未修改后端或数据库结构，未操作旧正式站点；登录后业务页面未直接线上浏览验证。


## 工作台上下项目任务折叠列表部署（2026-10-03 18:36）

按用户明确要求，仅更新前端dist。我的任务进展及负责项目任务采用同一ProjectWorkbenchTaskList组件，项目在前、任务在后，项目和子任务可折叠，不显示里程碑。项目名称深红#a4522e、任务名称蓝色#315d94，名称常规字重；任务类型、负责人、状态徽标、紧凑进度条、截止日期和查看任务操作统一。个人列表保留全部/未完成/已完成过滤，仅显示本人负责任务；负责项目列表沿用项目负责人和学生负责人范围，不改变权限。上下两表使用相同固定列宽，桌面1440px全部列x坐标相等。

前端构建及浏览器项目/子任务折叠、过滤独立性、颜色、跳转和列坐标验证通过。包pm-workbench-aligned-fold-20261003.tar.gz，SHA256 d460294037cc7f3044115ee2ca43414ef500e215a9fdc19fe994d2f700978053。数据备份data/backups/before-workbench-aligned-fold-20261003T103613Z，前端备份deploy/before-workbench-aligned-fold-20261003T103613Z.tar.gz。SQLite备份完整性、外键、逐表一致性和附件备份哈希验证通过；部署前后业务数据、账号密码、角色、每日任务上限、飞书配置/绑定/消息/密钥及附件均一致。13账号、6项目、9任务、3里程碑、5工时，uploads无文件。服务active、HTTPS200、线上前端资源哈希匹配、登录页面刷新正常。清单deploy/last-workbench-aligned-fold.json，凭证.local/deploy/pm-workbench-aligned-fold-deployed.png。无后端或数据库结构修改，未操作旧正式站点；登录后业务页面未直接线上浏览验证。


## 各栏目列表紧凑行高与工作台倒序部署（2026-10-03 20:54）

按用户明确要求，仅更新前端dist。工作台项目及任务按截止日期从晚到早排序，空日期最后；两块列表统一每行约38px。项目主列表表头/单行38px、项目内里程碑/任务与项目过程减少单元格垂直间距；任务主列表压缩至5px上下间距，组织单位/人员及人员参与列表减少间距并压缩列表操作按钮。字号、权限、列布局及折叠筛选保持原有行为。

前端构建通过，工作台倒序/紧凑行高/折叠/筛选/颜色/上下列坐标浏览器验证通过。其余栏目为局部CSS调整，未单独完成浏览器验证。包pm-compact-all-lists-20261003.tar.gz，SHA256 f3e49b7deeda1d7b2c0ccee6270ff70b4bd10a731a325ae389366009a7d8705b。数据备份data/backups/before-compact-all-lists-20261003T120546Z，前端备份deploy/before-compact-all-lists-20261003T120546Z.tar.gz。SQLite备份完整性、外键、逐表一致性及附件哈希验证通过；部署前后业务数据、账号密码、角色、任务上限、飞书配置/绑定/消息/密钥及附件一致。13账号、6项目、9任务、3里程碑、5工时，uploads无文件。服务active、HTTPS200、线上前端资源哈希匹配、登录页面刷新正常。清单deploy/last-compact-all-lists.json，凭证.local/deploy/pm-compact-all-lists-deployed.png。无后端或数据库结构修改，未操作旧正式站点；登录后业务页面未直接线上浏览验证。


## 任务栏目统一折叠列表部署（2026-10-03 23:00）

按用户明确要求，仅更新前端dist。任务栏目项目任务列表复用工作台ProjectWorkbenchTaskList，项目/子任务可折叠、项目深红任务蓝色、截止日期倒序、统一列宽及约38px紧凑行高。保留人员饱和度标签页与原有项目可见范围。前端构建及浏览器排序/项目折叠/列位置与工作台一致/标签页切换验证通过。

包pm-shared-task-list-20261003.tar.gz，SHA256 2a32981065e1e32f2b889825cc74cff2ff3c886018ac30a9d25f34dfb333ac67。数据备份data/backups/before-shared-task-list-20261003T150057Z，前端备份deploy/before-shared-task-list-20261003T150057Z.tar.gz。SQLite备份完整性、外键、逐表一致性及附件哈希核验通过；部署前后业务数据、账号密码、角色、任务上限、飞书配置/绑定/消息/密钥及附件一致。13账号、6项目、9任务、3里程碑、5工时，uploads无文件。服务active、HTTPS200、线上全部前端资源哈希匹配本地，登录页面刷新正常。清单deploy/last-shared-task-list.json，凭证.local/deploy/pm-shared-task-list-deployed.png。无后端或数据库结构修改，未操作旧正式站点；登录后业务页面未直接线上浏览验证。


## 任务工日与组织分类部署（2026-10-04 11:17）

按用户明确要求更新后端src/package.json及前端dist。任务编辑新增花费工日0.5至10.0、以0.5递增，支持未填写、清空，负责人及管理人员按已有编辑权限保存，未提交字段保留旧值；项目过程在参与人员后显示工日，合计当前筛选下任务工日，不按参与人数倍增、不重复计算里程碑。工日使用已有任务JSON，无结构迁移、不重写历史任务。

一起上线组织所有单位/校内单位/其他高校/其他企业标签及分类选项；旧校外单位保留在所有单位中供手动归类，不自动转换数据。组织汇总优先保留独立人员档案，对同名后建登录账号不再生成重复未分配行，不合并档案或改写账号归属；允许同名账号存在时编辑原档案的归属，姓名变更仍检查冲突。单位人员筛选布局现有本地修改也随构建上线。

前端构建、39项后端测试及工日选项/保存回显/过程列/筛选合计浏览器验证通过。包pm-workdays-organization-20261004.tar.gz，SHA256 db1ff2505012faee9fea624b9b95459036b825d49b15cd874fd393e73e3b66c5。数据备份data/backups/before-workdays-organization-20261004T031717Z，代码备份deploy/before-workdays-organization-20261004T031717Z.tar.gz。SQLite备份完整性、外键、逐表一致性与附件哈希通过；部署前后业务数据、账号密码、角色、每日任务上限、飞书配置/绑定/消息/密钥及附件一致。13账号、6项目、9任务、3里程碑、5工时，uploads无文件。服务active、HTTPS200、线上全部前端资源哈希匹配本地、登录页面刷新正常。清单deploy/last-workdays-organization.json，凭证.local/deploy/pm-workdays-organization-deployed.png。未操作旧正式站点；登录后业务页面未直接线上浏览验证。


### 2026-10-04 12:24 工日统计部署

- 仅更新前端构建产物，包 `pm-task-workday-summary-20261004.tar.gz`，SHA256 `fb88b8965fd848eafe96719a1ad664a5086adaca71caf741038c4aebef9b9061`。
- 工日表直接读取任务花费工日；负责人及参与人员各计完整工日，同人去重。任务列表、项目过程及项目合计按人员总工日计算；个人统计、个人明细及人员筛选按本人花费工日计算。Excel 同步。
- 项目过程日期显示开始时间/结束时间，里程碑与任务列表新增工日列。
- 数据备份 `/www/wwwroot/jtgc.cc/pm/data/backups/before-task-workday-summary-20261004-20261004T042417Z`；前端代码备份 `/www/wwwroot/jtgc.cc/pm/deploy/before-task-workday-summary-20261004-20261004T042417Z.tar.gz`。
- SQLite备份完整性、外键和快照验证通过；部署前后业务表数据相同（13用户、6项目、9任务、3里程碑、5历史工时记录），附件0个且哈希一致；账号密码、飞书配置/绑定/密钥及人员容量设置保留。
- 服务active、HTTPS 200，3个资源哈希与本地构建一致，线上登录页加载正常。未使用线上账号修改业务数据。
- 本地类型检查、构建、工日统计测试、浏览器多人统计/筛选/列表及Excel数字导出验证通过。
- 截图 `.local/deploy/pm-task-workday-summary-deployed.png`；部署清单服务器 `deploy/last-task-workday-summary-20261004.json`。


### 2026-10-04 13:16 工日折叠列表与筛选部署

- 前端包 `pm-workday-fold-filter-20261004.tar.gz`，SHA256 `5120404281bd587ca76216ba44eef5634e36f7d27155d53ca2d9d0347a940b93`。仅更新前端产物。
- 工日栏目按项目可折叠，项目深红色、任务蓝色、紧凑行高，与工作台风格一致。上方项目/人员筛选同步下方列表，未填工日任务正常列出，个人筛选按本人工日，项目行按筛选范围汇总。导出按筛选结果。
- 数据备份 `/www/wwwroot/jtgc.cc/pm/data/backups/before-workday-fold-filter-20261004-20261004T051613Z`；前端代码备份 `/www/wwwroot/jtgc.cc/pm/deploy/before-workday-fold-filter-20261004-20261004T051613Z.tar.gz`。
- 备份完整性、外键和快照验证通过；业务表部署前后完全相同（13用户、6项目、9任务、3里程碑、5历史工时记录），附件0个且哈希一致；密码、飞书配置/绑定/密钥、容量设置保留。
- 服务active、HTTPS 200、前端资源哈希匹配；线上登录页加载正常。构建及本地浏览器筛选/折叠/颜色/个人工日/Excel验证通过。
- 凭证 `.local/deploy/pm-workday-fold-filter-deployed.png`；服务器清单 `deploy/last-workday-fold-filter-20261004.json`。


### 2026-10-04 13:31 科研院所分类及描述省略部署

- 包 `pm-research-unit-description-20261004.tar.gz`，SHA256 `000844a41c0e7797e100e048cef1617215afd7a542fbd5118310ab671b3ac57e`，更新后端代码和前端构建，无结构迁移。
- 组织分类在其他高校后新增科研院所，单位新增、编辑及地址恢复支持此分类；项目过程描述单行省略，悬停显示全文。
- 数据备份 `/www/wwwroot/jtgc.cc/pm/data/backups/before-research-unit-description-20261004-20261004T053147Z`；代码备份 `/www/wwwroot/jtgc.cc/pm/deploy/before-research-unit-description-20261004-20261004T053147Z.tar.gz`。
- 备份完整性/外键/快照验证通过，业务表部署前后完全相同（14用户、6项目、9任务、3里程碑、5历史工时记录），附件0且哈希一致；密码、飞书配置、密钥、绑定及容量设置保留。
- 39后端测试、前端构建通过，服务active、HTTPS200，线上3个资源哈希与本地匹配；登录页服务连接正常。
- 凭证 `.local/deploy/pm-research-unit-description-deployed.png`；服务器清单 `deploy/last-research-unit-description-20261004.json`。


### 2026-10-04 13:47 任务勾选完成部署

- 包 `pm-task-completion-checkbox-20261004.tar.gz`，SHA256 `01012fff7dd92f518407acf260e2acf97596aee27e36e1b3cd40d6ac53629261`，更新后端及前端，无数据库结构迁移。
- 工作台与项目里程碑/任务树新增任务勾选框。勾选保存已完成100%，名称删除线；取消恢复进行中及完成前进度。沿用任务权限，保存期间禁用重复操作，版本冲突显示错误并恢复勾选状态。共享任务栏目列表同样同步。
- 数据备份 `/www/wwwroot/jtgc.cc/pm/data/backups/before-task-completion-checkbox-20261004-20261004T054735Z`；代码备份 `/www/wwwroot/jtgc.cc/pm/deploy/before-task-completion-checkbox-20261004-20261004T054735Z.tar.gz`。
- 备份完整性/外键/快照验证通过；业务表部署前后完全相同（14用户、7项目、11任务、4里程碑、5历史工时记录），附件0且哈希一致；密码、飞书配置、绑定、密钥和容量设置保留。
- 39后端测试、前端构建通过；本地浏览器验证勾选、删除线、100%、跨列表同步、刷新持久化、取消恢复原进度与版本冲突。
- 服务active、HTTPS200、前端3资源哈希匹配、线上登录页连接正常。未在生产创建测试数据或改动任务。
- 凭证 `.local/deploy/pm-task-completion-checkbox-deployed.png`；服务器清单 `deploy/last-task-completion-checkbox-20261004.json`。

## 2026-10-04 14:02 甘特图缩放与工作台待办

- 已部署至 https://pm.jtgc.cc/，仅更新前端 dist。甘特图 100%–1200% 缩放；工作台新增今日待办、本周待办、逾期任务。
- 本地构建、待办日期分类测试与两项浏览器验证通过；线上 HTTPS=200、service=active、资源 SHA256 全部匹配。
- 包：pm-gantt-zoom-workbench-todos-20261004.tar.gz；SHA256：fd633d28105cd61acd7738c16568bb896f1f48c93755f5bd5fd4e8d44f7611ec。
- 数据备份：/www/wwwroot/jtgc.cc/pm/data/backups/before-gantt-zoom-workbench-todos-20261004-20261004T060231Z；代码备份同标签保存在 deploy 目录。
- 数据备份完整性、外键和业务快照一致；部署前后 14 用户、7 项目、11 任务、4 里程碑、5 原工时记录，附件 0。账号密码、飞书配置和密钥均保留；未操作旧站 jtgc.whut.cc。

## 2026-10-04 14:25 待办范围、紧凑条目与日期

- 仅更新前端 dist：今日待办为逾期至未来第5天，近期待办第6–10天；逾期底色/边线/天数标记；待办隐藏项目名；顶部统计替换年月日与星期。
- 本地构建、日期边界测试、浏览器验证通过；线上 active、HTTPS 200、所有资源 SHA256 匹配。
- 包 pm-compact-todos-date-20261004.tar.gz；SHA256 a13334901056baff8b50aa8c4a0a442b3c11d8d0549734cc5a8dacdb1d969d4b。
- 备份 /www/wwwroot/jtgc.cc/pm/data/backups/before-compact-todos-date-20261004-20261004T062516Z；代码备份为 deploy/before-compact-todos-date-20261004-20261004T062516Z.tar.gz。
- 备份完整性与业务快照验证通过，前后14用户、7项目、11任务、4里程碑、5原工时记录，附件0。账号密码、飞书配置/密钥及全部业务数据保留；未操作旧站。

## 2026-10-04 15:06 全账号统一课题组排序与待办对齐

- 更新前端 dist、后端 src/package；课题组排序仅管理员可编辑，服务器保存、全部账号共用，按单位 ID 保留改名后顺序；待办勾选框和名称统一左侧边距。
- 本地构建、40 项后端测试、跨账号浏览器验证通过。线上服务 active，HTTPS 200，资源 SHA256 一致。
- 包 pm-shared-unit-order-alignment-20261004.tar.gz；SHA256 4d5511ebc260962acbcdfa3da8b7af0fa5bbd5e88b2ab82220bc09ecd975057f。
- 备份 /www/wwwroot/jtgc.cc/pm/data/backups/before-shared-unit-order-alignment-20261004-20261004T070600Z；代码备份同标签保存在 deploy。
- 启动前已验证备份完整性、外键、恢复快照与附件哈希；仅新增空 pm_unit_order 表。原有各业务表前后逐条一致，14用户、7项目、11任务、4里程碑、5原工时记录，附件0；账号密码、飞书配置/密钥保留。未操作旧站。

## 2026-10-04 15:18 项目删除与甘特图未来总览

- 部署前端 dist、后端 src/package；增加项目详情删除按钮、关联任务/工日/附件预览确认；使用软删除保留全部关联数据。甘特图新增75%、50%、25%、12.5%档位并扩展未来时间范围。
- 本地构建、41项后端测试、删除及缩放浏览器验证通过。线上 active、HTTPS200、所有资产 SHA256匹配。
- 包 pm-project-delete-gantt-overview-20261004.tar.gz，SHA256 2ef7326857c502dcd89072aba3c7de1f2d4d1520000c3c5cca646ed2f865ca8e。
- 数据备份 /www/wwwroot/jtgc.cc/pm/data/backups/before-project-delete-gantt-overview-20261004-20261004T071858Z；代码备份同标签位于 deploy。
- 备份完整性、外键、恢复快照及附件哈希校验通过；部署前后各业务表一致，14用户7项目11任务4里程碑5原工时记录、附件0；密码/飞书配置和密钥保留。未操作旧站，未执行线上项目删除。

## 2026-10-04 15:43 任务依赖展示与管理员删除权限

- 已更新前端 dist、后端 src/package。列表/甘特图任务前置后续标记，甘特图蓝色连接箭头随缩放折叠更新；项目操作靠右，删除按钮与后端权限均限系统管理员。
- 本地构建、项目删除权限测试、管理员/普通负责人按钮验证、跨里程碑依赖及缩放折叠验证通过。线上服务active、HTTPS200、资源哈希匹配。
- 包 pm-task-dependencies-admin-delete-20261004.tar.gz，SHA256 e6eb89a35ff9edbfbe138a90ab1b47f295fc96a7f9d80d2118843e0dfd763038。
- 数据备份 /www/wwwroot/jtgc.cc/pm/data/backups/before-task-dependencies-admin-delete-20261004-20261004T074321Z，代码备份同标签位于deploy。
- 备份完整性、外键、恢复快照和附件哈希验证通过。部署前后各业务表一致，14用户、7项目、13任务、4里程碑、5原工时记录，附件0；密码、飞书配置/密钥保留。未操作旧站，未删除任何线上项目。

## 2026-10-04 21:31 任务排期排序与项目人员权限

- 更新前端 dist、后端 src/package；里程碑与任务、甘特图按前后置关系优先，再按开始和截止日期升序排序，不使用创建时间。项目成员可查看全部项目任务；任务负责人及参与人员可管理该项目全部任务，项目管理权限保持独立。任务编辑增加删除确认，采用软删除保留历史记录及附件。
- 本地构建、5项排序测试和43项后端测试通过；成员查看权限测试通过，随机端口被fetch阻止的一项在单独重跑后通过；任务参与人员编辑及删除浏览器验证通过。线上service active、HTTPS200、资源SHA256全部匹配，登录页正常。
- 包 pm-task-sorting-member-access-20261004.tar.gz；SHA256 40935d22856f6030616ef7df48023e79124f963d1c6a4148a08dfef1687b0437。
- 数据备份 /www/wwwroot/jtgc.cc/pm/data/backups/before-task-sorting-member-access-20261004-20261004T133138Z；代码备份同标签位于deploy。
- 数据库备份完整性、外键、恢复快照、附件哈希验证通过；部署前后业务表逐条一致，14用户、8项目、14任务、4里程碑、5原工时记录，附件0；密码和飞书配置/密钥保留。无数据库结构变更，未操作旧站或线上业务数据。
