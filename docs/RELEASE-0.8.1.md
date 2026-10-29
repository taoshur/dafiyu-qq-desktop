# Dafiyu Control Center 0.8.1

修复 0.8.0 启动后总览页一直显示“正在读取运行状态…”的问题。

## 修复

- 恢复被页面拆分误删的 `PAGE_META`
- 新增 renderer 契约测试：
  - 页面脚本加载顺序
  - 页面入口函数
  - `PAGE_META` 必须存在

## 数据

- 不影响已有配置、Memory、B站记录或 qq-bridge 数据
- 0.8.0 的配置迁移备份仍有效
- 已安装 0.8.0 的用户直接覆盖安装即可

## 验证

- 全量测试
- 页面截图：总览/配置/记忆/B站/服务/设置
- `npm run verify:build`

## SHA256

```text
FF5C967788DD3F9E5CD43398CE327BB34724C77F4934317A435E3432F2A91CFB
```
