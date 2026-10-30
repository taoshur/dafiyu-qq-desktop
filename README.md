# 大肥鱼桌面控制中心

Windows 11 上的 QQ 机器人桌面控制台，用于管理 **SnowLuma + qq-bridge + DeepSeek Harness（DSH）** 三件套。

> 本项目是基于 [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge) 的二次创作，不是 qq-bridge 官方项目。
> 上游代码与文档以 MIT 许可发布；本仓库保留其版权与许可声明，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

> 这不是机器人本体，也不包含 SnowLuma、DSH 的安装包或账号；qq-bridge 以 MIT 源码形式内置在安装包中。
> 它只是一个独立的外壳：状态检测、受控启停、日志、备份、Memory V3 + V4 只读浏览、服务网页内嵌和首次设置向导。

## 下载安装包

- **最新 Release**：https://github.com/taoshur/dafiyu-qq-desktop/releases/latest
- **v0.8.2 直接下载**：
  https://github.com/taoshur/dafiyu-qq-desktop/releases/download/v0.8.2/Dafiyu-Control-Center-Setup.exe
- 大小：123,430,602 字节
- SHA256：
  ```text
  39DD62FD485C5FC86ECFF506FDD3FA11FB5AB6906AD5FDB152ED4B9185795C67
  ```

> 安装包未签名，Windows SmartScreen 可能提示；首次运行需要本机已安装并配置 DSH。

## 最近更新

- **0.8.2**：审查修复批次 1–5（安全、恢复、Memory、工程）
- **0.8.1**：修复页面拆分导致的 `PAGE_META` 缺失，恢复总览加载
- **0.8.0**：工作台架构重构（IPC/页面/任务/数据迁移）；数据自动迁移且保留备份
- **0.7.1**：B站活动记录搜索/热榜/排行/评论等全部动作，统计区分“动作数”和“BV 去重视频数”
- **0.7.0**：Memory V4 多信号召回 + 可逆遗忘（Active/Dormant/Archived，不物理删除）
- **0.6.0**：安装包内置带 Memory V3 的 qq-bridge 源码
- **0.5.1**：安装失败可复制排查提示词；管理器版本升级

## 功能

- **总览**：三件套端口/进程状态、QQ 链路、Memory V3/V4 计数、数据库完整性、模型、运行时长
- **服务管理**：按 SnowLuma → DSH → qq-bridge 顺序启动；只停止本软件启动且身份校验通过的进程
- **启动与恢复**：登录自启、机器人自启、异常自动恢复三个互相独立的开关，默认关闭
- **恢复引擎**：崩溃识别、退避、租约、BusyGuard、整树停止、watchdog 协调
- **运行日志**：只读 tail，不删除、不截断原文件
- **环境检查**：Node、目录、配置、依赖、state 可写性
- **长期记忆**：内置 qq-bridge 包含 Memory V3 + V4 召回/生命周期；新用户从空 SQLite 库开始，默认观察模式、按需检索、可逆归档而非物理删除
- **B站活动**：记录搜索、热榜、排行、视频详情、字幕、评论等动作；区分“累计动作”和“按 BV 去重的视频数”；侧边栏未读提示
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

## 功能详解

### 桌面端页面

| 页面 | 能做什么 | 边界 |
|---|---|---|
| 总览 | 三件套在线状态、端口、PID、QQ 链路、Memory 计数、数据库完整性、模型、运行时长 | 只展示，不自动修改服务 |
| 服务 | 按 SnowLuma → DSH → qq-bridge 顺序启动；停止/重启；查看归属和恢复策略 | 真实控制默认关闭；只停止本软件启动且身份校验通过的实例 |
| 服务网页 | 内嵌 SnowLuma WebUI（5099）和 qq-bridge 控制台（3100） | 只允许回环地址；独立 `WebContentsView` |
| 首次设置 | 分步向导、称呼设置、SnowLuma WebUI 密码 bootstrap、部署提示词 | 密码只作为一次环境变量传入，不落盘 |
| 环境安装 | 检测 SnowLuma / qq-bridge / DSH、依赖、路径、端口、官方来源；按目录安装 | qq-bridge 内置源码；SnowLuma 需接受 LICENSE/EULA 后从官方下载；DSH 手动安装 |
| 启动与恢复 | 登录自启、机器人自启、异常自动恢复三个独立开关；恢复历史与所有权 | 默认全关；外部实例不接管 |
| 运行日志 | 只读 tail、来源切换、跟随刷新、复制排查信息 | 不删除、不截断原日志；展示时脱敏 |
| 环境检查 | Node/目录/配置/依赖/state 可写性/端口预检 | 只读检查，不自动修复 |
| 配置 | 路径、称呼、控制开关、恢复开关；只显示非机密字段 | 令牌、Cookie、API Key 不返回界面 |
| 长期记忆 | facts/events/candidates 浏览搜索；证据、置信度、时间精度、质量；隔离测试库审核 | 生产库只读；审核只写测试库 |
| B站活动 | 搜索/热榜/排行/视频/字幕/评论/弹幕等动作；未读提示；按 BV 去重 | 只读本地 JSONL 台账，不上传 |
| 数据备份 | SQLite `VACUUM INTO` 快照、manifest/SHA256、恢复演练、保留策略 | 只删除本软件创建的 `desktop-*` 备份 |
| 关于 | 版本、架构、许可、数据路径、更新入口 | 不包含账号凭据 |

### qq-bridge / DSH 侧能力

- **快速通道**：短纯文字优先直连 DeepSeek API；复杂/媒体/工具请求回退 DSH Agent
- **表情包**：自动补表情、表情库同步、收藏、备注、按场景发送
- **Memory V3/V4**：消息入库、批量抽取、候选审核、多信号召回、可逆归档
- **B站活动**：搜索、热榜、排行、视频详情、字幕、评论、弹幕、UP 主、收藏等
- **QQ 空间**：看动态、点赞、评论、回复、发说说、改签名
- **语音/唱歌**：语音库、TTS、RVC 翻唱（默认关闭，需要本机模型/音频）
- **Android 模拟器**：截图、UI 树、点击、滑动、输入、启动/关闭 App、受控 adb
- **联网搜索**：只读 `web_search` / `web_fetch`
- **游戏/画图**：通过可选 MCP 工具完成，是否启用取决于配置

### 数据安全

- 桌面配置自动迁移，迁移前备份，保留未知字段
- Memory V4 迁移前自动 `VACUUM INTO` 备份；备份失败停止迁移
- 只增量加列，不删除 facts/events/messages
- 候选 apply 使用事务，状态更新失败会回滚正式写入
- 升级不覆盖已有 qq-bridge / SnowLuma / DSH 目录
- 日志、IPC 错误和结构化日志做递归脱敏

详见：[docs/DATA-MIGRATION.md](docs/DATA-MIGRATION.md)

## MCP 工具清单

> 工具由内置 qq-bridge 的 MCP server 提供，实际启用状态由 `config.json` 的 `socialV2.tools`、表情、语音、RVC 等开关决定。
> 运行时以 `qq_get_prompt` 返回的 `enabledTools` 为准；下面列的是代码中已存在的工具，不表示每个安装都默认全部开启。

实现位置：

- QQ/宿主工具：`src/mcp-snowluma-safe.js`
- Android：`src/mcp-android.js`
- 搜索：`src/mcp-web-search-safe.js`
- B站：`tools/bilibili-mcp/mcp_server.py`

### QQ 会话读取

`qq_status`、`qq_list_groups`、`qq_get_group_members`、`qq_get_group_history`、`qq_get_prompt`、`qq_get_unread_messages`、`qq_get_recent_messages`、`qq_get_my_recent_messages`、`qq_get_message_detail`、`qq_get_active_members`、`qq_social_state`、`qq_get_forward_msg`、`qq_get_message_images`

### QQ 发送与互动

`qq_send_group_message`、`qq_send_private_message`、`qq_reply`、`qq_send_burst`、`qq_send_message`、`qq_send_poke`、`qq_send_image`、`qq_send_image_data`、`qq_set_poke_style`

### 唤醒与已读

`qq_mark_read`、`qq_set_wake_config`、`qq_wait_for_messages`

### 记忆与黑话

`qq_memory_append`、`qq_memory_query`、`qq_memory_remove`、`qq_memory_clear`、`qq_slang_query`、`qq_slang_submit`

### 表情包

`qq_list_stickers`、`qq_get_sticker_image`、`qq_send_sticker`、`qq_collect_sticker`、`qq_sticker_note`、`qq_set_sticker_remark`

### 语音与唱歌

`qq_list_voices`、`qq_send_voice`、`qq_say`、`qq_sing`

默认关闭，需要本机语音库/模型；`qq_send_voice` 默认只允许语音库目录，不能读任意本地路径。

### QQ 空间与好友

`qq_qzone_feeds`、`qq_qzone_detail`、`qq_qzone_like`、`qq_qzone_comment`、`qq_qzone_reply`、`qq_qzone_images`、`qq_post_qzone`、`qq_set_signature`、`qq_handle_friend_request`、`qq_approve_friend_request`、`qq_whitelist_add`

### 画图与宿主

`qq_draw`、`qq_get_self_image`、`snowluma_status`

### Android 模拟器

`android_status`、`android_screenshot`、`android_ui`、`android_tap`、`android_swipe`、`android_key`、`android_batch`、`android_text`、`android_launch`、`android_close`、`android_packages`、`android_adb`、`android_listen`、`android_capture_share`

### 联网搜索

`web_search`、`web_fetch`

### B站 MCP（可选）

需要本机 `tools/bili-venv`、B站凭证和 MCP 配置。

只读：

`bili_check_credential`、`bili_search`、`bili_comments`、`bili_subtitle`、`bili_danmaku`、`bili_video_info`、`bili_crawl`、`bili_hot_videos`、`bili_hot_buzzwords`、`bili_weekly_hot`、`bili_rank`、`bili_user_info`、`bili_user_videos`、`bili_favorite_lists`、`bili_favorite_content`、`bili_unread_messages`、`bili_received_replies`、`bili_received_at_and_likes`

登录/写入/发布：

`bili_login`、`bili_login_check`、`bili_reply`、`bili_send_dynamic`、`bili_upload_video`、`bili_upload_video_multi`、`bili_send_opus`、`bili_send_message`

> B站写操作需要用户自己的登录凭证；本项目不会内置或上传 Cookie。工具是否出现在 DSH 中取决于本机 MCP 配置。

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
- Node.js 22+（开发与 CI 使用 Node 24；内置 qq-bridge 首次初始化也需要 Node/npm）
- 已安装并可运行：
  - SnowLuma 2.x（本地安装，路径可配置）
  - DeepSeek Harness（可选，用于智能体宿主）
- qq-bridge：安装包已内置源码，不需要另外 clone；首次初始化会执行 `npm install`
- SnowLuma/DSH 和 npm 依赖的许可证需单独确认；本仓库不打包它们的二进制

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
Memory V4 召回与生命周期：[docs/MEMORY-V4.md](docs/MEMORY-V4.md)
数据迁移与兼容性：[docs/DATA-MIGRATION.md](docs/DATA-MIGRATION.md)

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
│ 3000/3001/5099 │      │ 3100/3080 · Memory V3/V4 · DSH API │
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

### Memory V3 + V4 架构

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
  → V4 多信号召回
  → 按 token 预算注入 DSH 上下文
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

#### V4 召回

- 最近 3 条非 bot 消息 + 当前话题构造查询，不再只看最后一句
- 人物、时间范围、事件参与者、关键词多路候选
- 相关性 40% / 可信度 25% / 重要性 15% / 时间 10% / 活跃度 10% 重排
- 时间类问题优先保留时间范围内的事件
- 事实/事件去重，单人最多 3 条
- 真实 token 预算，默认 600
- `memory_recall_diagnostics` 记录候选数、选中 ID、token、时间过滤，不保存聊天原文

#### V4 可逆遗忘

- `facts/events` 增加 `importance`、`activation`、`last_recalled_at`、`reinforcement_count`、`lifecycle_state`
- 可信度、重要性、活跃度互相独立
- `Active ⇄ Dormant ⇄ Archived`；归档不删除、不改变 `status`
- 高重要性（默认 >= 0.8）不会被归档
- 只有实际注入的记忆才轻微提升活跃度；召回不增加 `reinforcement_count`
- 归档记忆仍可被深度检索；事实有效性仍由 `status` 单独决定

详细说明：[docs/MEMORY-V4.md](docs/MEMORY-V4.md)

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
- qq-bridge 源码随安装包内置（含 Memory V3/V4）；SnowLuma 从官方 Releases 自动下载（必须先确认 LICENSE/EULA）；DSH 缺少可验证静默安装方式，明确标为手动安装

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
- B站活动台账：`<qq-bridge>/state/bili-watch.jsonl`
- 备份：`<qq-bridge>/backups/desktop-*`（以实际配置为准）
- 更新缓存：`%APPDATA%\dafiyu-desktop\cache\updates`

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

