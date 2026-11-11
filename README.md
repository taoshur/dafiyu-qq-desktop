# Dafiyu Control Center

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <b>A Windows desktop control plane for SnowLuma + qq-bridge + DeepSeek Harness.</b><br/>
  Run, observe, review and back up a self-hosted QQ agent from one place.
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/taoshur/dafiyu-qq-desktop?label=release" />
  </a>
  <a href="LICENSE">
    <img alt="License: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange" />
  </a>
  <img alt="Platform: Windows 11 x64" src="https://img.shields.io/badge/platform-Windows%2011%20x64-blue" />
  <img alt="Runtime: Electron" src="https://img.shields.io/badge/runtime-Electron%2045-47848f" />
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest"><b>Download</b></a>
  ·
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#architecture">Architecture</a>
  ·
  <a href="#license">License</a>
</p>

---

## What is this?

Dafiyu Control Center is a **Windows-only desktop control center** for a self-hosted QQ agent stack:

```text
SnowLuma      QQ runtime and OneBot gateway
qq-bridge     message bridge, memory, tools and agent orchestration
DSH           DeepSeek Harness, the agent host
```

It does **not** replace those projects. It adds a local control plane around them:

- start/stop/restart services with ownership checks
- health, ports, logs and recovery visibility
- review and edit long-term memory
- read diaries and personality growth
- inspect Bilibili activity
- create consistent SQLite backups
- embed the SnowLuma WebUI and qq-bridge console

The UI is in Chinese. This English README is provided for international users and reviewers.

---

## Download

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest">
    <img alt="Download the latest release" src="https://img.shields.io/badge/Download-Latest%20Release-2ea44f?style=for-the-badge" />
  </a>
</p>

Current release: **v1.2.1**

```text
Installer: Dafiyu-Control-Center-Setup.exe
Size:      153,091,291 bytes
SHA256:    DBDFC32B7D37242212BFAF0A6A034A3060784DEBF0BD660C2E8D8D78E592BEDA
```

The installer is currently unsigned. Windows SmartScreen may show a warning.

---

## What is included

The Windows installer contains:

- Dafiyu Control Center
- qq-bridge source
- SnowLuma 2.4.0 runtime (`index.mjs`, `client`, `native`, `node.exe`, EULA/PRIVACY)

It does **not** contain:

- DeepSeek Harness (DSH)
- SnowLuma `config/`, `data/`, or `logs/`
- QQ login state, cookies or credentials
- qq-bridge `config.json`, `state/`, or `roles/`

On first launch, if `~/SnowLuma` does not contain a runtime, the manager copies the bundled runtime there. An existing SnowLuma directory is left untouched.

The SnowLuma runtime is bundled under a separate permission from SnowLumaDevs. SnowLuma remains subject to its own EULA / Source-Available Non-Commercial License.

---

## Requirements

- Windows 11 x64
- DeepSeek Harness installed and configured separately
- A QQ account for SnowLuma login
- Node.js 22+ when initializing qq-bridge dependencies from source
- Local ports 5099, 3000, 3001, 3100 and 3080 available

The installer includes the SnowLuma runtime and qq-bridge source, but not DSH, QQ credentials or user configuration.

---

## Quick start

### 1. Install the manager

Download and run the latest installer.

### 2. Install DSH separately

DSH is not bundled. Install and sign in to DeepSeek Harness first.

### 3. Start SnowLuma

The manager deploys the bundled runtime to `~/SnowLuma` on first launch.

Open:

```text
http://127.0.0.1:5099
```

Complete the SnowLuma first-run flow and sign in to QQ.

### 4. Configure qq-bridge

Start the manager and open the setup wizard or configuration page. Fill in at least:

```text
ownerQQ
allow.private / allow.groups
dsh.baseUrl / dsh.authToken
snowluma.httpUrl / wsUrl / accessToken
```

qq-bridge source is bundled, but its dependencies may need `npm install` on first initialization.

### 5. Start the stack

In the manager, enable real service control, then start:

```text
SnowLuma → DSH → qq-bridge
```

Check the service page and logs until all required ports are ready.

---

## Features

### Service control

- Start, stop and restart SnowLuma, DSH and qq-bridge in dependency order
- Only stops processes owned by this manager
- Health checks, port checks and recovery state
- Read-only log tailing with source switching

### Long-term memory

- Browse facts, events and pending candidates
- Search by content, person, date and status
- Review candidates with explicit production unlock
- Edit, create, soft-delete and restore confirmed facts/events
- Audit log for manual changes
- View personality traits, growth candidates and growth journal

### Memory safety

- Production memory is read-only by default
- Review actions require an explicit unlock and expire automatically
- Manual edits are marked and protected from automatic overwrite
- Soft delete instead of physical deletion
- SQLite `VACUUM INTO` backups with manifest/SHA256 validation

### Agent companion features

- Diary: the agent decides when to write; no fixed schedule
- Personality growth review
- Friend request automation with safe keyword filtering
- QQ Space feed watching, likes/comments/replies
- Bilibili activity ledger
- Sticker, voice and singing integrations
- Android emulator control tools (optional)

### Desktop experience

- Dark / light / follow-system themes
- Embedded SnowLuma WebUI and qq-bridge console
- First-run setup wizard
- Guided onboarding with spotlight highlights
- Update checks for the manager and qq-bridge component
- Tray behavior: closing the window keeps services running

---

## Recent updates

- **1.2.1** — Bundled SnowLuma runtime; removed the closed-source SnowLuma online updater
- **1.1.11** — Installer bundles SnowLuma; first-run deployment
- **1.1.4** — New/old DSH image-field compatibility
- **1.1.3** — Growth candidate review; production unlock expiry fix
- **1.1.1** — Confirmed fact/event create, edit, soft delete, restore and audit
- **1.0.11** — Safe friend approval and whitelist handling

---

## Detailed feature matrix

| Page / area | What it does | Boundary |
|---|---|---|
| Overview | Service ports/PIDs, QQ chain, Memory V3/V4 counts, database integrity, model and uptime | Read-only display |
| Services | Start/stop/restart SnowLuma → DSH → qq-bridge; ownership and recovery view | Real control is off by default; only manager-owned processes are stopped |
| Web services | Embedded SnowLuma WebUI (5099) and qq-bridge console (3100) | Loopback only; isolated `WebContentsView` |
| First setup | Step-by-step wizard, owner title, SnowLuma bootstrap password, deployment prompt | Password is passed once as an environment variable and not written to disk |
| Environment install | Detect SnowLuma / qq-bridge / DSH, dependencies, paths, ports and official sources | SnowLuma runtime is bundled; qq-bridge source is bundled; DSH is manual |
| Startup & recovery | Login autostart, bot autostart and auto-recovery as three independent switches | All off by default; external instances are never taken over |
| Runtime logs | Read-only tail, source switching, follow mode, copy diagnostics | No deletion/truncation; sensitive values are redacted |
| Environment check | Node, directories, config, dependencies, writable state and port preflight | Read-only; no automatic repair |
| Configuration | Paths, owner title, control and recovery switches; non-secret fields only | Tokens, cookies and API keys are never returned to the UI |
| Long-term memory | Browse/search facts, events and candidates; evidence, confidence, time precision, quality; production review; MaiBot import | Production is read-only by default; review requires explicit unlock; import only creates pending candidates |
| Bilibili activity | Search, hot list, rankings, video details, subtitles, comments, danmaku; unread hint; dedupe by BV | Reads local JSONL only; never uploads |
| Data backup | SQLite `VACUUM INTO` snapshots, manifest/SHA256, restore drill, retention | Only deletes `desktop-*` backups created by this app |
| About | Version, architecture, licenses, data paths and update entry | No account credentials |

### qq-bridge / DSH capabilities

- **Fast path** — short plain text goes to an OpenAI-compatible model; complex/media/tool requests fall back to the DSH agent
- **DSH image-field compatibility** — new DSH uses `mediaType`; old DSH uses `mimeType`; the bridge retries the old field after boundary validation fails
- **Diary** — `qq_diary_context` / `qq_diary_write`; no fixed schedule; never auto-sends to QQ
- **Friends and whitelist** — safe friend requests can be auto-approved and are immediately whitelisted
- **Stickers** — auto-fill, library sync, collect, annotate and send by context
- **Memory V3/V4** — ingest, batched extraction, quality filters, concept expansion, multi-signal recall and reversible archiving
- **Memory evaluation** — `npm run eval:memory`; sanitized baseline across accuracy, ambiguity, time, cross-person, multi-turn and absent-event cases
- **Bilibili** — search, hot list, rankings, details, subtitles, comments, danmaku, uploaders and favorites
- **QQ Space** — feeds, likes, comments, replies, posting and signature changes
- **Voice / singing** — voice library, TTS and RVC covers; disabled by default and requires local models/audio
- **Android emulator** — screenshot, UI tree, tap, swipe, text, launch/close apps and controlled adb
- **Web search** — read-only `web_search` / `web_fetch`
- **Drawing / games** — optional MCP tools; availability depends on configuration

### DSH image compatibility

New DSH requires:

```text
session/prompt image block -> mediaType
```

Old DSH uses:

```text
mimeType
```

The bridge sends the new field first and retries with the old field when DSH returns `input-invalid` / `boundary validation` for a prompt containing images. Text-only messages are unaffected. MCP image tools still use `mimeType`.

### MCP tool reference

Actual availability is controlled by `socialV2.tools`, sticker/voice/RVC settings and the MCP configuration. Use `qq_get_prompt` → `enabledTools` at runtime.

Implementation paths:

- QQ/host tools: `src/mcp-snowluma-safe.js`
- Android: `src/mcp-android.js`
- Web search: `src/mcp-web-search-safe.js`
- Bilibili: `tools/bilibili-mcp/mcp_server.py`

**QQ reads**  
`qq_status`, `qq_list_groups`, `qq_get_group_members`, `qq_get_group_history`, `qq_get_prompt`, `qq_get_unread_messages`, `qq_get_recent_messages`, `qq_get_my_recent_messages`, `qq_get_message_detail`, `qq_get_active_members`, `qq_social_state`, `qq_get_forward_msg`, `qq_get_message_images`

**QQ send and interaction**  
`qq_send_group_message`, `qq_send_private_message`, `qq_reply`, `qq_send_burst`, `qq_send_message`, `qq_send_poke`, `qq_send_image`, `qq_send_image_data`, `qq_set_poke_style`

**Wake and read state**  
`qq_mark_read`, `qq_set_wake_config`, `qq_wait_for_messages`

**Memory and slang**  
`qq_memory_append`, `qq_memory_query`, `qq_memory_remove`, `qq_memory_clear`, `qq_slang_query`, `qq_slang_submit`

**Diary**  
`qq_diary_context`, `qq_diary_write`

**Stickers**  
`qq_list_stickers`, `qq_get_sticker_image`, `qq_send_sticker`, `qq_collect_sticker`, `qq_sticker_note`, `qq_set_sticker_remark`

**Voice and singing**  
`qq_list_voices`, `qq_send_voice`, `qq_say`, `qq_sing`

**QQ Space and friends**  
`qq_qzone_feeds`, `qq_qzone_detail`, `qq_qzone_like`, `qq_qzone_comment`, `qq_qzone_reply`, `qq_qzone_images`, `qq_post_qzone`, `qq_set_signature`, `qq_handle_friend_request`, `qq_approve_friend_request`, `qq_whitelist_add`

**Drawing and host**  
`qq_draw`, `qq_get_self_image`, `snowluma_status`

**Android**  
`android_status`, `android_screenshot`, `android_ui`, `android_tap`, `android_swipe`, `android_key`, `android_batch`, `android_text`, `android_launch`, `android_close`, `android_packages`, `android_adb`, `android_listen`, `android_capture_share`

**Web search**  
`web_search`, `web_fetch`

**Bilibili read-only**  
`bili_check_credential`, `bili_search`, `bili_comments`, `bili_subtitle`, `bili_danmaku`, `bili_video_info`, `bili_crawl`, `bili_hot_videos`, `bili_hot_buzzwords`, `bili_weekly_hot`, `bili_rank`, `bili_video_zones`, `bili_user_info`, `bili_user_videos`, `bili_favorite_lists`, `bili_favorite_content`, `bili_unread_messages`, `bili_received_replies`, `bili_received_at_and_likes`

**Bilibili login/write/publish**  
`bili_login`, `bili_login_check`, `bili_reply`, `bili_send_dynamic`, `bili_upload_video`, `bili_upload_video_multi`, `bili_send_opus`, `bili_send_message`

Bilibili write actions require the user's own credentials; no cookies are bundled or uploaded.

---

## Memory V3 + V4

```text
QQ messages
  → qq-bridge ingest
  → messages table (dedupe/cursor)
  → extraction worker batches
  → candidate facts/events
  → manual review or optional auto-review
  → facts / events
  → V4 multi-signal recall
  → token-budgeted DSH context
```

Key properties:

- batched extraction with cursors, avoiding one model call per message
- candidates remain pending until reviewed or auto-approved
- provenance, confidence, quality and time precision are retained
- dedupe keys and batch keys provide idempotency
- `observeOnly=true` keeps production read-only unless auto-review is explicitly enabled
- automatic review is limited to safe fact/event candidates with source messages and sufficient confidence
- manual edits set `manual_override`, preventing automatic overwrite
- soft delete and audit allow recovery
- backups use `VACUUM INTO` and manifest/SHA256 validation

V4 recall combines recent messages, topic, people, time range, participants and keywords, then re-ranks by relevance, confidence, importance, recency and activity.

---

## Configuration and data

| Component | Default path | Notes |
|---|---|---|
| Manager data | `%APPDATA%\dafiyu-desktop` | Settings, logs, test DB |
| Manager config | `%APPDATA%\dafiyu-desktop\config\config.json` | Paths, theme, control switches |
| qq-bridge | `C:\Users\<user>\qq-bridge` | Bridge source and runtime |
| qq-bridge config | `<qq-bridge>\config.json` | Main user configuration |
| qq-bridge state | `<qq-bridge>\state` | Databases, logs, tokens |
| SnowLuma | `~/SnowLuma` | Runtime, config, data and logs |
| DSH profile | `%USERPROFILE%\.dsh\profiles\desktop` | Managed through DSH |

The minimum configuration includes:

```text
ownerQQ
allow.private / allow.groups
dsh.baseUrl / dsh.authToken
snowluma.httpUrl / wsUrl / accessToken
agentPreset
socialV2.enabled
```

Do not commit tokens, cookies, API keys, QQ login state or production memory to this repository.

---

## Development and build

```powershell
npm install
npm start
npm run build
```

Before building a release installer, place the official SnowLuma Windows runtime at `vendor/SnowLuma`. That directory is not committed to Git; the release installer bundles it.

The installer is unsigned. Windows SmartScreen may warn.

---

## Limitations

- DSH must be installed and configured separately.
- QQ login requires the SnowLuma WebUI and a QR-code login.
- The UI is currently Chinese.
- SnowLuma no longer has an online update path; update manually.
- The Bilibili MCP server and Android emulator tools depend on optional local configuration.
- This is a noncommercial, source-available project, not an OSI open-source project.

---

## Architecture

```text
┌─────────────────────────────────────────────┐
│ Dafiyu Control Center (Electron)            │
│ renderer (sandboxed)                        │
│   ↕ fixed preload allowlist                 │
│ main process                                │
│   supervisor · health · recovery · backup   │
│   memory · logs · embed · installer         │
└───────────┬───────────────────┬─────────────┘
            │                   │
   ┌────────▼────────┐   ┌──────▼────────────────────┐
   │ SnowLuma        │   │ qq-bridge / DSH           │
   │ 3000 / 3001     │   │ 3100 / local agent API    │
   │ 5099 WebUI      │   │ memory · tools · sessions │
   └─────────────────┘   └───────────────────────────┘
```

### Design boundaries

- The renderer has no Node.js, shell or arbitrary filesystem access
- The main process validates IPC, paths and service ownership
- The manager never silently upgrades the stack
- User data is never included in the installer
- Production memory writes are explicit and audited

---

## Memory pipeline

```text
QQ messages
  → qq-bridge ingest
  → extraction batches
  → candidate facts/events
  → manual review or optional auto-review
  → facts / events
  → V4 recall
  → token-budgeted context injection
```

The manager is an observer and reviewer, not a bypass around production writes.

---

## Compatibility

- **Windows 11 x64**
- SnowLuma 2.x runtime
- qq-bridge bundled source
- DeepSeek Harness installed separately
- Node.js is only required when initializing qq-bridge dependencies from source

### SnowLuma updates

The upstream SnowLuma repository is now closed-source. The manager no longer checks for SnowLuma component updates.

The installer ships a fixed SnowLuma 2.4.0 runtime. To upgrade SnowLuma later:

1. Stop SnowLuma and qq-bridge.
2. Replace the runtime directory.
3. Preserve `config/` and `data/`.
4. Start and verify ports 5099 / 3000 / 3001.

qq-bridge component updates remain available.

---

## Development

```powershell
npm install
npm start
```

Build the Windows installer:

```powershell
npm run build
```

Before building a release installer, place the official SnowLuma Windows runtime at:

```text
vendor/SnowLuma
```

That runtime directory is not committed to Git. The release installer bundles it.

---

## Data locations

```text
%APPDATA%\dafiyu-desktop        manager settings, logs, test database
<qq-bridge>\state\memory.db     production memory
<qq-bridge>\state\diary.db      diary
<qq-bridge>\state\bili-watch.jsonl  Bilibili activity
~/SnowLuma                      SnowLuma runtime, config, data, logs
```

No user data is included in the repository or installer.

---

## Security

- Real service control is disabled by default.
- Only processes started by this manager are stopped.
- Production memory review requires an expiring unlock.
- Tokens are never placed in URLs or logs.
- Credentials, QQ login state and chat history are not bundled.
- The embedded pages are restricted to loopback addresses.

---

## SnowLuma attribution

SnowLuma is developed by **SnowLumaDevs**:

- Project: https://github.com/SnowLuma/SnowLuma
- License: https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA: https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md

The Windows installer bundles the unmodified SnowLuma 2.4.0 runtime. The project has separate permission from SnowLumaDevs for this bundled distribution. SnowLuma remains subject to its own EULA / Source-Available Non-Commercial License. Keep the SnowLumaDevs attribution, official links and complete license texts when redistributing.

---

## License

This project's own code is released under the **PolyForm Noncommercial License 1.0.0**:

- Noncommercial use only
- Personal learning, research, noncommercial self-hosting and modification are allowed
- Commercial use, paid hosting/deployment, or inclusion in a commercial product is prohibited
- This is a source-available / noncommercial license, not an OSI open-source license

See [LICENSE](LICENSE).

Third-party notices:

- qq-bridge is MIT licensed; its notice is preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- SnowLuma is subject to its own EULA / Source-Available Non-Commercial License.
- DSH, character artwork and other third-party dependencies are not covered by this project's license.

For commercial licensing, contact the project maintainer separately.

---

## Links

- [Latest release](https://github.com/taoshur/dafiyu-qq-desktop/releases/latest)
- [Issues](https://github.com/taoshur/dafiyu-qq-desktop/issues)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [中文 README](README.zh-CN.md)
