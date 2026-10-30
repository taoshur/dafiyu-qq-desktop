# Dafiyu Control Center 0.8.4

针对长期记忆复审意见的质量修复版本。

## 质量过滤三层

原来关键词会直接拒绝：

- 超过 45 天的事件
- 工资/收入/存款/欠款
- 技术/运维事件

现在改为：

```text
allow（允许保存） / review（进入候选审核） / reject（明确拒绝）
```

- 重要旧经历 → review，不再按年龄直接丢弃
- 敏感内容 → review，不自动保存也不自动丢弃
- 技术事件 → review，同时保留 ops_log
- 玩笑/引用/不确定/无主体 → reject

## 语义召回增强

- 新增本地概念扩展层：情绪、学习、旅行、工作、技术、关系、记忆、健康
- 仍保留关键词/人物/时间召回
- 概念 token 入库并回填旧 facts/events
- 这是轻量概念扩展，不是大型向量数据库

## 模糊时间

- “前几天”：不含今天，避免今天大量事件淹没较早经历
- “最近几天/这几日”：包含今天
- 支持 `timeFuzzyDays` 配置，范围 2–14 天

## 诊断

- 空召回也会写入 `memory_recall_diagnostics`
- 诊断增加 `stage=retrieval-empty` / `stage=injected`
- 记录实际注入 ID 和 token

## 人格成长面板

长期记忆页新增审核状态总览：

- 正式事实/事件
- 待审记忆候选
- 人格成长 traits / candidates
- `autoApplyExpression` 状态

明确区分：

```text
事实提取 observeOnly
人格成长 autoApplyExpression
```

## 验证

- 200/200 测试通过
- Windows 实机进程测试通过
- `npm run verify:build`

## SHA256

```text
E14F816A562AA4A2BF4CCCFD534322ADAAA9EEE8F881F8B32E9CC8E238882512
```
