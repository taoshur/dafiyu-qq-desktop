# Dafiyu Control Center 0.1.0

Windows desktop control center for **SnowLuma + qq-bridge + DeepSeek Harness**.

## 安装包

- `Dafiyu-Control-Center-Setup.exe`
- Windows 11 x64
- 未签名；首次运行可能出现 SmartScreen 提示

## 包含

- 三件套状态检测与受控启停（默认关闭真实控制）
- 启动/恢复开关、恢复引擎、BusyGuard、watchdog 协调
- 日志、环境检查、SQLite 一致性备份与恢复演练
- Memory V3 生产库只读浏览；隔离测试库候选审核
- SnowLuma WebUI / qq-bridge 控制台内嵌
- 首次设置分步向导

## 不包含

- SnowLuma、qq-bridge、DSH 的源码、二进制或账号
- 任何 API Key、QQ 登录态、聊天记录
- 角色原图；安装包内为中性占位图标

## 首次使用

1. 先安装并配置 SnowLuma、qq-bridge、DSH。
2. 启动控制中心，按首次设置向导操作。
3. SnowLuma 首次使用需要 WebUI 密码；qq-bridge 控制台令牌由本机自动生成，内嵌页面不需要手输。
4. 真实服务控制默认关闭，需要在服务页显式开启。

## 许可

本项目代码使用 **PolyForm Noncommercial License 1.0.0**：
仅允许非商业用途；详见 `LICENSE`。

- 上游 qq-bridge：MIT，见 `THIRD_PARTY_NOTICES.md`
- SnowLuma：SnowLumaDevs 所有，适用其自身 LICENSE/EULA
- 本项目已于 2026-10-29 获得 SnowLumaDevs 的书面授权，在非商业范围内启动/停止用户自行安装的官方 SnowLuma、并内嵌访问本机 WebUI；不包含修改、打包或再分发 SnowLuma
- DSH 为外部依赖，见其自身许可

## SHA256

```text
7C494DA351F46D4D666A2D890294435EB29AC3412F7D8FF719D85F65BA5900BD
```
