# Dafiyu Control Center 1.1.1

## 已确认记忆编辑

长期记忆的「已确认事实」和「已记录事件」新增：

- 编辑
- 新增
- 软删除
- 恢复
- 修改审计

编辑与删除需要先解锁生产审核。

## 人格成长详情

点击「人格成长」卡片可查看：

- 生效特质
- 候选特质
- 成长候选
- 成长日志

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

## qqbridge 组件

```text
qq-bridge-0.2.0-r4-custom.7.zip
size: 1,607,828
sha256: 32382FEF7781671029E8905193FF522FD0D5D4A09BEFC1DF9EA4F8562E6514A8
```

包含好友自动审核、识图 MIME 修复、QZone 失败退避。

## 构建

```text
管理器
size: 123,475,635
sha256: C994E3EC35B253DF11288336E30F813F839609FD2B7FE8FA1670A35D9517E313
```
