# Dafiyu Control Center 0.8.3

针对 0.8.2 复审意见的修复版本。

## 修复

- 恢复租约接管增加原子 takeover guard，避免两个恢复者同时接管
- 更新包下载后复核字节数，继续要求完整 SHA256
- Memory 死信增加桌面只读列表与显式确认重试
- Windows 进程树/身份/终止增加真实子进程测试
- 保留 observeOnly 默认观察模式，不自动晋升候选

## 验证

- 195/195 测试通过
- Windows 实机进程测试通过
- `npm run verify:build`

## SHA256

```text
A5F6C535B9CFAFD5A1A246C85C8713D02A825BFA623D7C46BFDE74093CBC6351
```
