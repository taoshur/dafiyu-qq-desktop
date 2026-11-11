# Dafiyu Control Center

**English** | [简体中文](README.zh-CN.md)

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
