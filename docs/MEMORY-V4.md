# Memory V4：召回优化与可逆遗忘

本版本在 Memory V3 上增量升级，不替换原有 Facts / Events / Candidates。

## 1. 先优化召回

### 多路候选

- 人物 / 发言者
- 时间范围（前天、上周、N 天前等）
- 事件参与者
- 关键词中文二元组 / ASCII 词
- 冷记忆（归档）受控补充

### 多信号重排

在硬过滤（会话、可见范围、有效性）之后，按以下因素加权：

| 因素 | 默认权重 |
|---|---:|
| 当前问题相关性 | 40% |
| 可信度 | 25% |
| 重要性 | 15% |
| 时间匹配 | 10% |
| 活跃度 | 10% |

人物命中额外少量加分；已归档/休眠记忆有排序惩罚，但不会被删除。

### 查询构造

`buildQueryFromState` 现在使用最近 3 条非 bot 消息 + 当前话题，而不是只取最后一条；像“还记得吗”这种没有主题的句子，仍能带上前文。

### 诊断

新增 `memory_recall_diagnostics` 表：

- 查询哈希（不保存原文）
- 候选数
- 选中 ID
- 注入 token
- 时间过滤条件

对应 `state/memory-inject.jsonl` 也会记录候选数和选中的记忆 ID 摘要。

### Token 预算

仍然使用真实的可估算 Token 预算（默认 600），不是“最多 N 条”。格式化后逐条累加，超出预算就跳过。

## 2. 再加入遗忘机制

生命周期字段已迁移到 `facts` / `events`：

```text
importance
activation
last_recalled_at
reinforcement_count
lifecycle_state
```

### 三个独立维度

- `confidence`：真假/可信度，不随时间自然下降
- `importance`：值不值得保留
- `activation`：最近是否容易被想起

`lifecycle_state` 与事实有效性分开：

```text
Active ⇄ Dormant ⇄ Archived
Valid → Superseded / Invalidated / Expired
```

- **Archived 不等于删除**：证据和原文保留，仍可被深度检索
- **Archived 不等于失效**：`status` 不变
- **重要性保护**：`importance >= protectImportance`（默认 0.8）不会归档
- **不物理删除**：只更新活跃度和状态

### 衰减

```text
activation(t) = activation * exp(-Δt / τ)
```

- 默认 `τ = 30 天`
- 重要类别（trait/habit/profile/relationship）τ 更长
- 临时计划/技术事件 τ 更短
- 高重要性记忆有最低活跃度保护

### 召回强化

只有**实际被注入**的记忆才会：

- 更新 `last_recalled_at`
- 少量提升 `activation`
- **不**因为“被召回”增加 `reinforcement_count`

`reinforcement_count` 预留给有独立证据的强化，避免模型重复输出被当成新证据。

## 3. 默认配置

```json
{
  "recallV4": true,
  "lifecycleEnabled": true,
  "decayTauDays": 30,
  "dormantThreshold": 0.35,
  "archiveThreshold": 0.15,
  "recallBoost": 0.08,
  "protectImportance": 0.8,
  "sweepHours": 6
}
```

回滚：

```json
{
  "recallV4": false,
  "lifecycleEnabled": false
}
```

## 4. 迁移与验证

- `openMemoryDb` 对旧库做增量列迁移，不重建、不删数据
- 迁移前应备份 `memory.db`
- 已用生产库副本测试：
  - 5 个生命周期列全部存在
  - `quick_check = ok`
  - 原有 206 条 active facts 保留
- 自动化测试：
  - 时间相关事件优先
  - 生命周期归档不改变 `status`
  - 高重要性事实不被归档
  - token 预算与诊断记录

## 5. 当前限制

- 归档/休眠目前只影响排序和状态，尚未做“深度回忆”专用 UI
- `reinforcement_count` 不因召回增加；独立证据强化尚未接入完整审核流
- 没有向量检索；语义召回仍依赖关键词/人物/时间/事件
- 生命周期 sweep 默认 6 小时一次，由记忆读取触发；不是独立常驻任务
- 新代码需要重启 qq-bridge 才生效
