# Dafiyu Control Center 1.1.1

## 已确认记忆编辑

长期记忆的「已确认事实」和「已记录事件」新增：

- 编辑
- 新增
- 软删除
- 恢复
- 修改审计

编辑与删除需要先解锁生产审核。

## 数据边界

- 不物理删除
- 事实删除标记为 `retracted`
- 事件删除写入 `retracted_at`
- 来源字段不可编辑
- 手动修改标记 `manual_override=1`
- 自动抽取不得覆盖手动修改
- 所有写入使用事务
- 写入 `memory_change_audit`

## 新增记录

可手动新增事实或事件：

```text
source_type = manual:desktop
```

没有来源消息时，详情页会明确显示为手动创建。

## 构建

```text
size: 123,474,663
sha256: CF20DB5138264E6BC1AF7EF4B93870F24129BEAA86D142BA587CE93EE13E70EF
```

本次仅本地构建和安装，未推送、未发布。
