# 语音能力速查（VOICE）

本文覆盖三类「声音」相关能力：**AI 替自己发语音**、**听别人的语音**、**听电脑/模拟器的声音**。
它们默认都是关的或需要显式配置——弄出声响比打字重得多，先把闸门说清楚。

## 1. AI 发语音（桥接内置）

| 工具 | 作用 | 实现 |
| --- | --- | --- |
| `qq_say` | 用 TTS 说一句话（最多 60 字），可加 RVC 音色 | 云端 TTS → 可选 RVC → 语音条 |
| `qq_sing` | 用 RVC 音色翻唱语音库里的歌 | 语音库音频 → RVC → 语音条 |
| `qq_send_voice` | 直接发语音库（`audio/`）里现成的文件 | 只允许库内文件 |

配置在 `config.json` 的 `socialV2.voice`：

```json
{
  "enabled": true,          // AI 发语音的总开关；出厂是 false（默认是关的）
  "dir": "audio",           // 语音库目录
  "maxSeconds": 300,
  "maxBytes": 20971520,
  "maxPerMinute": 2,
  "maxPerHour": 10,
  "allowAbsolutePath": false
}
```

安全边界：

- 只能发 `voice.dir` 里的文件，绝对路径默认拒绝（防 prompt injection 拿任意本地文件外发）
- 每条/每小时限流；超限直接拒绝
- 发送前做响度归一（`loudness`）与音量控制（`defaultVolume`）

RVC 音色在 `socialV2.rvc`：`enabled=false` 时 `qq_say(timbre="vox")` 与 `qq_sing` 会被拒绝，
只剩云端 TTS 音色（`timbre="qwen"`）。

## 2. 听别人的语音（ASR）

QQ 语音消息（SILK）由桥接落盘后交给 `tools/voice2text.py`：

```
SILK → pilk 解码 → WAV → faster-whisper(small, int8) → 文本
```

- 结果以 `[语音] xxx` 进入消息文本，唤醒判断用的是转写后的正文
- `local_files_only=True` + `HF_HUB_OFFLINE=1`：模型已缓存，不联网探测（否则每次白等 40 秒）
- `PYTHONIOENCODING=utf-8`：避免 GBK 乱码
- 带热词（大肥鱼/小鲸鱼/深度求索/DeepSeek）提升人名识别；听音乐/视频时用 `--plain` 关闭热词，避免纯音乐被硬拗成名字

## 3. 听电脑 / 模拟器的声音（android_listen）

模拟器的声音走系统默认播放设备。`mcp__android__android_listen(seconds)` 会：

1. 把默认播放设备临时切到 `CABLE Input (VB-Audio Virtual Cable)`
2. 从 `CABLE Output` 录 N 秒（ffmpeg dshow）
3. **立刻切回**原设备（否则用户会莫名没声音）
4. 交给 `voice2text.py --plain` 转文字

前提：装 VB-CABLE 虚拟声卡（`CABLE Input` / `CABLE Output` 两个端点）。
听的那几秒电脑会静音，属于正常现象。

## 4. 独立发语音工具（不在本仓库）

`voice-tool/` 是与本仓库同级（`../voice-tool/`）的独立工具，共用 `src/` 里的语音内核：

- **图形界面**：`voice-gui.mjs`（浏览器面板，试听/选音色/发送）
- 命令行：`voice-cli.mjs`
- Windows 启动器：`发语音-图形界面.cmd`

找不到时会跳过相关断言：

```powershell
$env:QQ_BRIDGE_VOICE_TOOL_DIR = 'D:\path\to\voice-tool'
```

## 5. 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `qq_say` 报「语音功能已关闭」 | `socialV2.voice.enabled=false` | 打开后重启桥接（或等 MCP 重读配置） |
| `timbre="vox"` 报 RVC 已关闭 | `socialV2.rvc.enabled=false` | 打开，或改用 `qwen` |
| 语音转写很慢 | 模型联网探测 | 确认 `HF_HUB_OFFLINE=1` |
| 转写是乱码 | stdout 编码 | 确认 `PYTHONIOENCODING=utf-8` |
| `android_listen` 报找不到设备 | 没装 VB-CABLE | 装虚拟声卡后重试 |
| 听声音后电脑没声音 | 设备没还原 | 检查 `AudioDeviceCmdlets` 是否可用；工具已做 finally 兜底 |
