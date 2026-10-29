# Dafiyu Control Center 0.2.0

本版本新增首次环境检测与 qq-bridge 源码安装向导。

## 新增

- 「环境安装」页面：检测 Windows/CPU、Node/npm/Git/Python、SnowLuma、qq-bridge、DSH
- 状态区分：未安装 / 已安装未配置 / 已配置未运行 / 正常运行 / 版本不兼容 / 未知
- qq-bridge 官方源码自动安装：
  - 固定 `v0.2.1-r1` 源码归档
  - SHA256 校验
  - 固定 `tar.exe` 解压
  - `npm install`
  - 初始化 `config.example.json`
  - 安装结果登记到 `state/install.json`
- 安装任务状态机、实时下载进度、日志、取消、失败重试
- 安装状态与服务运行状态分离
- SnowLuma / DSH 明确标注为手动安装，不伪造成功

## 限制

- SnowLuma EULA §5.4 限制自动部署/并入第三方安装包；本项目仅获授权启动/停止用户自行安装的官方 SnowLuma 与内嵌 WebUI，不自动安装、修改或再分发
- DSH 没有可验证的静默安装 Release 资产，只能手动安装和指引
- 安装 qq-bridge 依赖网络、npm 和上游依赖；未在用户网络/权限环境全面验证
- 未签名安装包可能触发 SmartScreen

## 验证

- 环境检测单测 4/4 通过
- 本机实际安装 qq-bridge `v0.2.1-r1`：下载、SHA256、解压、128 packages、配置初始化完成
- 未启动任何服务，未接触生产数据

## SHA256

```text
C0FB20BE3ED1A4760888FF5F91FE5B8C24B9C21C61230AFFE259F686971285B0
```
