# Dafiyu Control Center 1.1.8

## SnowLuma 下载优化

- 保留 GitHub 官方下载地址
- GitHub Release 资源 TLS 失败时，自动尝试镜像通道
- 镜像下载后仍使用官方 Release 的 SHA256 校验
- 移除了可能造成下载失败的 curl 断点续传参数
- 下载错误会保留更多 curl 诊断信息

当前使用的回退顺序：

1. GitHub 官方浏览器下载地址
2. GitHub API asset 地址
3. gh-proxy 镜像
4. ghproxy.net 镜像
5. moeyy 镜像

任何镜像下载的内容都必须与官方 SHA256 一致，否则拒绝更新。

## 构建

```text
size: 123,477,882
sha256: 989B20CE63C66E8A837FADFAE2D017256ECBBE8C6BC87ADCF4B8CA723D4703B3
```

本次仅本地构建和安装，未推送、未发布。
