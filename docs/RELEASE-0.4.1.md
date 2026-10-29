# Dafiyu Control Center 0.4.1

本版本修复服务启动时出现黑色控制台窗口，并加入 GitHub 更新检查。

## 修复

- qq-bridge 改为通过隐藏的 VBS 启动，不再弹出黑色 Node 控制台
- 保留 `start-bridge.mjs` supervisor、DSH relay、bridge 子进程和进程归属记录
- 隐藏启动后仍以监听端口和命令行签名定位根进程，可正常停止

## 新增更新检查

- 启动后从 GitHub Releases 检查更新
- 「关于」页显示当前/最新版本
- 有更新时页面顶部提示
- 下载安装包前确认
- 只允许 GitHub 官方域名
- 校验 Release SHA256 后打开安装程序
- 不静默安装、不自动关闭当前控制中心

## 验证

- 更新检查实际请求成功：当前 0.4.0，最新 0.4.0，无更新
- 更新/路径/B站测试 14/14 通过
- 控制测试 17/17 通过
- About 页实际渲染成功

## SHA256

```text
4C052B35B763D3C8A443BD20B3E45D27E4321248AA99FEBEC80106822483583C
```
