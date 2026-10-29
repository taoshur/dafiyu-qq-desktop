# 更新检查

控制中心从本项目 GitHub Releases 检查更新：

```text
https://api.github.com/repos/taoshur/dafiyu-qq-desktop/releases/latest
```

## 行为

- 启动后后台检查一次；有更新会 toast，并在页面顶部提示
- 「关于」页显示当前版本、最新版本、Release 说明入口
- 点「下载并打开安装包」：
  1. 从 Release 的 `Dafiyu-Control-Center-Setup.exe` 下载
  2. 校验 GitHub 提供的 SHA256
  3. 打开安装程序
  4. 不静默安装、不自动关闭当前窗口
- 安装完成后需要手动重启控制中心

## 安全与限制

- 只允许 `github.com` / `*.githubusercontent.com` 的 HTTPS 下载
- 只接受本项目 Release 的安装包
- 没有 Release 摘要时不会伪造校验结果
- 安装包未签名，SmartScreen 可能提示
- GitHub API 有匿名限流；失败时只显示错误，不影响控制中心其他功能
- 不做后台静默升级，避免在服务运行时替换程序

## 手动检查

「关于」→「检查更新」。
