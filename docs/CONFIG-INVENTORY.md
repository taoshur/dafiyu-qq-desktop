# 大肥鱼桌面端配置文件清单（Agent 修改指南）

> 本文档面向“让其他 Agent 帮用户修改配置”的场景。  
> 路径中的 `<用户>` 需要替换为实际 Windows 用户名。  
> 不要复制、打印或提交任何 token、key、cookie、密码、ownerQQ 明文。

---

## 0. 修改前必须遵守的规则

### 允许修改

```text
管理器 config.json
qqbridge config.json
qqbridge roles/*.md
qqbridge 角色预设 / 工具预设（确认不是上游自动生成文件）
```

### 只能通过界面修改

```text
SnowLuma WebUI 设置
DSH 的模型、凭据、插件配置
```

### 永远不要直接修改

```text
state/*.db
state/*.db-wal
state/*.db-shm
logs/*
*.credentials.yaml
SnowLuma/config/webui.json 的 passwordHash/passwordSalt
QQ / SnowLuma 的登录凭据、cookie、accessToken
```

### 任何修改前

```text
1. 备份 config.json
2. 备份 roles/
3. 备份 state/（只备份，不编辑）
4. 确认目标服务已停止，或修改后明确重启
5. 修改后做 JSON 解析检查和端口健康检查
```

### 绝对禁止

```text
把配置里的 token/key 放进聊天、日志、Issue、截图
把生产配置发给第三方模型
把用户 A 的记忆/角色/配置复制给用户 B
```

---

# 1. 组件与路径总览

| 组件 | 默认路径 | 说明 |
|---|---|---|
| 管理器数据 | `%APPDATA%\dafiyu-desktop` | 管理器自己的设置、日志、状态 |
| 管理器配置 | `%APPDATA%\dafiyu-desktop\config\config.json` | 路径、主题、控制开关 |
| 管理器日志 | `%APPDATA%\dafiyu-desktop\logs\app.log` | 排障用，不要编辑 |
| 管理器状态 | `%APPDATA%\dafiyu-desktop\state` | 任务、控制记录，不要编辑 |
| qqbridge | `C:\Users\<用户>\qq-bridge` | 机器人桥接主目录 |
| qqbridge 配置 | `<QQ_BRIDGE>\config.json` | 主要用户配置 |
| qqbridge 示例 | `<QQ_BRIDGE>\config.example.json` | 字段结构参考，不含用户密钥 |
| qqbridge 角色 | `<QQ_BRIDGE>\roles\*.md` | 角色卡 |
| qqbridge 状态 | `<QQ_BRIDGE>\state` | 数据库、日志、token，不要编辑 |
| SnowLuma | `C:\SnowLuma` | QQ 运行时；安装包首次运行自动部署，已存在则保留 |
| SnowLuma 配置 | `C:\SnowLuma\config\*.json` | WebUI、OneBot、外观 |
| SnowLuma 数据 | `C:\SnowLuma\data` | 消息/身份数据库，不要手工编辑 |
| SnowLuma 日志 | `C:\SnowLuma\logs` | 排障用 |
| DSH 配置 | `%USERPROFILE%\.dsh\profiles\desktop` | 不建议手工改 |
| DSH 凭据 | `%USERPROFILE%\.dsh\.credentials.yaml` | 绝对不能读给外部 |

推荐用变量表示：

```text
QQ_BRIDGE = C:\Users\<用户>\qq-bridge
SNOWLUMA  = C:\SnowLuma
MANAGER   = %APPDATA%\dafiyu-desktop
DSH_PROFILE = %USERPROFILE%\.dsh\profiles\desktop
```

### 1.1 安装包内置 SnowLuma 运行包

安装包带有：

```text
<安装目录>\resources\SnowLuma
```

管理器首次启动时，如果 `snowlumaRoot` 不存在运行文件，会把内置运行包复制到：

```text
C:\Users\<用户>\SnowLuma
```

规则：

- 只复制运行文件：`index.mjs`、`client/`、`native/`、`node.exe`、EULA/PRIVACY 等
- 不复制 `config/`、`data/`、`logs/`
- 目标已存在时跳过，不覆盖用户 QQ 登录态和配置
- 上游仓库已闭源，管理器不再提供 SnowLuma 在线组件更新
- SnowLuma 需要升级时，停止服务后手动替换运行目录，保留 `config/` 和 `data/`
- 源码构建安装包前，需要把官方 SnowLuma Windows 运行包放到 `vendor/SnowLuma`；该目录不提交到 Git

对应代码：

```text
src/main/bundled-snowluma.js
package.json -> build.extraResources vendor/SnowLuma
```

---

# 2. 管理器配置

文件：

```text
%APPDATA%\dafiyu-desktop\config\config.json
```

这是管理器自己的配置，不包含 QQ token。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `schemaVersion` | number | 是 | 当前为 `1`，不要随意改 |
| `repoRoot` | string | 是 | qqbridge 绝对路径 |
| `snowlumaRoot` | string | 是 | SnowLuma 绝对路径 |
| `dshExe` | string | 是 | DSH 可执行文件绝对路径 |
| `ownerTitle` | string | 否 | 管理器显示的用户称呼 |
| `theme` | string | 否 | `dark` / `light` / `auto` |
| `controlEnabled` | boolean | 是 | 是否允许真实启动/停止服务 |
| `managerAutostart` | boolean | 否 | 管理器是否登录自启 |
| `botAutostart` | boolean | 否 | 管理器启动时是否拉起 SnowLuma/qqbridge |
| `autoRecovery` | boolean | 否 | 异常自动恢复开关 |

### 修改注意

- `repoRoot`、`snowlumaRoot`、`dshExe` 必须是绝对路径。
- 路径必须存在；目录字段不能指向文件，`dshExe` 必须指向可执行文件。
- `controlEnabled` 为 `false` 时，管理器只检测，不真实启动/停止。
- 不要根据用户口述的“用户名”猜路径；从管理器配置或实际目录读取。
- 不要把 `dshExe` 改成旧安装残留路径。

### 最小安全示例（脱敏）

```json
{
  "schemaVersion": 1,
  "repoRoot": "C:\\Users\\<用户>\\qq-bridge",
  "snowlumaRoot": "C:\\SnowLuma",
  "dshExe": "C:\\Users\\<用户>\\AppData\\Local\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe",
  "ownerTitle": "爸爸",
  "theme": "auto",
  "controlEnabled": true,
  "managerAutostart": false,
  "botAutostart": false,
  "autoRecovery": false
}
```

---

# 3. qqbridge 配置

文件：

```text
<QQ_BRIDGE>\config.json
```

参考：

```text
<QQ_BRIDGE>\config.example.json
```

## 3.1 顶层字段

| 字段 | 类型 | 说明 | 敏感 |
|---|---|---|---|
| `dsh` | object | DSH 端点、模型、鉴权 | 是 |
| `role` | object | 角色卡注入长度限制 | 否 |
| `snowluma` | object | SnowLuma 地址和 token | 是 |
| `ownerQQ` | number | 主人 QQ 号 | 是 |
| `sessionCwd` | string | DSH 工作目录；空为默认 | 否 |
| `agentPreset` | string | 默认预设，如 `qq-chat` | 否 |
| `workspaceTitle` | string | DSH 工作区标题 | 否 |
| `allow` | object | 私聊/群白名单 | 是 |
| `deny` | object | 私聊/群黑名单 | 是 |
| `allowAllWhenEmpty` | boolean | 白名单为空时是否放行；建议 `false` | 是 |
| `ackMessage` | string | 收到消息的自动确认，可为空 | 否 |
| `sendDelayMs` | number | 发送间隔基础值 | 否 |
| `questionTimeoutMs` | number | 提问等待超时 | 否 |
| `consolePort` | number | 本地控制台端口，默认 `3100` | 否 |
| `consoleToken` | string | 本地控制台 token | 是 |
| `pricing` | object | 模型价格表 | 否 |
| `security` | object | 安全拦截提示 | 否 |
| `slang` | object | 黑话学习 | 否 |
| `social` | object | 一代社交参数（旧） | 否 |
| `socialV2` | object | 二代仿真主配置 | 部分 |
| `webSearch` | object | 搜索服务配置 | 是 |

## 3.2 `dsh`

| 字段 | 说明 |
|---|---|
| `baseUrl` | DSH 本地地址，例如 `http://127.0.0.1:<port>` |
| `provider` | 模型提供方 |
| `model` | 默认模型 |
| `reasoningEffort` | 推理强度 |
| `authToken` | DSH 鉴权 token；敏感 |
| `authHeader` | 鉴权头名称 |
| `authPrefix` | 鉴权前缀，如 `Bearer` |
| `allowRemote` | 是否允许远程；默认 `false` |

注意：

- DSH 桌面版端口可能每次变化。
- 不要硬编码一个不存在的端口；优先让桥接的端点发现逻辑处理。
- 不要把 `authToken` 输出给用户或第三方 Agent。

## 3.3 `snowluma`

| 字段 | 说明 |
|---|---|
| `wsUrl` | OneBot WebSocket，通常 `ws://127.0.0.1:3001` |
| `httpUrl` | OneBot HTTP，通常 `http://127.0.0.1:3000` |
| `accessToken` | SnowLuma 访问 token；敏感 |
| `followDiscoveredEndpoint` | 是否跟随自动发现端点 |
| `silenceWarnMs` | 静默告警阈值 |
| `launcherPath` | SnowLuma 启动器路径 |
| `homeDir` | SnowLuma 根目录 |

## 3.4 白名单与主人

```json
{
  "ownerQQ": 123456789,
  "allow": {
    "private": [123456789],
    "groups": [123456789]
  },
  "deny": {
    "private": [],
    "groups": []
  },
  "allowAllWhenEmpty": false
}
```

规则：

- `ownerQQ` 必须是数字，不建议用字符串。
- `allow.private` / `allow.groups` 是数字数组。
- 修改白名单会改变谁可以让机器人响应，必须先确认用户意图。
- 不要把陌生人 QQ 自动加入白名单。
- `deny` 优先级高于 `allow`。

## 3.5 `socialV2` 主配置

### 基础

| 字段 | 说明 |
|---|---|
| `enabled` | 是否启用二代仿真 |
| `autoReplyCheckMs` | 自动回复检查间隔 |
| `agentPreset` | 使用哪个 DSH 预设，默认 `qq-chat-v2` |
| `provideRecommendations` | 是否向模型提供推荐值 |
| `initialPromptMaxChars` | 初始提示词长度上限 |

### `socialV2.tools`

工具开关，全部为布尔值。  
大致包括：

```text
getPrompt
getUnread
getRecent
socialState
sendGroup
sendPrivate
reply
sendBurst
sendMessage
waitMessages
feedback
getMyRecent
getMessageDetail
getActiveMembers
setWakeConfig
markRead
memory
slangQuery
slangSubmit
getImages
getForwardMsg
sendPoke
listStickers
getStickerImage
sendSticker
setStickerRemark
stickerNote
collectSticker
getSelfImage
sendVoice
setSignature
postQzone
getQzoneFeeds
likeQzone
commentQzone
getQzoneDetail
sendImage
friendRequest
whitelistAdd
approveFriend
qzoneImages
qzoneReply
pokeStyle
draw
sendImageData
```

修改建议：

- 关闭某个工具只影响该工具，不要为了关闭一个功能把整个 `tools` 删除。
- 安全相关工具（`friendRequest`、`whitelistAdd`、`approveFriend`、`postQzone`）默认应保持谨慎。
- 不要开启 `setStickerRemark` 除非用户明确知道它会改 QQ 收藏表情备注。

### `socialV2.wake`

| 字段 | 说明 |
|---|---|
| `defaultMode` | `diving` / `active` |
| `preSleepWaitEnabled` | 是否强制睡前观察 |
| `preSleepWaitMs` | 睡前观察时长 |
| `sleepMinMs` / `sleepMaxMs` | 有限潜水范围 |
| `recommended*` | 给模型的推荐值，不是强制值 |
| `batchWindowMs` | 多条消息合并窗口 |
| `maxWakePerMinute` / `maxWakePerHour` | 唤醒限速 |
| `noActionLimit` | 连续无动作上限 |
| `maxWakeConfigReminders` | 唤醒配置提醒次数 |

### `socialV2.send`

| 字段 | 说明 |
|---|---|
| `burstEnabled` | 是否允许分条 |
| `burstMaxMessages` | 单轮最多条数 |
| `burstIntervalMinMs` / `MaxMs` | 分条间隔 |
| `longGapProbability` | 长间隔概率 |
| `maxSendPerMinute` / `maxSendPerHour` | 发送限速 |
| `maxMessageChars` | 单条最大字数 |
| `maxGapMs` | 最大发送间隔 |
| `gapBaseMs` / `gapPerCharMs` | 节奏计算参数 |

### `socialV2.wait`

| 字段 | 说明 |
|---|---|
| `defaultMs` / `minMs` / `maxMs` | 等待范围 |
| `defaultQuietMs` | 默认静默窗口 |
| `minQuietAfterNewMs` | 新消息后的最小静默 |

### `socialV2.proactive`

| 字段 | 说明 |
|---|---|
| `enabled` | 是否允许主动找话题 |
| `checkIntervalMinMs` / `MaxMs` | 主动检查间隔 |
| `idleThresholdMs` | 会话安静多久后考虑 |
| `probability` | 触发概率 |

当前示例：

```json
{
  "enabled": true,
  "checkIntervalMinMs": 900000,
  "checkIntervalMaxMs": 1800000,
  "idleThresholdMs": 300000,
  "probability": 0.9
}
```

注意：

```text
proactive 只是给模型一个主动机会
不代表它每次一定发消息
```

### `socialV2.sticker`

| 字段 | 说明 |
|---|---|
| `enabled` | 是否启用表情包 |
| `syncTtlMs` | 表情库同步缓存时间 |
| `maxListCount` | 最大列表数量 |
| `includeInPrompt` | 是否把表情清单注入提示词 |
| `promptMaxStickers` | 注入数量 |
| `collect.*` | 偷图收藏的限速和备注长度 |

### `socialV2.voice`

| 字段 | 说明 |
|---|---|
| `enabled` | 是否启用语音 |
| `dir` | 语音库目录 |
| `maxSeconds` / `maxBytes` | 语音限制 |
| `maxPerMinute` / `maxPerHour` | 频率限制 |
| `allowAbsolutePath` | 是否允许绝对路径；默认 `false` |
| `ffmpegPath` | ffmpeg 路径 |
| `autoReadback` | 自动回读确认 |

### `socialV2.qzone`

| 字段 | 说明 |
|---|---|
| `enabled` | 是否启用空间 |
| `maxPerDay` | 每日发说说上限；0 表示不限 |
| `minIntervalMs` | 最小间隔 |
| `watch.enabled` | 是否轮询好友动态 |
| `watch.intervalMs` | 轮询间隔 |
| `watch.comments` | 是否轮询评论 |
| `watch.commentIntervalMs` | 评论轮询间隔 |

### `socialV2.memory`

| 字段 | 说明 |
|---|---|
| `engine` | 记忆引擎 |
| `dbPath` | 记忆数据库路径 |
| `retrieval` | 是否检索注入 |
| `extract` | 是否抽取 |
| `ingest` | 是否入库 |
| `observeOnly` | **只生成候选，不自动写正式记忆** |
| `batchSize` / `idleMinutes` | 抽取批次/空闲参数 |
| `intervalMs` | 抽取周期 |
| `model` | 抽取模型 |
| `injectBudgetTokens` | 注入预算 |
| `recallV4` / `lifecycleEnabled` | V4 检索与生命周期 |
| `decayTauDays` / `dormantThreshold` / `archiveThreshold` | 衰减参数 |
| `recallBoost` / `protectImportance` | 召回/保护参数 |
| `sweepHours` | 清理周期 |

修改记忆参数前必须：

```text
备份 state/memory.db
确认 observeOnly 的当前值
不要为了“更自动”直接把 observeOnly 改成 false
```

### `socialV2.growth`

| 字段 | 说明 |
|---|---|
| `enabled` | 是否启用成长 |
| `observeOnly` | 只观察 |
| `autoApplyExpression` | 自动应用表达 |
| `minEvidence` / `minDistinctDays` | 证据阈值 |
| `maxAutoDelta` | 单次最大变化 |
| `decayPerDay` | 每日衰减 |
| `dbPath` | 成长数据库 |

人格/成长基线不应由普通配置 Agent 擅自修改。

### `socialV2.fastPath`、`imageGen`、`tts`

这些可能包含 API Key 或 key 文件路径：

| 字段 | 敏感 |
|---|---|
| `fastPath.apiKey` | 是 |
| `imageGen.apiKey` | 是 |
| `tts.mimo.keyFile` | 是 |
| `tts.qwen.keyFile` | 是 |
| `voice.ffmpegPath` | 否 |

不要把 key 文件内容注入模型，只处理路径。

## 3.6 `social`（旧版）

仍保留兼容字段，主要包括：

```text
enabled
maxReplyChars
mustReplyKeywords
contextWindow
triggerProbability
activeCheckMinMs / activeCheckMaxMs
idleWindowMs
proactiveEnabled
proactiveIdleThresholdMs
proactiveCheckMinMs / MaxMs
proactiveProbability
activeReplyDelayMinMs / MaxMs
activeDurationEnabled / MinMs / MaxMs
skipProbability
idleRetryWaitMs
burstEnabled
burstIntervalMinMs / MaxMs
longGapProbability
longGapMinMs / MaxMs
```

新功能优先改 `socialV2`；不要同时把两套主动参数改成完全冲突的值。

## 3.7 `slang`

| 字段 | 说明 |
|---|---|
| `enabled` | 是否启用黑话 |
| `extractMinMessages` | 最少消息数才抽取 |
| `extractCooldownMs` | 抽取冷却 |
| `inferenceThresholds` | 推断阈值 |
| `injectMax` | 注入数量 |
| `learnerPreset` | 学习预设 |
| `autoResearch` | 是否自动搜索 |

## 3.8 `webSearch`

| 字段 | 敏感 |
|---|---|
| `provider` | 否 |
| `apiKey` | 是 |
| `apiKeyEnv` | 否 |
| `baseURL` | 否 |
| `model` | 否 |
| `maxUses` / `maxTokens` / `maxResults` / `timeoutMs` | 否 |

## 3.9 角色与预设

```text
<QQ_BRIDGE>\roles\*.md
<QQ_BRIDGE>\dsh\agent-presets\
<QQ_BRIDGE>\plugins\qq-agent-presets\
```

角色卡可以改，但：

- 不要改角色文件里的安全边界
- 不要把用户隐私写进角色
- 不要删除已有角色，先复制再改
- 角色卡过大时注意 `role.maxInjectChars`

---

# 4. SnowLuma 配置

## 4.1 `runtime.json`

```text
C:\SnowLuma\config\runtime.json
```

| 字段 | 说明 |
|---|---|
| `webuiPort` | SnowLuma WebUI 端口，常见 `5099` |
| `hookAutoLoad` | 是否自动加载 Hook |
| `webuiHost` | WebUI 绑定地址 |
| `webuiTls.enabled` | 是否启用 TLS |
| `trustProxy` | 反向代理信任 |
| `logMaxTotalMb` | 日志总大小 |
| `logRetainDays` | 日志保留天数 |
| `logPerUin` | 是否按 QQ 分日志 |

## 4.2 `onebot_<uin>.json`

```text
C:\SnowLuma\config\onebot_<QQ号>.json
```

| 字段 | 说明 |
|---|---|
| `mode` | OneBot 模式 |
| `networks.httpServers` | HTTP 服务端 |
| `networks.httpClients` | HTTP 客户端 |
| `networks.wsServers` | WebSocket 服务端，qqbridge 通常连接这里 |
| `networks.wsClients` | WebSocket 客户端 |
| `statusCommand` | 状态命令 |
| `historySync.enabled` | 历史同步 |
| `notifications.channelIds` | 通知通道 |

不要直接把 `networks` 里的 token 或其他鉴权字段发给模型。

## 4.3 `webui.json`

```text
C:\SnowLuma\config\webui.json
```

包含：

```text
passwordHash
passwordSalt
mustChangePassword
generatedAt
updatedAt
```

这些是密码哈希，不是普通配置。

规则：

```text
不要手改
不要输出
不要复制
需要改密码时用 SnowLuma WebUI
```

## 4.4 `ui.json`

外观配置，通常通过 WebUI 修改：

```text
appearance.mode
appearance.accentPreset
appearance.density
appearance.uiScale
appearance.customCss
layout.*
pages.*
```

可以改外观，但不要删除 `pages` / `layout` 的完整结构。

## 4.5 其他

```text
consent.json       协议确认记录，只读
notifications.json 通知设置
release.json       版本元数据，只读
package.json       运行时元数据，只读
data/              消息和身份数据库，不要手工编辑
```

---

# 5. DSH 配置

路径：

```text
%USERPROFILE%\.dsh\profiles\desktop\cordis.yml
%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
%USERPROFILE%\.dsh\profiles\desktop\compatibility.json
%USERPROFILE%\.dsh\.credentials.yaml
```

说明：

| 文件 | 用途 | 建议 |
|---|---|---|
| `cordis.yml` | DSH 主配置 | 通过 DSH 界面修改 |
| `cordis.patch.yml` | 补丁覆盖 | 只由 DSH/插件管理 |
| `compatibility.json` | 兼容信息 | 只读 |
| `.credentials.yaml` | 模型凭据 | 绝对不要读给外部 |

qqbridge 连接 DSH 使用的是：

```text
dsh.baseUrl
dsh.authToken
```

DSH 桌面版可能使用随机端口，必须使用实际发现到的端口，不要假设固定 `1679` / `3080`。

---

# 6. Agent 修改协议

把下面这段直接交给其他 Agent：

```text
你只能修改用户明确指定的配置文件。
修改前必须：
1. 读取当前文件和 config.example.json
2. 只改必要字段，保留未知字段
3. 备份原文件，扩展名 .bak-<时间>
4. 检查 JSON 是否合法
5. 不改 state/、logs/、*.db、*.credentials.yaml
6. 不输出 token、apiKey、ownerQQ、cookie、passwordHash
7. 修改后停止对应服务，再启动
8. 检查 3000 / 3001 / 3100 和日志
9. 失败立即恢复备份
```

## 推荐检查命令

### JSON 合法性

```powershell
python -c "import json;json.load(open(r'<文件>',encoding='utf-8'));print('ok')"
```

### 备份

```powershell
Copy-Item '<文件>' '<文件>.bak-<时间>'
```

### 服务健康

```powershell
Test-NetConnection 127.0.0.1 -Port 3000
Test-NetConnection 127.0.0.1 -Port 3001
Test-NetConnection 127.0.0.1 -Port 3100
```

---

# 7. 最小可用配置清单

如果用户要“从零配置大肥鱼”，至少需要：

```text
1. 管理器：repoRoot / snowlumaRoot / dshExe / controlEnabled
2. qqbridge：dsh.baseUrl / dsh.authToken / snowluma.* / ownerQQ / allow
3. SnowLuma：QQ 登录完成，OneBot HTTP 3000 / WS 3001 就绪
4. DSH：模型凭据、provider/model
5. roles/小鲸鱼.md 或用户自己的角色卡
6. socialV2.enabled = true
7. socialV2.proactive.enabled = true  （如果允许主动找话题）
8. socialV2.memory.observeOnly = true（建议先保持）
```

没有这些，管理器即使安装成功，也不会自动发 QQ 消息。

---

# 8. 配置字段修改优先级

```text
P0 不能错：
  repoRoot / snowlumaRoot / dshExe
  dsh.baseUrl / dsh.authToken
  snowluma.wsUrl / httpUrl / accessToken
  ownerQQ / allow / deny

P1 影响安全：
  allowAllWhenEmpty
  socialV2.tools.*
  socialV2.memory.observeOnly
  socialV2.growth.observeOnly
  consoleToken

P2 影响行为：
  socialV2.proactive
  socialV2.wake
  socialV2.send
  socialV2.qzone
  socialV2.sticker / voice

P3 只影响外观/体验：
  manager.theme
  SnowLuma ui.json
```

---

# 9. 禁止自动修改的内容

```text
state/memory.db
state/memory-test.db
SnowLuma data/*.db
SnowLuma config/webui.json 的密码哈希
%USERPROFILE%\.dsh\.credentials.yaml
任何 *.key / token / cookie 文件
```

---

## 10. 结论

用户需要让其他 Agent 修改配置时，应提供：

```text
1. 本文件
2. 目标配置文件路径
3. 要修改的字段和期望值
4. 是否允许重启服务
5. 是否已经备份
```

Agent 不应该：

```text
猜路径
猜 ownerQQ
猜 token
读取凭据
覆盖 state
删除角色
自动改白名单
```
