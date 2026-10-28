# 大肥鱼桌面控制中心 · Windows 构建与使用说明

## 1. 实际架构

- Electron 45.0.0（主进程是管理器，渲染进程无 Node 权限）
- 主进程：`src/main`；preload：`src/preload`；界面：`src/renderer`
- 数据库：Node 内置 `node:sqlite`，只读打开生产 `memory.db`；审核只在隔离测试库
- 不打包 SnowLuma / qq-bridge / DSH；它们作为外部依赖，通过路径配置连接
- 用户数据：`%APPDATA%\dafiyu-desktop`
  - `config/config.json`：桌面自己的路径与开关
  - `logs/app.log`：桌面日志
  - `state/memory-test.db`：隔离测试记忆库
  - 生产记忆仍在 `qq-bridge/state/memory.db`，桌面只读

## 2. 开发运行

```powershell
cd C:\path\to\dafiyu-desktop
npm install
npm start
```

若终端全局设置了 `ELECTRON_RUN_AS_NODE=1`，`npm start` 会清理；直接运行 exe 时请先清除该环境变量，否则 Electron 会退化成 Node 并报 `bad option`。

## 3. 构建

```powershell
cd C:\path\to\dafiyu-desktop
npm run pack     # dist/win-unpacked
npm run build    # dist/Dafiyu-Control-Center-Setup.exe
```

- 本机没有稳定的 Electron 下载链路，因此 `package.json` 使用：
  - `build.electronDist = "node_modules/electron/dist"`
  - `build.electronVersion = "45.0.0"`
- 图标：`build/icon.ico`（由 `deepseek-chan.png` 生成）
- 未配置代码签名；安装包会显示未知发布者
- 产物大小约 122 MB（Electron 运行时占主要部分）

## 4. 已实际验证

| 项 | 结果 |
| --- | --- |
| `npm run pack` | 成功，`dist/win-unpacked` 可启动 |
| `npm run build` | 成功，`dist/Dafiyu-Control-Center-Setup.exe` |
| 安装到临时目录 | 成功（NSIS 静默 `/S /D=...`） |
| 桌面快捷方式 | 成功（强制创建，`createDesktopShortcut: "always"`） |
| 开始菜单快捷方式 | 成功 |
| 安装后启动 | 成功，首页与长期记忆页可加载 |
| 卸载 | 成功 |
| 卸载后用户数据 | `%APPDATA%\dafiyu-desktop` 保留 |
| 重装 | 成功，测试库仍在 |

> 安装测试使用 `%TEMP%\DafiyuInstallTest*`，完成后已卸载；最终版本已安装到
> `%LOCALAPPDATA%\Programs\Dafiyu Control Center`，并创建桌面/开始菜单快捷方式。

## 5. 使用

- 启动：开始菜单/桌面快捷方式，或安装目录 `Dafiyu Control Center.exe`
- 关闭窗口：隐藏到托盘；不会停止机器人
- 托盘退出有两个选项：
  - 「退出并停止本软件启动的 bridge / SnowLuma」：只停止由桌面启动且身份校验通过的这两个服务，DSH 保持运行
  - 「仅退出界面（服务继续运行）」：旧行为，适合让机器人常驻
- 真实控制默认关闭；需要显式开启，且只停止由桌面启动、身份校验通过的进程
- 长期记忆页：
  - 生产库：只读浏览 facts / events / pending candidates
  - 隔离测试库：初始化合成候选，演练批准/拒绝；不会写生产库
- 配置页：可改桌面路径；项目 `config.json`、API Key、QQ 凭据只读脱敏展示
- **服务网页**：内嵌 SnowLuma WebUI（5099）和 qq-bridge 控制台（3100）
  - 使用 Electron `WebContentsView` 独立渲染，不是 renderer 里的 iframe/webview
  - 只允许 `127.0.0.1:5099` / `127.0.0.1:3100`，外部导航与弹窗一律拒绝
  - qq-bridge 的 `x-console-token` 只由主进程从 `state/console-token` 注入请求头，不进入 URL、不进入渲染进程、不写日志
  - 内嵌页拥有原服务管理权限；不要在其中执行不理解的操作

## 6. 记忆备份与恢复

- 备份页使用 SQLite `VACUUM INTO` 一致性快照，包含 WAL 已提交数据
- 备份在 `qq-bridge/backups/desktop-*`（以及 D 盘备份根，若存在）
- 校验会检查 manifest、SHA256、SQLite 完整性与表计数
- 恢复功能尚未开放：本轮不做生产覆盖式恢复

## 7. 已知问题

1. 真实服务控制默认关闭；生产接管仍需单独验收。
2. 生产记忆库只读；候选审核只在隔离测试库。
3. 机器人回复尚未进入 Memory V3（只在 social-v2/DSH 会话中）。
4. `config.json` 的模型/API Key/语音/QQ 配置目前只读脱敏，不提供写入。
5. 安装包未签名，Windows SmartScreen 可能提示。
6. 安装后首次启动需要确认外部依赖路径（qq-bridge/SnowLuma/DSH）。
7. 卸载保留用户数据是刻意的；不会删除记忆/配置。
8. 安装包包含 Electron 运行时，体积较大。

## 8. 依赖与分发注意

- Electron / electron-builder 为 MIT；`node:sqlite` 随 Electron/Node 提供，无额外原生模块
- SnowLuma、qq-bridge、DSH、角色素材的再分发许可未在本轮确认；当前安装包**不包含**它们
- 分享给其他用户时需要：
  - 独立用户数据目录（已具备）
  - 首次运行向导/外部依赖检查（部分具备）
  - 不内置维护者的 API Key、QQ 登录态、聊天记录（当前未内置）
  - 对可分发组件单独做许可审查
