# Dafiyu Control Center 1.1.10

## SnowLuma 更新进度

- 新增下载进度条
- 显示当前通道、已下载大小/总大小和百分比
- 显示校验、解压、停止服务、替换、启动等阶段
- 切换通道时显示当前正在尝试的镜像
- 下载超时更快失败，避免长时间无反馈

## 下载顺序

1. GitHub 官方
2. gh-proxy 镜像
3. ghproxy.net 镜像
4. moeyy 镜像
5. GitHub API

镜像下载仍使用官方 SHA256 校验。

## 构建

```text
size: 123,478,647
sha256: 9EF94016CC6C8CC3D9B3E0577D528868A61482815C0CAC7D8CA47F8FE3231D75
```

本次仅本地构建和安装，未推送、未发布。
