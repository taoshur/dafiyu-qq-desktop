# Dafiyu Control Center 0.4.0

本版本新增「B站活动」页面，解决“大肥鱼刷 B 站时看不到”的问题。

## 新增

- 侧边栏「B站活动」
- 只读本机观看台账：
  - 时间
  - 看了视频 / 读了字幕
  - 标题、UP 主、时长、播放量
  - BV 号
- 累计 / 今天 / 去重视频数
- 侧边栏未读数字
- 控制中心打开时轮询台账，新活动 toast 提醒
- 接入状态检测：
  - `tools/bilibili-mcp/mcp_server.py` 是否存在
  - DSH profile 是否发现 bilibili MCP
  - 本机是否已有 B 站登录凭证
- 可复制“接入 B 站”提示词，交给 DeepSeek / DSH 按现有环境配置
- 新增 `docs/BILIBILI.md`

## 限制

当前 qq-bridge 的 B 站 MCP 只在 `bili_video_info` / `bili_subtitle` 写观看台账：

- 看视频详情、读字幕：能看到
- 只看热榜、搜索、排行：可能不写台账

桌面不伪造记录，也不自动修改 DSH 的 `cordis.patch.yml`、不读取/展示 cookie、不代替用户扫码。

## 验证

- B站活动后端单测 2/2：台账读取、去重、未读、标记已读、cookie 不泄露
- 实际界面加载成功，能显示本机现有 3 条 B 站记录
- 环境/路径测试 9/9

## SHA256

```text
9CA723E25E4056A409BA9061E2D9E4D107BD1ECBAF9EAEA063F5DB57D751620C
```
