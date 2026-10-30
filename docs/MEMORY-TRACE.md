# Memory 全链路追踪（当前实现）

## 目标

为一次记忆处理保留可关联的追踪 ID，同时避免在诊断中保存聊天原文。

## 已有追踪

### 提取批次

```text
extraction_batches.batch_key
memory_candidates.batch_key
```

同一个批次的消息、候选和死信可以通过 `batch_key` 关联。

### 生产审核

```text
memory_review_audit.trace_id
memory_review_audit.request_id
```

记录：

- 操作者
- 动作
- 候选 ID
- 状态变化
- 关联 fact/event ID
- 原因
- 变更字段名（不保存编辑后的正文）
- 时间

`request_id` 唯一，重复提交返回原审计记录，避免重复写入。

### 召回

```text
memory_recall_diagnostics.trace_id
filters.traceId
filters.stage
```

`stage`：

- `injected`：实际进入上下文
- `retrieval-empty`：候选存在但未注入，或没有候选

记录：

- 候选数
- 实际注入 ID
- 实际 Token
- 时间范围
- 会话/查询哈希（不保存原文）

### 上下文注入日志

```text
state/memory-inject.jsonl
```

记录注入 Token、命中数、候选数、选中 ID、时间范围；不记录原始聊天内容。

## 保留时间

- 审核审计：约 90 天，自动清理
- 召回诊断：约 90 天，自动清理
- 注入日志：2MB 上限，超出后轮换

## 仍缺口

当前还没有把四个阶段串成一个统一 `trace_id`：

```text
提取 → 候选 → 审核 → 召回 → 注入
```

目前是：

- 提取/候选：`batch_key` + `extraction_batches.trace_id` + `memory_candidates.trace_id`
- 审核：`trace_id` + `request_id` + `source_trace`
- 召回/注入：`recall-*`
- 审核审计已通过 `source_trace` 关联到候选提取 ID

剩余缺口：召回与提取仍不是同一个根 ID；需要后续把 `source_trace` 传入召回请求。
