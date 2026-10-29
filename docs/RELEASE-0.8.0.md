# Dafiyu Control Center 0.8.0

本版本是工作台架构重构完成版，并强化了数据迁移与兼容性。

## 架构

- IPC 从单文件拆为 router + contracts + feature handlers
- 业务 DTO 移入 `src/main/domain/`
- Renderer 拆为 `core/`、`components/`、`pages/`
- 服务控制增加 Supervisor 门面
- 安装/更新共用 TaskService + TaskJournal
- Memory/B站通过 Repository 访问
- 结构化日志与构建检查

## 兼容性

- 所有 IPC 频道名称保持不变
- 现有页面、配置、服务控制行为保持兼容
- 现有 qq-bridge / SnowLuma / DSH 目录不被覆盖
- 升级后自动迁移桌面配置并保留未知字段
- Memory V4 迁移前自动生成 SQLite 备份，备份失败则停止迁移
- 只增量加列，不删除 facts/events/messages
- 归档不改变事实有效性

## 验证

- 全量测试通过
- IPC 契约 48 频道
- 配置迁移/损坏保护
- TaskJournal 损坏恢复
- Memory V4 召回/生命周期
- B站统计
- 构建产物检查

## SHA256

```text
D285E5C4E50147DE50C1249C0C5B47D1944E94F40C5D3C928E1C4F2B86820C92
```
