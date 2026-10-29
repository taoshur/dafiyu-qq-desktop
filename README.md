# 大肥鱼桌面控制中心

Windows 11 上的 QQ 机器人桌面控制台，用于管理 **SnowLuma + qq-bridge + DeepSeek Harness（DSH）** 三件套。

> 本项目是基于 [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge) 的二次创作，不是 qq-bridge 官方项目。
> 上游代码与文档以 MIT 许可发布；本仓库保留其版权与许可声明，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

> 这不是机器人本体，也不包含 SnowLuma、qq-bridge、DSH 的源码或账号。
> 它只是一个独立的外壳：状态检测、受控启停、日志、备份、Memory V3 只读浏览、服务网页内嵌和首次设置向导。

## 下载安装包

- **最新 Release**：https://github.com/taoshur/dafiyu-qq-desktop/releases/latest
- **v0.6.0 直接下载**：
  https://github.com/taoshur/dafiyu-qq-desktop/releases/download/v0.6.0/Dafiyu-Control-Center-Setup.exe
- 大小：123,882,463 字节
- SHA256：
  ```text
  B96FCF9D61A4446EF4C8FE2C43E4ABE4ED0410EEDEADB1A413D71483A14538C0
  ```

> 安装包未签名，Windows SmartScreen 可能提示；首次运行需要本机已安装并配置 SnowLuma、qq-bridge、DSH。

## 功能

- **总览**：三件套端口/进程状态、QQ 链路、Memory V3 计数、数据库完整性、模型、运行时长
- **服务管理**：按 SnowLuma → DSH → qq-bridge 顺序启动；只停止本软件启动且身份校验通过的进程
- **启动与恢复**：登录自启、机器人自启、异常自动恢复三个互相独立的开关，默认关闭
- **恢复引擎**：崩溃识别、退避、租约、BusyGuard、整树停止、watchdog 协调
- **运行日志**：只读 tail，不删除、不截断原文件
- **环境检查**：Node、目录、配置、依赖、state 可写性
- **长期记忆**：内置 qq-bridge 包含 Memory V3；新用户从空 SQLite 库开始，默认观察模式、按需检索；桌面只读生产库，练习副本可审核
- **B站活动**：只读本机观看台账，显示大肥鱼最近看了哪些视频/字幕；侧边栏未读提示；提供 B 站 MCP 接入指引
- **更新检查**：从 GitHub Releases 检查新版本，SHA256 校验后打开安装包，不静默升级
- **数据备份**：SQLite `VACUUM INTO` 一致性快照 + manifest/SHA256 校验 + 恢复演练
- **服务网页**：内嵌 SnowLuma WebUI（5099）和 qq-bridge 控制台（3100）
- **首次设置**：分步向导弹窗；SnowLuma 密码只作为一次 bootstrap 环境变量传入
- **称呼设置**：首次向导询问“大肥鱼对您的称呼”，可在配置页修改；默认“爸爸”，只用于界面问候
- **环境安装**：检测 SnowLuma / qq-bridge / DSH、系统依赖和官方来源；qq-bridge 源码随安装包内置，SnowLuma 从官方来源自动下载（需先确认 LICENSE/EULA），DSH 提供手动安装指引
- **新手提示词**：首次设置/环境页可复制一段交给 DeepSeek 的部署提示词，限定官方来源、许可边界和凭据安全
- **安全基线**：`contextIsolation`、sandbox、固定 IPC 白名单、无 Node 渲染进程、令牌不进入 URL/页面

## 安全边界

- 只操作**由本软件启动**的进程；外部实例只检测，不误杀
- 真实服务控制默认关闭，必须在服务页显式开启
- 生产 Memory 库只读；候选审核只写隔离测试库
- qq-bridge 控制台令牌只由主进程从 `state/console-token` 注入，不进入 URL、不写日志
- 不包含任何 API Key、QQ 登录态、聊天记录或生产配置

## SnowLuma 署名与授权

SnowLuma 由 **SnowLumaDevs** 开发，官方项目：

- https://github.com/SnowLuma/SnowLuma
- License：https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA：https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md

本项目已获得 SnowLumaDevs 的书面授权，允许在以下范围内使用：

- 以非商业方式公开发布；
- 允许用户主动启动、停止其**自行安装或由本项目安装的官方未修改完整发行版** SnowLuma；
- 允许内嵌访问本机 SnowLuma WebUI；
- **2026-10-29 补充授权**：在非商业用途下，经用户主动确认并接受 LICENSE、EULA 后，可从 SnowLuma 官方发布渠道自动下载未修改的完整发行版，并完成本地安装及基础配置。

该授权**不包括**修改 SnowLuma 代码或原生组件、自建镜像、打包再分发或商业使用。
安装/下载时必须保留 SnowLumaDevs 署名、官方链接及完整 LICENSE、EULA。
超出上述范围需要另行申请书面授权。SnowLuma 仍适用其自身 LICENSE/EULA，不受本项目的许可覆盖。

## 环境要求

- Windows 11 x64
- Node.js 22+（开发与 CI 使用 Node 24）
- 已安装并可运行：
  - [qq-bridge](https://github.com/Derpyu520/qq-bridge)（本地项目，路径可配置）
  - SnowLuma 2.x（本地安装，路径可配置）
  - DeepSeek Harness（可选，用于智能体宿主）
- 外部依赖的许可证需单独确认；本仓库不打包它们

## 快速开始

```powershell
git clone https://github.com/taoshur/dafiyu-qq-desktop.git
cd dafiyu-qq-desktop
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

环境安装能力与限制：[docs/ENVIRONMENT-INSTALL.md](docs/ENVIRONMENT-INSTALL.md)
B站活动与接入：[docs/BILIBILI.md](docs/BILIBILI.md)
更新检查：[docs/UPDATE.md](docs/UPDATE.md)

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

### 注意

某些环境会设置 `ELECTRON_RUN_AS_NODE=1`。直接运行 Electron 会退化成 Node 并报 `bad option`；请使用 `npm start`，或先清除该环境变量。

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

## 架构与优势

### 分层

```text
┌──────────────────────────────────────────────────────────┐
│ Renderer（无 Node 权限）                                  │
│ 总览 / 服务 / 日志 / 环境安装 / Memory / 备份 / 配置      │
└───────────────▲──────────────────────────────────────────┘
                │ 固定 IPC 白名单 + contextBridge
┌───────────────┴──────────────────────────────────────────┐
│ Main（唯一可信层）                                        │
│ supervisor · control · health · recovery · backup         │
│ environment · installer · memory · logs · embed          │
└───────┬───────────────────────┬──────────────────────────┘
        │ 固定 exe/参数          │ 只读/隔离 SQLite
┌───────▼────────┐      ┌───────▼──────────────────────────┐
│ SnowLuma       │      │ qq-bridge / DSH                  │
│ 3000/3001/5099 │      │ 3100/3080 · Memory V3 · DSH API  │
└────────────────┘      └──────────────────────────────────┘
```

### 核心优势

1. **控制面与运行面分离**
   - 桌面只负责“看、管、恢复”，不重写机器人核心。
   - qq-bridge、SnowLuma、DSH 可以独立升级、替换或由用户手动启动。

2. **最小权限**
   - Renderer 没有 Node、没有 shell、没有任意文件访问。
   - preload 只暴露固定方法；主进程校验参数/路径/服务 ID。
   - 内嵌服务页使用独立 `WebContentsView` 和独立分区，只允许回环地址。

3. **进程所有权，而不是按名字杀进程**
   - 启动时记录 PID、启动时间、可执行文件、完整命令行、父进程和子进程。
   - 停止前做整树归属校验，避免误杀同名/外部进程。
   - 外部启动的实例只检测，不接管、不终止。

4. **故障隔离**
   - 服务状态、恢复状态、安装状态、Memory 状态分别建模。
   - 安装失败不会影响服务控制；服务崩溃恢复不会修改安装任务。
   - BusyGuard、恢复租约、watchdog 协调和退避避免“多个恢复者互相打架”。

5. **Windows 用户级部署**
   - 默认安装到用户目录，避免不必要管理员权限。
   - 所有持久配置使用原子写入；日志脱敏，不记录 token/password。
   - 卸载默认保留用户数据，避免误删记忆。

6. **可测试性**
   - 假服务 fixtures + `node --test`，核心逻辑不依赖真实 QQ/DSH。
   - 安装器使用固定版本、固定 SHA256、固定解压工具，不拼接用户输入命令。

### Memory V3 架构

Memory 的核心在 qq-bridge/DSH 侧，桌面的定位是**可观测、可审核、可备份，而不是绕过生产写入**。

```text
QQ 消息
  → qq-bridge 接收
  → messages 表（去重/游标）
  → extraction worker 批量
  → 模型抽取候选
  → memory_candidates（pending）
  → 审核/批准
  → facts / events
  → retrieve / inject 到 DSH 上下文
```

优势：

- **批量 + 游标**：避免每条消息单独调用模型，控制成本；游标保证中断后可继续。
- **候选层**：模型输出先进入 `memory_candidates`，不直接污染长期事实；`facts/events` 只接收审核后的内容。
- **证据与质量**：候选带来源会话、批次、证据、质量/置信度、时间精度和作用域，方便回溯。
- **去重与幂等**：`dedupe_key`、`batch_key`、消息唯一键避免重复抽取和重复候选。
- **观察模式**：生产库 `observeOnly=true` 时只读；候选审核只在隔离测试库演练。
- **只读桌面**：桌面用 SQLite `query_only` 打开生产 `memory.db`，不写、不迁移、不清理 WAL。
- **测试库隔离**：`%APPDATA%\dafiyu-desktop\state\memory-test.db` 可安全演练 apply/reject，不与生产库混用。
- **备份一致性**：`VACUUM INTO` 生成包含已提交 WAL 数据的一致性快照，并校验 manifest/SHA256/表计数。

桌面的 Memory 页面提供：

- facts / events / pending candidates 浏览与搜索
- 候选证据、置信度、时间精度、作用域、质量
- 隔离测试库审核
- 生产库只读告警和完整性检查

### 环境安装架构

- 检测层 `environment.js` 只读检查 OS/架构/Node/路径/配置/端口/官方源
- 安装层 `install-task.js` 使用显式状态机
- 计划层 `install-catalog.js` 固定官方来源、版本、SHA256、安装能力
- 安装状态与服务运行状态分离；安装完成不会自动启动服务
- SnowLuma 和 qq-bridge 可自动下载官方来源（SnowLuma 必须先确认 LICENSE/EULA）；DSH 缺少可验证静默安装方式，明确标为手动安装

```text
IDLE → CHECKING → DOWNLOADING → INSTALLING → CONFIGURING → VERIFYING → COMPLETED
                                  ↘ FAILED / CANCELLING → CANCELLED
```

### 为什么不是“把三个服务塞进一个进程”

- 三件套的许可证、升级节奏和故障模式不同
- SnowLuma 需要独立 WebUI/OneBot 生命周期
- DSH 是独立智能体宿主，可能承载用户其他任务
- qq-bridge 有 supervisor/watchdog 体系

因此桌面采用“控制台 + 外部服务”的边界，而不是把三个组件改造成一个不可替换的 monolith。这样升级和排障都更可控，也避免桌面崩溃时机器人一起死。

## 数据位置

- 桌面配置/日志/测试库：`%APPDATA%\dafiyu-desktop`
- 生产记忆：`<qq-bridge>/state/memory.db`
- 备份：`<qq-bridge>/backups/desktop-*`（以实际配置为准）

这些目录中的用户数据**不进入仓库**。

## License

本项目自己的代码以 [PolyForm Noncommercial License 1.0.0](LICENSE) 发布：

- **仅允许非商业用途**
- 允许个人学习、研究、非商业自托管和修改
- 不允许商业使用、收费托管/部署或把本项目并入商业产品
- 这不是 OSI 定义的开源许可证，而是 source-available / noncommercial

上游 qq-bridge 的 MIT 许可声明保留在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；
第三方依赖、角色素材和 SnowLuma 各自的许可证不在此授权范围内。

如果你需要商业授权，需要单独联系项目维护者。

