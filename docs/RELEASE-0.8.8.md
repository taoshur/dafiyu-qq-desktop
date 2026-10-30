# Dafiyu Control Center 0.8.8

本版本包含 v0.8.7 的 Legacy Growth 对账修复，以及两项使用体验修复。

## 新增 / 修复

### 凌晨“明天”规则

写入记忆时，如果消息发送时间在 00:00–04:59：

```text
“明天” → 消息当天
```

05:00 及以后仍为次日。固定按 Asia/Shanghai 计算，并写入候选的
`happened_at` / `time_precision`。

### 下拉框交互

- 原生 `select` 不再在点击打开时触发页面刷新
- 排序下拉框改为 `change` 后刷新
- 自动轮询期间如果输入框、日期框或下拉框正在操作，暂缓 DOM 替换

### Legacy Growth

包含 0.8.7 的旧候选对账、stale guard、`growth_reconcile` 和历史证据隔离。

## 验证

- 217/217 测试通过
- 构建校验通过

## 状态

此包为本地构建候选，上传 GitHub Release 后即可作为更新包使用。
## 构建

```text
size: 123443099
sha256: E9640D8AB5C030185150386FE0BCAC9A63FA14B009E398C8760B8BC4D3238C7D
```n
