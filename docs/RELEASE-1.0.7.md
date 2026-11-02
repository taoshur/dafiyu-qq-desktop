# Dafiyu Control Center 1.0.7

## 完整数据导出

- 配置页新增「导出完整数据（人格 + 记忆）」
- 数据备份页每个备份新增「导出数据包」
- 导出内容：
  - 角色 / 人格设定
  - memory.db 一致性快照
  - qqbridge 配置（已移除 token、API Key、密码等敏感字段）
  - state 状态数据
- 不包含日志、模型、音频
- 导出 ZIP 附带 manifest 和校验信息

## 安全

导出包仍包含私人记忆，不能公开分享。导出配置已脱敏。

## 构建

```text
size: 123,461,265
sha256: 967F51FE0179A3DCC0C519D135E92484F7DFC975263963B56C668BCA8AC93FA1
```


## qqbridge 组件

```text
qq-bridge-0.2.0-r4-custom.2.zip
size: 1,589,405
sha256: 0A208EC19CFEBD125E664333B65E72102C3E6688B586F3BE1981AEEA8CCA5143
```

包含自唤醒、记忆自动审核和事件自动审核。组件包不包含 config/state/roles。

## 本次额外验证

- 固定主动定时器关闭
- 自唤醒提示已生效
- 自动审核已实际采纳 30 条事实、11 条事件
- SnowLuma 2.3.4 已验证
