# Dafiyu Control Center 0.8.5

Memory V4 生产审核、脱敏回放评测和追踪增强版本。

## 生产候选审核

- 长期记忆页支持显式解锁生产审核
- 批准 / 编辑 / 拒绝 / 撤销
- 原始证据、来源会话、主体、时间、置信度、质量原因
- 事务化候选应用
- `request_id` 幂等保护
- 90 天审计日志
- 撤销采用 retracted 标记，不物理删除事实
- 保持 `observeOnly=true`，不自动晋升
- 不自动修改人格 traits

## 召回与安全

- 三层质量过滤：allow / review / reject
- 旧事件、敏感内容、技术事件不再按关键词直接丢弃
- 概念扩展召回
- “前几天”不含今天，“最近几天”含今天
- 空召回也写诊断
- 跨人物事实不再注入其他说话者上下文
- 候选生产审核默认锁定，10 分钟会话

## 评测

```powershell
npm run eval:memory
```

脱敏基线：

- 6 个用例
- Recall 100%
- Precision 100%
- 误召回 0
- 幻觉率 0%
- 平均 Token 11.5

评测是人工脱敏基线，不是直接导出生产聊天原文。

## 追踪

- 提取批次 `batch_key` + `trace_id`
- 候选 `trace_id`
- 审核 `trace_id` + `request_id` + `source_trace`
- 召回 `recall-*`
- 诊断保留约 90 天

## 验证

- 202/202 测试通过
- Windows 进程树实机测试通过
- `npm run verify:build`

## SHA256

```text
F54508F68C989F7E892B79B74888D4D499D47A09FC61CD88F41F41D7EBFF997F
```
