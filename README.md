# 大肥鱼桌面控制中心

Windows 11 上的 QQ 机器人桌面控制台，用于管理 **SnowLuma + qq-bridge + DeepSeek Harness（DSH）** 三件套。

> 这不是机器人本体，也不包含 SnowLuma、qq-bridge、DSH 的源码或账号。
> 它只是一个独立的外壳：状态检测、受控启停、日志、备份、Memory V3 只读浏览、服务网页内嵌和首次设置向导。

## 功能

- **总览**：三件套端口/进程状态、QQ 链路、Memory V3 计数、数据库完整性、模型、运行时长
- **服务管理**：按 SnowLuma → DSH → qq-bridge 顺序启动；只停止本软件启动且身份校验通过的进程
- **启动与恢复**：登录自启、机器人自启、异常自动恢复三个互相独立的开关，默认关闭
- **恢复引擎**：崩溃识别、退避、租约、BusyGuard、整树停止、watchdog 协调
- **运行日志**：只读 tail，不删除、不截断原文件
- **环境检查**：Node、目录、配置、依赖、state 可写性
- **长期记忆**：生产 `memory.db` 只读浏览 facts / events / candidates；测试库可演练审核
- **数据备份**：SQLite `VACUUM INTO` 一致性快照 + manifest/SHA256 校验 + 恢复演练
- **服务网页**：内嵌 SnowLuma WebUI（5099）和 qq-bridge 控制台（3100）
- **首次设置**：分步向导弹窗；SnowLuma 密码只作为一次 bootstrap 环境变量传入
- **安全基线**：`contextIsolation`、sandbox、固定 IPC 白名单、无 Node 渲染进程、令牌不进入 URL/页面

## 安全边界

- 只操作**由本软件启动**的进程；外部实例只检测，不误杀
- 真实服务控制默认关闭，必须在服务页显式开启
- 生产 Memory 库只读；候选审核只写隔离测试库
- qq-bridge 控制台令牌只由主进程从 `state/console-token` 注入，不进入 URL、不写日志
- 不包含任何 API Key、QQ 登录态、聊天记录或生产配置

## 环境要求

- Windows 11 x64
- Node.js 22+（开发与 CI 使用 Node 24）
- 已安装并可运行：
  - [qq-bridge](https://github.com/)（本地项目，路径可配置）
  - SnowLuma 2.x（本地安装，路径可配置）
  - DeepSeek Harness（可选，用于智能体宿主）
- 外部依赖的许可证需单独确认；本仓库不打包它们

## 快速开始

```powershell
git clone <your-repo-url> dafiyu-desktop
cd dafiyu-desktop
npm install
npm start
```

首次启动会自动弹出设置向导，也可以在侧边栏打开「首次设置」。

## 首次设置

### SnowLuma

SnowLuma 使用 **WebUI 密码**，不是控制台令牌。

- 已有 `C:\path\to\SnowLuma\config\webui.json`：继续使用原密码
- 全新安装：在向导里设置一个强密码；桌面把它作为 `SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD` 只传给这一次启动
- 登录设备：`http://127.0.0.1:5099`，用户名 `admin`
- 登录后请立即在 SnowLuma 内改密

详细说明：[docs/FIRST-RUN-CREDENTIALS.md](docs/FIRST-RUN-CREDENTIALS.md)

### qq-bridge

- 首次启动 bridge 自动生成 `state/console-token`
- 内嵌「qq-bridge 控制台」不需要手动输入令牌；主进程自动注入请求头
- 外部浏览器打开 `http://127.0.0.1:3100/` 时才需要手动读取该文件
- 不要把 `console-token` 提交到 Git 或打进分享包

## 开发

```powershell
npm test          # node:test，纯逻辑，不接触生产服务
npm run capture   # 生成 UI 截图到 artifacts/（该目录被 gitignore）
npm run pack      # dist/win-unpacked
npm run build     # dist/Dafiyu-Control-Center-Setup.exe
```

构建说明：[docs/WINDOWS-BUILD.md](docs/WINDOWS-BUILD.md)

发布到 GitHub 的步骤：[docs/PUBLISHING.md](docs/PUBLISHING.md)

### 注意

某些环境会设置 `ELECTRON_RUN_AS_NODE=1`。直接运行 Electron 会退化成 Node 并报 `bad option`；请使用 `npm start`，或先清除该环境变量。

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

## 架构

```text
src/main/       主进程：窗口、托盘、IPC、服务控制、恢复、备份、Memory、内嵌视图
src/preload/    contextBridge 白名单 API
src/renderer/   原生 HTML/CSS/JS 界面（无远程资源）
test/           node:test 单元/隔离测试
fixtures/       隔离测试用的假服务
scripts/        开发启动与截图脚本
build/          NSIS 安装脚本与图标
docs/           构建、首次登录、接管检查表
```

- 主进程是唯一能访问文件系统、进程和 SQLite 的层
- 内嵌服务页面使用 Electron `WebContentsView`，独立 `persist:dafiyu-embed` 分区
- 只允许 `127.0.0.1:5099` / `127.0.0.1:3100` 导航；外部跳转和弹窗拒绝
- 生产 `memory.db` 以只读 + `query_only` 打开

## 数据位置

- 桌面配置/日志/测试库：`%APPDATA%\dafiyu-desktop`
- 生产记忆：`<qq-bridge>/state/memory.db`
- 备份：`<qq-bridge>/backups/desktop-*`（以实际配置为准）

这些目录中的用户数据**不进入仓库**。

## 开源前必须确认

- 仓库中的 `deepseek-chan.png`、`src/renderer/assets/deepseek-chan.png` 和 `build/icon.ico` 是**中性占位图**，不是原项目角色素材。请确认你拥有角色图片/图标的再分发权利后再替换。
- SnowLuma、DSH 的许可证不允许直接再分发；本仓库只通过外部路径调用。
- qq-bridge 若使用 MIT 之外的许可证，请以其仓库为准。

## License

代码以 [MIT](LICENSE) 发布。第三方依赖、角色素材和外部服务各自的许可证不在此授权范围内。
