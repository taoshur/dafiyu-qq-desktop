# Dafiyu Control Center 0.6.0

本版本把本地定制的 Memory V3 记忆系统随 qq-bridge 源码一起内置。

## 内置 qq-bridge

- 内置源码从上游 v0.2.1-r1 替换为本地定制版：
  - qq-bridge `v0.2.0-r4`
  - 包含 `src/memory/`（Memory V3）
  - 包含 `tools/bilibili-mcp` 工具源码
- 安装包 `resources/qq-bridge`
- 首次安装复制到用户目录后执行 `npm install`
- 不复制任何 `state/`、`config.json`、cookie、token、备份或生产记忆

## 新用户默认记忆策略

首次从 `config.example.json` 初始化 `config.json`，默认：

```json
{
  "dbPath": "state/memory.db",
  "retrieval": true,
  "extract": true,
  "ingest": true,
  "observeOnly": true,
  "batchSize": 30,
  "idleMinutes": 15,
  "maxQueue": 200,
  "maxAttempts": 3,
  "intervalMs": 60000,
  "injectBudgetTokens": 600
}
```

策略：

- 每个 QQ 会话独立 DSH 上下文
- 消息写入独立 `memory.db`
- 后台抽取候选，不自动覆盖正式事实
- 按需检索，最多约 600 token 注入
- 桌面生产库只读；练习副本可审核
- 新用户从空记忆库开始，不继承你的记忆

## 安装失败提示

一键安装失败可复制排查提示词，交给 DeepSeek / DSH；包含错误、目录、日志和许可边界。

## 管理器

- 版本 0.6.0
- 保留隐藏 VBS 启动 bridge、更新检查、B站活动页

## 验证

- 内置 Memory V3 源码安装实际测试通过
- `src/memory/db.js`、`hook.js` 存在
- `config.example.json` 已包含 Memory V3 默认值
- 更新/路径/B站测试 14/14
- 控制测试 17/17

## SHA256

```text
B96FCF9D61A4446EF4C8FE2C43E4ABE4ED0410EEDEADB1A413D71483A14538C0
```
