# v0.8.1 审查问题台账与批次 1 修复

基线：`dafiyu-qq-desktop v0.8.1`  
日期：2026-10-30

## 批次 1（本轮已修）

| ID | 状态 | 证据 | 修复 |
|---|---|---|---|
| U01 | 已修复 | `src/main/updates.js` | 缺少完整 `sha256:` 摘要时拒绝自动下载/执行 |
| U03 | 已修复 | `src/main/updates.js` | 不再回退到任意 `.exe`，只接受精确 Setup 名称 |
| S01 | 已修复 | `src/main/control.js` | 同服务 start/stop 串行锁 |
| S02 | 部分修复 | `src/main/control.js` | 强制终止前后代进程逐个复核身份；TOCTOU 残余仍存在 |
| S03 | 部分修复 | `src/main/control.js` | 终止前复核全树身份；未引入 Job Object |
| L01 | 已修复 | `src/main/core/logger.js` | 递归按字段名/内容脱敏，含数组/嵌套对象 |
| L02 | 已修复 | `src/main/logs.js` | 展示/导出的日志行经过脱敏 |
| B01 | 已修复 | `src/main/backup.js` | 恢复演练前执行完整 `verifyBackup()`，复制后哈希复核 |
| B02 | 已修复 | `src/main/ipc/handlers/backups.js` | 使用 realpath 校验备份目录边界，防符号链接逃逸 |
| B03 | 已修复 | `src/main/backup.js` | 拒绝 `..`/绝对路径/realpath 越界的 manifest 条目 |
| I01 | 已修复 | `src/main/domain/tasks/service.js` | 异步启动前原子占位，防双击并发 |
| L03 | 已修复 | `src/main/domain/settings.js` | repoRoot/snowlumaRoot 必须是目录，dshExe 必须是文件 |
| PAGE_META | 已修复 | `src/renderer/app.js` | 0.8.1 总览卡死的根因，新增 renderer 契约测试 |

## 未修/待验证

| 范围 | 状态 |
|---|---|
| M01 重复衰减 | 已修复：新增 `activation_updated_at` 基准并测试 |
| M02 时间范围覆盖 | 待验证 |
| M03 候选预筛丢失 | 待验证 |
| M04 诊断落库时机 | 待验证 |
| M05 0 值配置 | 部分修复：lifecycle 使用有限数判断，其他模块待查 |
| M06 队列积压 | 已修复：积压不再跳过，按批继续消费 |
| M07 永久失败重试 | 部分修复：死信表 + `retryDeadLetters()`，尚无 UI 入口 |
| M08 observeOnly | 产品决策，待用户确认 |
| M09 hook 永久 disabled | 已修复：连续失败熔断 5 分钟后自动恢复 |
| M10 ttlDays 字段 | 已修复：兼容 `ttlDays` / `ttl_days` |
| R01–R03 恢复租约/退避 | 待验证 |
| U02/U04 下载清理/版本语义 | 待修 |
| S04–S06 进程身份细节 | 待验证 |
| I02 IPC 错误语义 | 待修 |
| F01 B站历史总数 | 待修 |
| X01–X07 | 待验证 |

## 新增测试

- `test/renderer-contract.test.js`
- `test/logger.test.js`
- `test/backup.test.js` 路径穿越
- `test/updates.test.js` 缺摘要/非预期资产
- `test/task-baseline.test.js` 并发启动

## 兼容性

- 未修改 IPC 频道
- 未修改用户数据格式
- 未删除或重置真实数据
- 未改变默认观察模式/自动晋升/记忆衰减策略

## 下一批建议

批次 2 已完成 M01、M06、M09、M07（部分）、M10。  
M08（observeOnly/自动晋升）属于产品决策，需用户先确认。
