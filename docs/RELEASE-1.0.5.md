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
size: 123,457,305
sha256: 19253CCE89F0806911931BE05E912D28735766E97937593D7C63FBF651EC2980
```
