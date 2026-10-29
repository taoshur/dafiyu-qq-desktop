# Dafiyu Control Center 0.5.1

本版本是 0.5.0 的发布修正，保留内置 qq-bridge、安装失败提示词和更新检查。

## 修正

- CI 测试只运行 `test/*.test.js`，不再把内置 qq-bridge 的上游测试误当成本项目测试
- 重新构建安装包，确认内置 `resources/qq-bridge` 存在
- 管理器版本升到 0.5.1

## 内置 qq-bridge

- 安装包包含 qq-bridge v0.2.1-r1 源码
- 环境安装页只需初始化一次内置 qq-bridge
- 不打包 `node_modules`/SnowLuma SDK 依赖，首次初始化仍需 Node/npm 和网络
- 一键安装失败可复制失败排查提示词给 DeepSeek/DSH

## SHA256

```text
65FAD2449E11165C049D72B663BD8CB68A1877F2AAB761A407DE56E149AD4EF2
```
