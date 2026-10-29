# Dafiyu Control Center 0.7.0

本版本完成 Memory V4 的两个阶段：**先优化召回，再加入可逆遗忘**。

## 1. 召回优化

- 保留最近 3 条非 bot 消息 + 当前话题作为查询，而不是只看最后一句
- 多信号重排：
  - 当前问题相关性 40%
  - 可信度 25%
  - 重要性 15%
  - 时间匹配 10%
  - 活跃度 10%
- 时间问题优先保留至少两条时间范围内的事件
- 事实/事件去重，单个人物最多 3 条
- 真实 token 预算（默认 600）
- 新增 `memory_recall_diagnostics` 诊断表：
  - 查询哈希
  - 候选数
  - 选中 ID
  - token
  - 时间过滤
- `memory-inject.jsonl` 增加候选数/选中 ID 摘要

## 2. 可逆遗忘

- `facts/events` 增量迁移字段：
  - `importance`
  - `activation`
  - `last_recalled_at`
  - `reinforcement_count`
  - `lifecycle_state`
- 三维分离：
  - 可信度：真假
  - 重要性：值不值得留
  - 活跃度：最近是否容易想起
- 生命周期：
  - Active ⇄ Dormant ⇄ Archived
  - 归档不删除、不改变 `status`
  - 高重要性（默认 >= 0.8）不会被归档
- 指数衰减 + 类别保护；默认 τ=30 天
- 只有实际注入的记忆才更新 `last_recalled_at` 和少量 `activation`
- 被召回不会自动增加 `reinforcement_count`
- 可通过配置关闭：
  ```json
  { "recallV4": false, "lifecycleEnabled": false }
  ```

## 3. 验证

- 生产库副本迁移测试：
  - 5 个生命周期列存在
  - `quick_check = ok`
  - 原有 206 条 active facts 保留
- 自动化测试：
  - 时间相关事件优先
  - token 预算/诊断
  - 归档不改变 `status`
  - 高重要性事实不被归档
- 全量测试通过

## 4. 当前限制

- 归档只影响排序/状态，尚未做“深度回忆”专用入口
- 没有向量检索
- 生命周期 sweep 由记忆读取触发，默认 6 小时一次
- 需要重启 qq-bridge 才会加载新代码
- 生产库会先增量迁移列，不重建、不删除旧数据

## SHA256

```text
577C2EFA14375E065CAC116806AEA04B60BDB0EC53CD2E96B7939372B5DDF40A
```
