# Dafiyu Control Center 0.5.0

本版本把 qq-bridge 源码集成进安装包，并完善安装失败处理和管理器更新。

## qq-bridge 内置

- 安装包 `resources/qq-bridge` 内置 qq-bridge `v0.2.1-r1` 源码
- 新用户不需要另外下载 qq-bridge
- 环境安装页显示「安装包内置源码」
- 安装时复制到用户目录，再执行 `npm install`
- 不打包 `node_modules` / SnowLuma SDK 等依赖；首次安装仍需要 Node/npm 和网络
- 不覆盖非空目录，不自动启动服务

## 失败提示词

一键安装失败时新增：

**复制失败排查提示词**

提示词包含：

- 失败组件、版本、目标目录、错误
- 最近安装日志
- 官方来源、许可边界、备份和回滚要求
- 明确不索要 token/cookie/API Key

可直接粘贴给 DeepSeek / DSH 排障。

## 安装方式

- SnowLuma：可从官方 Releases 自动下载；也可在配置页手动指定已有安装
- qq-bridge：使用安装包内置源码
- DSH：手动安装指引

## 管理器升级

- 版本升到 0.5.0
- 保留 GitHub Release 更新检查
- 保留隐藏 VBS 启动 bridge，避免黑色 Node 控制台

## 验证

- 内置源码安装实际测试：复制、`npm install`（128 packages）、配置初始化完成
- 更新/路径/B站测试 14/14
- 控制测试 17/17
- 安装包内已确认存在 `resources/qq-bridge/package.json`

## SHA256

```text
55892B36809B13BFA1FBFEFE8249D928C06ABFD7D3491925FCFE5A8AFE343A97
```
