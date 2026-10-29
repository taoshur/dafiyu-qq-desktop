# Dafiyu Control Center 0.7.1

本版本修正 B 站活动统计不准确的问题。

## 原因

旧版 B 站 MCP 只记录：

- `bili_video_info`
- `bili_subtitle`

热榜、搜索、排行、评论、弹幕、UP 主视频等动作没有写台账，所以“鱼在刷 B 站，但统计只有几个视频”。

## 修复

新版内置 B 站 MCP 会把以下动作写入本地台账：

- 搜索 `bili_search`
- 热榜 `bili_hot_videos`
- 排行 `bili_rank`
- 每周必看 `bili_weekly_hot`
- 热搜 `bili_hot_buzzwords`
- 评论 `bili_comments`
- 弹幕 `bili_danmaku`
- 视频详情 `bili_video_info`
- 字幕 `bili_subtitle`
- UP 主信息 / 投稿
- 收藏夹

## 新的统计口径

- **累计动作 / 今天动作**：每次调用都算一条
- **看过的视频**：只统计带 BV 号的记录，并按 BV 去重
- 同一视频看详情 + 读字幕 = 2 个动作，但只算 1 个视频
- 搜索/热榜不会虚增“视频数”
- 旧版历史记录不会补全；升级后新动作才会记录

## 注意

需要重启 DSH，让 B 站 MCP 重新加载新的 `mcp_server.py`。只重启控制中心不够。

## 验证

- B 站台账测试 2/2 通过
- Python `mcp_server.py` 编译通过
- 动作类型、BV 去重、未读计数测试通过

## SHA256

```text
6684B405572B8C9E2767470977E91C1AAE138C91D07084A6CBD941A07EB5E297
```
