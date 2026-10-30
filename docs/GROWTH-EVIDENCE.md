# Growth Evidence Cursor 语义

## trait_evidence.id

`trait_evidence.id` 是 SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`：

- 全表全局递增
- 不按 trait 重置
- 不同 trait 可能拥有交错分布的 ID

因此 cursor 是“全局 ID 水位”，不是“第 N 条证据”。

## traits.evidence_cursor

记录该 trait 已消费到的最大 `trait_evidence.id`。

- 读取时始终加上 `trait_key` 条件
- 不会把其他 trait 的证据算入
- 只消费 `id > evidence_cursor` 的证据

## growth_candidates.basis_cursor

候选创建时对应的最大证据 ID。

- 新候选必有 basis_cursor
- 应用后 traits.evidence_cursor 前进到 max(当前, basis_cursor)
- `basis_cursor=NULL` 表示旧候选，历史消费状态不可确认

## growth_reconcile

累计值，不是单次 apply 的增量：

| 字段 | 语义 |
|---|---|
| `snapshot_evidence_count` | 候选创建时的证据数量 |
| `current_evidence_count` | 对账时当前证据数量 |
| `consumed_total` | 当前 trait 中 `id <= basis_cursor` 的证据总数 |
| `unconsumed_total` | 当前 trait 中 `id > basis_cursor` 的证据总数 |
| `ambiguous_total` | 无法确认是否消费的历史证据数 |

旧候选：

```text
state=legacy-ambiguous
consumed_total=0
unconsumed_total=0
ambiguous_total=当前证据数
```

这是保守处理：不自动补算，不自动应用。

## 状态

```text
current           正常候选，可审核
applied           已应用
stale             当前 trait 已变化，禁止应用
legacy-ambiguous  旧候选，需人工对账
legacy-applied    旧已应用，仅保留审计
legacy-rejected   旧已拒绝
```
