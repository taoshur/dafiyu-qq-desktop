# B站活动与接入

## 这个页面解决什么

大肥鱼在 DSH 里调用 B 站 MCP 工具时，控制中心可以看到它最近看了什么，而不是只能从聊天里猜。

数据来源是 qq-bridge 的本地观看台账：

```text
<qq-bridge>/state/bili-watch.jsonl
```

它只在本机读取，不上传，不读取 B 站 cookie 原文。

## 页面内容

- 累计记录、今天记录、按 BV 去重的视频数
- 最近活动：时间、动作（看了视频/读了字幕）、标题、UP 主、时长、播放量、BV 号
- 接入状态：B 站 MCP 是否存在、DSH profile 是否已配置、本机是否已登录
- 侧边栏「B站活动」的未读数字
- 新活动提示：控制中心打开时轮询台账，有新记录会 toast 提醒

## 重要限制

当前 qq-bridge 的 B 站 MCP 只在这些操作写入台账：

- `bili_video_info`
- `bili_subtitle`

也就是说：

- 看视频详情、读字幕 → 能看到
- 只调用 `bili_hot_videos` / `bili_search` / `bili_rank` 看列表 → 可能不写入台账

这是上游工具的行为，桌面不会伪造记录。想记录更多动作，需要在 B 站 MCP 的对应工具里补 `_log_watch`。

## 让大肥鱼刷 B 站

前置条件：

- qq-bridge 已安装
- Python 3.10+
- `qq-bridge/tools/bilibili-mcp`
- DSH profile 中配置 B 站 MCP server

手动步骤：

1. 在 qq-bridge 下创建独立 venv：

```powershell
cd <qq-bridge>
python -m venv tools\bili-venv
tools\bili-venv\Scripts\python.exe -m pip install -r tools\bilibili-mcp\requirements.txt
```

2. 在 DSH profile 的 `cordis.patch.yml` 增加 MCP server：

```yaml
- insert:
    - id: mcp-bilibili
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: bilibili
        transport: stdio
        command: '<qq-bridge>\tools\bili-venv\Scripts\python.exe'
        args:
          - '<qq-bridge>\tools\bilibili-mcp\mcp_server.py'
        env:
          BILI_MCP_TOOLS: 'bili_search,bili_video_info,bili_subtitle,bili_comments,bili_danmaku,bili_hot_videos,bili_weekly_hot,bili_rank,bili_hot_buzzwords,bili_video_zones,bili_user_info,bili_user_videos,bili_reply,bili_login,bili_login_check,bili_check_credential,bili_received_replies,bili_received_at_and_likes'
        toolCallTimeoutMs: 127000
```

3. 重启 DSH，让大肥鱼测试：

```text
bili_hot_videos
bili_search
```

4. 需要字幕、评论、回复时，让大肥鱼调用 `bili_login` 生成二维码，你自己扫码，再调用 `bili_check_credential`。

不要：

- 把 cookie、SESSDATA、二维码内容发给其他人
- 把 B 站凭据提交到仓库
- 用未知镜像安装 B 站 MCP

## 安全边界

- 控制中心只读 `bili-watch.jsonl`
- 不读取 cookie 原文，只判断凭据字段是否存在
- 不自动修改 DSH 的 `cordis.patch.yml`
- 不自动发评论、不自动登录、不代替用户扫码
- 不把观看记录上传
