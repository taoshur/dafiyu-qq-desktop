# Dafiyu Control Center 0.3.0

本版本根据 SnowLumaDevs 2026-10-29 的补充书面授权，加入 SnowLuma 官方发行版自动下载与安装。

## 新增

- 「环境安装」页支持 SnowLuma 官方 Windows 完整包自动安装
- 安装前必须由用户勾选接受 SnowLuma LICENSE / EULA
- 固定官方来源 + SHA256：
  - `https://github.com/SnowLuma/SnowLuma/releases/download/v2.2.1/SnowLuma-v2.2.1-win-x64.zip`
  - `09A3FBBF42EA805C4D61B5E67BEC2A46EF341FA803F211D78C40796CB7F535DC`
- 下载官方未修改完整发行版，校验 SHA256、解压、验证 `node.exe/index.mjs/launcher.bat/EULA.md`
- 安装后不自动启动；WebUI 首次密码在首次启动/登录时生成
- 保留 SnowLumaDevs 署名、官方链接、LICENSE/EULA
- DeepSeek 提示词同步更新 SnowLuma 的授权边界

## 限制

- 仅非商业用途
- 不得修改 SnowLuma 代码或原生组件
- 不得自建镜像、打包再分发
- 不自动启动/登录；QQ 登录和 WebUI 初始密码仍需用户完成
- 未签名安装包可能触发 SmartScreen

## 验证

- SnowLuma 官方 win-x64 包实际下载、SHA256、解压、文件校验通过（隔离临时目录）
- 未经许可勾选时安装被拒绝
- 未启动 SnowLuma，未接触生产数据
- 环境检测单测 4/4

## SHA256

```text
8BF02C90418BD1A5031E12F4428687EDF0C19ED8762DEFC51B0E45E48C86C919
```
