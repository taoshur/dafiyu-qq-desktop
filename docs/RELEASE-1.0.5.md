# Dafiyu Control Center 1.0.5

## qqbridge 一键组件更新

- 新增 qqbridge 组件检测
- 关于页显示当前版本和最新版本
- 一键下载、校验、备份、停止、替换、启动
- 保留 config.json、state/、roles/、node_modules/
- 启动后检查 3100
- 失败自动回滚并重新启动旧版本
- 新增「全部更新（管理器 + qqbridge）」：先更新 qqbridge，健康检查通过后再下载管理器安装包

## 管理器

包含 1.0.4 的启动更新提醒和浅色主题导航修复。

## 说明

qqbridge 组件包单独发布；管理器安装包不内置 qqbridge 代码和用户数据。

本次先本地构建和安装，待发布。

## 构建

```text
size: 123,457,455
sha256: 410A69B2D9AA1468B2076ED2B74D342881363DAFB79F80040434B9DBDD95A477
```

## qqbridge 组件

```text
qq-bridge-0.2.0-r4-custom.1.zip
size: 1,587,729
sha256: CCAF5F715CFBC66C6122DFF9C72DE66BD7953A0C65B8D10F9B814083C7D8CEF5
```
