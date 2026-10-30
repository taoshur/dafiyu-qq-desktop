# Dafiyu Control Center 0.8.6

Memory V4 针对性审查修复版本。

## 人格成长

- 新增 `traits.evidence_cursor` 证据消费水位
- 新增 `growth_candidates.basis_cursor`
- 同一批证据不再重复提高 trait strength
- 只有水位之后的新证据才能产生新 delta
- 旧库一次性迁移水位，不重复消费历史证据
- 修复旧表 `UNIQUE(trait_key,kind,status)` 导致第二次 applied 失败的问题；重建表并保留历史
- 仅允许一条 pending 候选

## 撤销隔离

- facts：`status='retracted'` 不再进入召回
- events：`retracted_at` 不再进入召回
- 桌面 facts/events 列表过滤撤销记录
- 记忆计数过滤撤销事件
- 撤销后重新批准不会复用旧 source_key

## 长期重要经历

- 对照评测加入“近期普通事件 vs 久远重要经历”
- 未修改权重；增加一个受保护的重要事件槽位
- 该槽位要求 importance>=0.8、有相关性、超过 30 天
- 评测：长期重要经历首位命中 1/1

## 评测

- 检索基线扩展到 7 个用例
- 新增模型回答评测框架 `npm run eval:answers`
- 回答评测默认不调用模型，避免消耗真实 Key

## 验证

- 206/206 测试通过
- `npm run verify:build`
- 不修改生产数据库，不重启生产服务

## SHA256

```text
BBCB9D65D2C62B4F384E2CBF178681D646B6CE504F581BDAE2C6F1C10C940ECE
```
