# 发布到 GitHub

这个目录已经是**干净的源码副本**，不包含 `node_modules`、`dist`、`artifacts`、`cache`、用户数据或生产令牌。

## 1. 先确认

- [ ] 角色图片/图标是否有再分发权；没有就保留当前中性占位图
- [ ] `SnowLuma` / `DSH` 的许可证是否允许你引用其名称和外部调用方式
- [ ] 仓库里没有 `console-token`、`webui.json`、API Key、QQ 号、聊天记录
- [ ] 选择许可证（当前为 MIT，见 `LICENSE`）

## 2. 在 GitHub 创建空仓库

不要勾选 “Add a README / .gitignore / license”，因为本地已经有。

## 3. 本地初始化并推送

```powershell
cd C:\path\to\dafiyu-desktop-open-source
git init
git add .
git status
git commit -m "Initial open-source release"
git branch -M main
git remote add origin https://github.com/<your-name>/<repo>.git
git push -u origin main
```

推送前再看一眼：

```powershell
git status --short
git ls-files | Select-String -Pattern "token|webui|memory.db|artifacts|dist|node_modules"
```

应当没有输出。

## 4. 发布 Release

安装包不要提交进 Git 历史，放在 GitHub Releases：

```powershell
npm ci
npm run build
```

上传：

```text
dist/Dafiyu-Control-Center-Setup.exe
```

Release notes 建议写清楚：

- 不包含 SnowLuma / qq-bridge / DSH
- 首次安装需要设置 SnowLuma WebUI 密码
- qq-bridge 控制台令牌由本机自动生成
- 未签名安装包可能触发 SmartScreen

## 5. 建议的仓库设置

- Description：`Windows desktop control center for SnowLuma + qq-bridge + DeepSeek Harness`
- Topics：`electron`, `windows`, `qq-bot`, `snowluma`, `qq-bridge`, `desktop`
- 开启 Private vulnerability reporting
- 保护 `main` 分支，要求 CI 通过
