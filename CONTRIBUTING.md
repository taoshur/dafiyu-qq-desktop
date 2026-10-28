# Contributing

感谢你愿意改进大肥鱼桌面控制中心。

## 开发环境

- Windows 11 x64
- Node.js 24（最低 22）
- 不需要启动真实的 SnowLuma / qq-bridge / DSH

```powershell
npm install
npm test
npm start
```

## 提交前

1. `npm test` 全部通过
2. 不提交任何真实 token、QQ 号、群号、聊天记录、`memory.db`
3. 不把 `artifacts/`、`dist/`、`cache/` 加入提交
4. UI 改动请附带截图；截图必须使用假数据或遮挡隐私
5. 涉及服务启停的改动必须说明：
   - 是否只停止本软件启动的进程
   - 身份校验是否仍然成立
   - 失败时是否回滚
   - 是否影响生产 `memory.db`

## 代码风格

- 主进程使用 CommonJS
- 文件读写、进程、SQLite 只在主进程
- 渲染进程只通过 preload 的 `window.dafiyu` 白名单 API
- 不新增远程 CDN、iframe 或 `webview`
- IPC 参数必须校验类型/白名单，不把路径、命令、token 直接透传

## 隐私

角色图片、群号、私聊内容、API Key 和 QQ 登录态都不应出现在 issue、PR 或测试夹具中。测试请使用 `fixtures/` 的假服务。
