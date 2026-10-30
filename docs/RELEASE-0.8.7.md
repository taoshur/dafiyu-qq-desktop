# Dafiyu Control Center 0.8.7

Legacy Growth Candidate stale 风险修订版本，仅用于生产升级前评审。

## 修复

- `applyCandidateTx` 在事务内重新读取 trait
- 当前 strength 与候选 `before_strength` 不一致时标记 `stale` 并拒绝应用
- `basis_cursor=NULL` 的旧 pending 候选标记为 `legacy-ambiguous`，禁止静默应用
- 新增 `growth_reconcile` 对账表
- 新增 `consumed_total` / `unconsumed_total` / `ambiguous_total` 累计语义
- 旧 pending 不再阻止新 current 候选生成
- 保留旧候选、人格版本、证据和审计记录
- 迁移幂等，重复执行不重复写 journal

## 语义

- `trait_evidence.id`：全局递增 ID
- `traits.evidence_cursor`：该 trait 已消费到的最大证据 ID
- `growth_candidates.basis_cursor`：候选创建时基于的最大证据 ID
- `growth_reconcile.consumed_total`：证据 ID <= basis_cursor 的累计数量
- `unconsumed_total`：证据 ID > basis_cursor 的累计数量
- `ambiguous_total`：无法可靠判定消费状态的历史证据数量

## 验证

- 213/213 测试通过
- 隔离迁移副本 integrity ok
- 旧候选 apply 被阻止
- 旧候选 reject 不改 strength
- 旧证据不重复消费
- 新 current 候选可正常成长
- 事务失败回滚
- 迁移重复执行稳定

## 状态

本地修订包，未上传 GitHub，未部署生产。

## 本地构建

```text
size: 123,442,195
sha256: 33E4CE68891952390B6E654B34CEC0FB4C21C919338AC6B2742D958289F05F48
```
