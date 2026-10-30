# MaiBot 记忆导入

桌面控制台的「长期记忆」页支持把 MaiBot 的聊天记忆导入为当前 Memory V4 的**待审核候选**。

## 使用

```text
长期记忆 → 查找记忆 → 导入 MaiBot 记忆
```

选择：

```text
<MaiBot>/data/MaiBot.db
```

导入前会显示：

- 识别到的表
- 可导入数量
- 最多 3 条摘要样本
- 时间/范围预览

确认后只写入 `memory_candidates`：

```text
kind=event
status=pending
source_type=maibot
quality=review
```

不会直接写 `facts` / `events`，也不会修改 `traits` 或人格强度。

## 支持的数据

### `chat_history` 旧版

```text
id
chat_id
start_time / end_time
participants
theme / keywords
summary
```

### `chat_history` 新版

```text
id
session_id
start_timestamp / end_timestamp
participants
theme / keywords
summary
```

### A_Memorix `paragraphs`

```text
hash / id
content
event_time_start / event_time_end
source
```

## 安全设计

- 源数据库以只读 SQLite 打开
- 目标库导入前执行 `VACUUM INTO` 备份
- 整个候选写入在一个事务内完成
- 使用以下键去重：
  ```text
  maibot:<源库路径指纹>:<表>:<源记录ID>
  ```
- 单次最多 10000 条
- 导入失败会回滚，不留下半批候选

备份位置：

```text
%APPDATA%\dafiyu-desktop\state\maibot-import-*.db
```

## 映射规则

- `summary` 或 `content` → 候选摘要
- `theme` / `keywords` / `source` → 候选详情
- `participants` → JSON 数组
- `start_time` / `start_timestamp` → `happened_at`
- 日期只有天级精度时 → `time_precision=day`
- 无法识别 `chat_id` 时保留为：
  ```text
  maibot:<原始ID>
  ```

## 不迁移的内容

- MaiBot 的人格、关系值、亲密度
- 向量和 A_Memorix 的关系图
- 原始聊天消息
- 自动审批结果

这些内容不能直接覆盖当前人格或正式记忆，需要人工审核。
