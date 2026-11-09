# Dafiyu Control Center 1.1.9

## SnowLuma 更新卡住修复

- GitHub 下载连接超时从 120 秒缩短到 15 秒
- 减少重复轮次，避免在不可用通道上反复等待
- curl 连接超时 10 秒、单次总超时 300 秒
- 保留镜像回退和官方 SHA256 校验
- 更新失败后仍会恢复旧 SnowLuma

## 构建

```text
size: 123,477,915
sha256: 9C140E741EBF081F80267F3929E9B2F55945DEED480950D8BED7B61B07BADE95
```

本次仅本地构建和安装，未推送、未发布。
