# Dafiyu Control Center 0.8.2

审查修复批次 1–5 的汇总版本，重点提升安全性、恢复可靠性、记忆召回稳定性和工程边界。

## 安全

- 更新包缺少可信 SHA256 摘要时拒绝自动下载/执行
- 更新资产必须精确匹配 Setup 名称
- 备份恢复校验 manifest、realpath 边界和哈希
- 日志展示/结构化日志递归脱敏
- IPC 错误消息脱敏

## 服务与恢复

- 同服务 start/stop 串行
- 强制停止前后代进程逐个复核
- 恢复租约 heartbeat、finally 释放、实际退避
- supervisor 串行入口统一

## Memory

- 衰减基准 `activation_updated_at`，避免重复衰减
- 积压超过 maxQueue 仍继续分批消费
- 永久失败进入死信，可重试
- 入库连续失败熔断 5 分钟后恢复
- 当前消息时间优先
- 候选上限随 limit 扩大
- 诊断记录实际注入 ID/tokens
- TTL 字段统一
- SQLite busy_timeout
- 候选 apply 事务化

## 工程

- SemVer prerelease 比较
- 进程签名边界匹配
- B站历史总数与最近窗口区分
- 构建检查

## 验证

- 192/192 测试通过
- Windows 实机截图/构建验证
- `npm run verify:build`

## SHA256

```text
39DD62FD485C5FC86ECFF506FDD3FA11FB5AB6906AD5FDB152ED4B9185795C67
```
