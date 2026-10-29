# Architecture Baseline (Phase 0)

Date: 2026-10-29

## Release snapshot

- Version: 0.7.1
- Installer: `dist/Dafiyu-Control-Center-Setup.exe`
- SHA256: `6684B405572B8C9E2767470977E91C1AAE138C91D07084A6CBD941A07EB5E297`
- Test baseline before refactor: 161 tests passing
- UI: unchanged during Phase 0/1

## Runtime boundaries

```text
Renderer
  -> preload allowlist
  -> ipcMain handlers
  -> control / health / install / update / memory / backups
  -> SnowLuma / DSH / qq-bridge / local SQLite / GitHub
```

## IPC contract

- 48 invoke channels, frozen in `src/main/ipc/contracts.js`
- Channel names are stable; no UI-facing rename
- Every channel must be present in:
  1. `contracts.js`
  2. `ipc.js` registration
  3. `preload/index.js`

Contract test: `test/ipc-contracts.test.js`

## State domains

- Service runtime: `idle / starting / running / stopping / stopped / failed / unknown`
- Install task: `checking / downloading / installing / configuring / verifying / completed / failed / cancelled`
- Update task: independent download/verify/open-installer state
- Memory: production read-only / test DB review
- Bilibili: local JSONL activity, read-only

## Compatibility rules

- Keep existing channel names and payloads.
- Keep existing config directory and schema.
- Keep existing process ownership rules.
- Keep hidden VBS launch for SnowLuma/qq-bridge.
- Do not migrate/drop user data during refactor.

## Baseline artifacts to preserve

- `docs/RELEASE-0.7.1.md`
- `dist/Dafiyu-Control-Center-Setup.exe` (local build)
- Existing tests: service control, install, update, memory, Bilibili
