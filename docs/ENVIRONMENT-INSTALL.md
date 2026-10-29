# 环境安装与首次部署

## 能力边界（按实际代码）

| 组件 | 检测 | 自动安装 | 说明 |
| --- | --- | --- | --- |
| SnowLuma | 可执行文件、release.json 版本、config/webui.json、5099/3000/3001 | **否** | SnowLuma EULA §5.4 限制自动部署/并入第三方安装包；本项目只获准启动/停止和 WebUI 内嵌，不包括安装、修改或再分发 |
| qq-bridge | package.json、src/bridge.js、config.json、state/console-token、3100/3080 | **是，官方源码归档** | 固定 `v0.2.1-r1`，SHA256 校验，`tar.exe` 解压，`npm install`，不覆盖非空目录 |
| DSH | DeepSeek Harness.exe、`~/.dsh`、运行端口 | **否** | 官方仓库没有可用于静默安装的 Release 资产；需要官方桌面安装包和首次初始化 |

- Python **不是**三件套的运行依赖
- Git 不是自动安装的必需项：使用 GitHub zip，不执行 `git clone`
- npm 只在自动安装 qq-bridge 源码依赖时需要
- 安装完成 ≠ 服务已启动；运行状态由服务控制/健康检测单独管理

## 环境页

侧边栏「环境安装」：

- 检查 Windows/CPU/Node/npm/Git/Python 与组件状态
- 状态区分：未安装、已安装未配置、已配置未运行、正常运行、版本不兼容、未知
- qq-bridge 缺失时提供源码安装；SnowLuma/DSH 显示官方安装页面和手动步骤
- 安装进度、实际下载字节数/百分比、日志、取消、失败重试
- “重新检测”只读，不会启动/停止任何服务

## qq-bridge 自动安装

固定来源：

```text
https://codeload.github.com/Derpyu520/qq-bridge/zip/refs/tags/v0.2.1-r1
SHA256 9DB4365C5816BB7FF971420423316D141B533FC66F171E2536A8B67E7D4501C9
```

步骤：

1. 用户确认
2. 检查目标目录（拒绝覆盖非空目录）
3. 下载到 `%APPDATA%\dafiyu-desktop\cache\install\...`
4. SHA256 校验
5. `tar.exe` 解压
6. `npm install --no-audit --no-fund`
7. 复制 `config.example.json` 为 `config.json`（不填真实凭据）
8. 验证 package.json / bridge.js / node_modules
9. 写入 `state/install.json` 登记安装结果

不会自动启动 bridge，不会写 SnowLuma/DSH 配置，不会把 token 写入日志。

本机实测：v0.2.1-r1 源码归档下载、SHA256 校验、解压、`npm install`（128 packages）、
`config.example.json` 初始化均完成；没有启动服务，没有接触生产数据。

## 需要手动完成

- SnowLuma：从官方 Releases 下载 Windows 完整包，解压后按官方 WebUI 首次登录流程配置
- DSH：安装官方桌面应用并完成首次启动
- qq-bridge：填写 `config.json` 的 DSH/SnowLuma/账号配置；bridge 首次启动自行生成 `state/console-token`
- 所有凭据由用户输入/本机生成，桌面只读取必要的本机凭据

## 已知限制

- SnowLuma/DSH 的“一键安装”未实现，也不会用假成功状态伪装
- qq-bridge 源码安装依赖网络、npm 和上游依赖；在真实网络环境完成前，UI 不保证成功
- 取消下载/安装会终止子进程并清理临时目录，但不删除已存在的用户目录
- 安装任务在应用异常退出后不会自动续跑；下次启动清理超过 24 小时的临时目录，需重新检测/重试

## 测试

```powershell
node --test test/environment.test.js
npm test
```
