# Dafiyu Control Center 1.1.11

## 安装包内置 SnowLuma 运行包

- 安装包现在包含 SnowLuma 2.4.0 运行包
- 首次运行管理器时，如果 `~/SnowLuma` 不存在，会自动复制运行包过去
- 已存在 SnowLuma 目录时不会覆盖
- 只复制运行文件，不包含 build 机器的 `config/`、`data/`、`logs/`
- 用户仍需单独安装并配置 DSH
- SnowLuma 仍遵守其官方 EULA / Source-Available Non-Commercial License

## 构建

```text
size: 153,091,619
sha256: 83D7A7D22B0D7D614BD39F8192CFADC801423DE7BA171B598241112BE433AC7B
```

本次仅本地构建和安装，未推送、未发布。
