# 项目管理系统部署

当前独立项目站点为 https://pm.jtgc.cc，目录 `/www/wwwroot/jtgc.cc/pm`。部署与运维记录见 [PM_DEPLOYMENT.md](PM_DEPLOYMENT.md)。下方旧站点配置保留作为历史参考和正式数据保护说明。

> **正式数据保护（2026-09-22起）**：线上已正式使用。后续只更新程序，不覆盖或删除数据库、附件、图片及关联记录；整个生产data目录必须保留。禁止上传本地/演示数据库、清库、重新初始化或重置密码。过去清空旧Frappe的授权不适用于此后的正式数据。结构迁移须先备份并验证恢复方案，以保留数据为前提；有破坏风险时停止操作并确认。

站点：https://jtgc.whut.cc；服务器101.42.100.204；目录`/www/wwwroot/whut.cc/jtgc`。

使用宝塔已安装的`/www/server/nodejs/v24.21.0/bin/node`，复用宝塔Apache的HTTPS证书和127.0.0.1:18080反向代理。Node由`jtgc-management.service`守护，以www用户运行，仅data目录可写。不依赖Frappe、Docker、MariaDB或Redis。

本地执行`npm run build`和测试，只上传`apps/backend/src`、`apps/backend/package.json`、`apps/frontend/dist`及部署说明。不上传本地数据库或node_modules；服务器不下载、不编译、不安装依赖。

初次部署的空数据库仅创建admin账号。初始密码保存在服务器`data/initial-admin.txt`，登录后请修改。数据库和附件均位于`data/`，后续更新必须保留整个data目录，不可重建或覆盖。首页 `/` 和 `/project-system.html` 均为项目管理系统。旧系统页面和演示入口已退役；历史数据和附件继续保留。

运维命令：

上传采用独立二进制流式接口`POST /api/uploads`，单文件上限500MiB（界面显示500MB），不再将大文件放进JSON表单。部署时须检查宝塔Apache没有低于524288000字节的`LimitRequestBody`限制，并检查反向代理/请求读取超时适合大文件；Node请求超时30分钟。修改上传配置不涉及data目录或既有文件。服务器最多同时接收2个文件，超额请求提示稍后重试。未保存表单的上传对象不可下载，暂保留磁盘，不自动删除正式附件。

```bash
systemctl status jtgc-management
systemctl restart jtgc-management
journalctl -u jtgc-management -n 100 --no-pager
```

在宝塔网站菜单管理域名、证书和Apache配置；不要同时在宝塔Node项目菜单创建同端口的第二个进程。以后更新：本地构建验证、上传代码、保留data、重启此服务并检查HTTPS登录及业务流程。切勿再次执行清空旧站点操作。
