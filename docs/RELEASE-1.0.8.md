# Dafiyu Control Center 1.0.8

## 日记

- 新增「日记」页面
- 大肥鱼没有固定写日记时间，想写时才写
- 新增 `qq_diary_context` / `qq_diary_write` 工具
- 日记保存到 `qqbridge/state/diary.db`
- 支持标题、正文、心情标签、当天片段
- 管理器可查看日记列表和正文
- 管理器提供「允许大肥鱼自己写日记」开关

边界：

- 不自动发送到 QQ
- 不写入事实 / 事件
- 不进入自动审核
- 不根据日记修改人格
- 不设固定定时任务

## 记忆自动审核

- 事实和事件均可自动审核
- 有效可信度阈值 0.55
- 无每日数量上限
- 使用公共 DNS 兜底 fake-IP 环境下的 QQ 媒体地址
- DeepSeek 429/5xx 自动重试

## 其他

- 完整数据导出（人格 + 记忆）
- 自唤醒机制
- 浅色主题日志与日记开关样式修复
- SnowLuma 2.4.0 已验证

## 构建

```text
管理器
size: 123,464,427
sha256: EA9CF3A25220DD22675C2D67989F842D413E7FD986BB579495306F3F340CD914
```

```text
qqbridge 组件
qq-bridge-0.2.0-r4-custom.3.zip
size: 1,606,928
sha256: AFE33E5268BDE9E0DA37561CAD2C732C43D5275AC2369AB4D4B73C8A1E7FCC85
```
