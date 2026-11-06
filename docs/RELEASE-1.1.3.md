# Dafiyu Control Center 1.1.3

## 成长候选评审

「人格成长」详情里的成长候选新增：

- 采纳
- 拒绝

采纳条件：

- 候选状态为 pending
- `reconcile_state=current`
- 存在 `basis_cursor`
- 当前 trait strength 与候选 before 一致

采纳后会更新：

- trait strength
- trait_versions
- growth_reconcile
- growth_journal
- 本地审计

旧候选 / 缺少证据水位的候选只允许拒绝，不会强行覆盖当前特质。

拒绝只标记候选为 rejected，不修改 trait。

## 构建

```text
size: 123,477,251
sha256: F1A050F707FF8A2F7412A99026680FC138AABFFFC283D801F9CDF39EE0FEF973
```

## qqbridge 组件

```text
qq-bridge-0.2.0-r4-custom.7.zip
size: 1,607,828
sha256: 32382FEF7781671029E8905193FF522FD0D5D4A09BEFC1DF9EA4F8562E6514A8
```
