# 数据迁移与兼容性

## 原则

升级只做增量迁移，不重建、不清空、不覆盖用户数据。

## 桌面配置

位置：

```text
%APPDATA%\dafiyu-desktop\config\config.json
```

- 缺少 `schemaVersion` 时自动迁移到 1
- 迁移前备份：
  ```text
  config.json.pre-schema-1-<时间戳>.bak
  ```
- 保留未知字段；未来版本新增字段不会丢失
- 配置损坏时不覆盖原文件，只报告不可用
- 写入使用临时文件 + rename 原子替换

## Memory V3/V4

位置：

```text
<qq-bridge>/state/memory.db
```

- Memory V4 只新增列：
  - `importance`
  - `activation`
  - `last_recalled_at`
  - `reinforcement_count`
  - `lifecycle_state`
- 检测到旧 schema 时，先用 SQLite `VACUUM INTO` 备份：
  ```text
  memory.db.pre-v4-<时间戳>.bak
  ```
- 备份失败则停止迁移，不在无备份状态下改 schema
- 不删除 facts/events/messages
- 归档只改 `lifecycle_state`，不改变 `status`，不删除证据

## qq-bridge/DSH 数据

桌面升级不会：

- 覆盖已有 qq-bridge 目录
- 改写 qq-bridge 的 `config.json`
- 删除 `state/`、`social-v2.json`、`bili-watch.jsonl`
- 复制生产记忆到新目录

新安装才使用安装包内置源码。

## 升级步骤

1. 关闭桌面控制台和 qq-bridge
2. 安装新版本
3. 首次启动桌面会自动迁移桌面配置
4. 首次启动新版 qq-bridge 会自动迁移 `memory.db`，并生成 `.pre-v4-*.bak`
5. 在「长期记忆」页检查数据库完整性和计数
6. 如有问题，停止服务后用备份文件恢复

## 回滚

- 桌面配置：恢复 `config.json.pre-schema-1-*.bak`
- Memory：停止 qq-bridge 后恢复 `memory.db.pre-v4-*.bak`
- 二进制回滚：安装旧版本安装包；用户数据目录默认不随卸载删除
