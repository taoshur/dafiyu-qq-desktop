# 环境安装与首次部署

## 能力边界（按实际代码）

| 组件 | 检测 | 自动安装 | 说明 |
| --- | --- | --- | --- |
| SnowLuma | 可执行文件、release.json 版本、config/webui.json、5099/3000/3001 | **是，官方 win-x64 完整包** | 必须先由用户接受 LICENSE/EULA；下载官方未修改完整发行版，SHA256 校验，解压，不修改代码/原生组件，不自建镜像，不打包再分发 |
| qq-bridge | package.json、src/bridge.js、config.json、state/console-token、3100/3080 | **是，安装包内置定制源码** | 内置 v0.2.0-r4 + Memory V3；复制到用户目录后执行 `npm install`，不覆盖非空目录 |
| DSH | DeepSeek Harness.exe、`~/.dsh`、运行端口 | **否** | 官方仓库没有可用于静默安装的 Release 资产；需要官方桌面安装包和首次初始化 |

- Python **不是**三件套的运行依赖
- Git 不是自动安装的必需项：使用 GitHub zip，不执行 `git clone`
- npm 只在自动安装 qq-bridge 源码依赖时需要
- 安装完成 ≠ 服务已启动；运行状态由服务控制/健康检测单独管理

## 环境页

侧边栏「环境安装」：

- 检查 Windows/CPU/Node/npm/Git/Python 与组件状态
- 状态区分：未安装、已安装未配置、已配置未运行、正常运行、版本不兼容、未知
- SnowLuma/qq-bridge 缺失时提供官方来源安装；DSH 显示官方安装页面和手动步骤
- SnowLuma 安装前必须勾选接受官方 LICENSE/EULA；UI 显示官方链接
- 安装进度、实际下载字节数/百分比、日志、取消、失败重试
- “重新检测”只读，不会启动/停止任何服务

## qq-bridge 自动安装

qq-bridge 源码随桌面安装包分发（`resources/qq-bridge`），用户不需要另外下载。

版本与来源：

```text
qq-bridge v0.2.0-r4（含 Memory V3）
上游：https://github.com/Derpyu520/qq-bridge
许可：MIT
```

首次安装会从 `config.example.json` 初始化 `config.json`，其中 Memory V3 默认：

```json
{
  "dbPath": "state/memory.db",
  "retrieval": true,
  "extract": true,
  "ingest": true,
  "observeOnly": true,
  "batchSize": 30,
  "idleMinutes": 15,
  "maxQueue": 200,
  "maxAttempts": 3,
  "intervalMs": 60000,
  "injectBudgetTokens": 600
}
```

新用户得到的是空记忆库，不会带上任何现有生产记忆。

步骤：

1. 用户确认
2. 检查目标目录（拒绝覆盖非空目录）
3. 把安装包内置源码复制到用户目录
4. `npm install --no-audit --no-fund`
5. 复制 `config.example.json` 为 `config.json`（不填真实凭据）
6. 验证 package.json / bridge.js / node_modules
7. 写入 `state/install.json` 登记安装结果

注意：

- 安装包**不打包** qq-bridge 的 `node_modules` 和 SnowLuma SDK 等依赖；首次安装需要本机 Node/npm 和网络从 npm 获取依赖
- 不会自动启动 bridge，不会写 SnowLuma/DSH 配置，不会把 token 写入日志

本机实测：内置 v0.2.1-r1 源码复制、`npm install`（128 packages）、
`config.example.json` 初始化均完成；没有启动服务，没有接触生产数据。

## SnowLuma 自动安装

固定官方来源：

```text
https://github.com/SnowLuma/SnowLuma/releases/download/v2.2.1/SnowLuma-v2.2.1-win-x64.zip
SHA256 09A3FBBF42EA805C4D61B5E67BEC2A46EF341FA803F211D78C40796CB7F535DC
```

前置条件：

- 用户必须主动勾选接受 SnowLuma LICENSE / EULA
- 仅非商业用途
- 只下载官方未修改完整发行版
- 不自建镜像、不打包再分发、不修改代码或原生组件

下载后：

- SHA256 校验
- 解压到目标目录
- 验证 `node.exe`、`index.mjs`、`launcher.bat`、`EULA.md`
- 保留官方 LICENSE/EULA 和 SnowLumaDevs 署名
- 不自动启动服务；WebUI 初始密码在首次启动/登录时生成

## 需要手动完成

- SnowLuma：可从官方 Releases 自动下载 Windows 完整包；首次启动后按官方 WebUI 登录流程配置
- DSH：安装官方桌面应用并完成首次启动
- qq-bridge：填写 `config.json` 的 DSH/SnowLuma/账号配置；bridge 首次启动自行生成 `state/console-token`
- 所有凭据由用户输入/本机生成，桌面只读取必要的本机凭据

## 已知限制

- DSH 的“一键安装”未实现，也不会用假成功状态伪装
- SnowLuma 自动安装只下载官方未修改完整包；不能修改代码/原生组件、自建镜像或打包再分发
- qq-bridge 源码内置，但依赖仍需 npm 联网安装；首次安装需要 Node/npm，UI 不保证成功
- 取消下载/安装会终止子进程并清理临时目录，但不删除已存在的用户目录
- 安装任务在应用异常退出后不会自动续跑；下次启动清理超过 24 小时的临时目录，需重新检测/重试

## 测试

```powershell
node --test test/environment.test.js
npm test
```
