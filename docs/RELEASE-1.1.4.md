# Dafiyu Control Center 1.1.4

## 新版 DSH 图片兼容

新版 DSH 的 `session/prompt` 图片块要求：

```text
mediaType
```

旧版 DSH 使用：

```text
mimeType
```

桥接现在会：

- 先按新版 `mediaType` 发送
- 如果返回 `input-invalid / boundary validation`
- 且本次包含图片
- 自动改用旧版 `mimeType` 重试

因此新版 DSH 和上一版 DSH 都可以继续使用图片。

纯文字消息不受影响。  
MCP 图片工具仍使用 `mimeType`，与 DSH 会话字段分开。

如果旧版 DSH 完全不支持图片输入，文字仍可用，但图片无法识别。

## qqbridge 组件

```text
qq-bridge-0.2.0-r4-custom.8.zip
size: 1,608,125
sha256: E492998A5A8BC61B1F20E06B027B0A31BBC8C81090A9C38E47CBA5E1D99797DC
```

包含 DSH 新旧图片字段兼容、好友自动审核、QZone 失败退避。

## 构建

```text
管理器
size: 123,477,071
sha256: 63AE59AF2FA33806A04A735050E62AC4FBFEBD73FC2D8BDB973A0D8D6A0707A4
```
