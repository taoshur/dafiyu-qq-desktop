# Security Policy

## Supported versions

当前维护 `0.1.x`。

## Reporting a vulnerability

请不要在公开 Issue 中粘贴以下内容：

- `config/config.json` 中的 API Key、QQ 凭据
- `qq-bridge/state/console-token`
- `SnowLuma/config/webui.json`
- `state/memory.db` 或聊天记录
- 任何真实账号、群号、私聊内容

请使用 GitHub 的 **Private vulnerability reporting / Security advisory**，或先联系维护者获取私密渠道。

报告时请提供：

- 受影响版本
- 最小复现步骤
- 是否影响生产数据/进程
- 你已尝试的缓解措施

## Threat model

这个项目是**本机桌面控制台**，不是多租户服务端。

已实现的安全边界：

- 渲染进程无 Node 权限，`contextIsolation` + `sandbox`
- IPC 通道固定、参数白名单校验
- 生产 Memory 库只读；审核只写隔离测试库
- 服务页面用独立 `WebContentsView`，只允许回环地址
- qq-bridge 控制台令牌只由主进程注入请求头
- 服务停止前做 PID/启动时间/命令行/父子关系校验
- 默认关闭真实服务控制

## 不应提交的内容

提交前请确认 `git status` 不包含：

- `.env`、token、密码、API Key
- `state/`、`config/`、`backups/`
- `memory.db`、`*.db-wal`、`*.db-shm`
- `artifacts/` 中包含真实聊天/群号的截图
- 未获授权的第三方素材（Dafiyu 角色图已由项目所有者确认用于本项目）
