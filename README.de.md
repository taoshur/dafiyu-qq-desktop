# Dafiyu Control Center

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Español](README.es.md) | **Deutsch** | [Português](README.pt-BR.md)

<p align="center">
  <b>Eine Windows-Desktop-Konsole für SnowLuma + qq-bridge + DeepSeek Harness.</b><br/>
  Einen selbst gehosteten QQ-Agenten an einem Ort starten, überwachen, prüfen und sichern.
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest">
    <img alt="Neueste Version" src="https://img.shields.io/github/v/release/taoshur/dafiyu-qq-desktop?label=release" />
  </a>
  <a href="LICENSE">
    <img alt="Lizenz: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange" />
  </a>
  <img alt="Plattform: Windows 11 x64" src="https://img.shields.io/badge/platform-Windows%2011%20x64-blue" />
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest"><b>Herunterladen</b></a>
  ·
  <a href="#schnellstart">Schnellstart</a>
  ·
  <a href="#funktionen">Funktionen</a>
  ·
  <a href="#lizenz">Lizenz</a>
</p>

---

## Was ist das?

Dafiyu Control Center ist eine **Desktop-Konsole ausschließlich für Windows** für einen selbst gehosteten QQ-Agenten.

```text
SnowLuma      QQ-Laufzeit / OneBot-Gateway
qq-bridge     Nachrichten, Speicher, Werkzeuge, Orchestrierung
DSH           DeepSeek Harness, Agent-Host
```

Das Projekt ersetzt diese Komponenten nicht. Es ergänzt:

- kontrolliertes Starten, Stoppen und Neustarten von Diensten
- Ports, Logs, Gesundheits- und Wiederherstellungsstatus
- Anzeige und Prüfung des Langzeitspeichers
- Tagebuch und Persönlichkeitsentwicklung
- Bilibili-Aktivitätsprotokoll
- konsistente SQLite-Sicherungen
- eingebettete SnowLuma-WebUI und qq-bridge-Konsole

Die Oberfläche ist derzeit auf Chinesisch. Dieses README richtet sich an internationale Nutzer und Prüfer.

---

## Download

Aktuelle Version: **v1.2.1**

```text
Installer: Dafiyu-Control-Center-Setup.exe
Size:      153,091,291 bytes
SHA256:    DBDFC32B7D37242212BFAF0A6A034A3060784DEBF0BD660C2E8D8D78E592BEDA
```

Der Installer ist nicht signiert. Windows SmartScreen kann eine Warnung anzeigen.

---

## Enthalten im Installer

Enthalten:

- Dafiyu Control Center
- qq-bridge-Quellcode
- SnowLuma-2.4.0-Laufzeit (`index.mjs`, `client`, `native`, `node.exe`, EULA/PRIVACY)

Nicht enthalten:

- DeepSeek Harness (DSH)
- SnowLuma `config/`, `data/` oder `logs/`
- QQ-Anmeldestatus, Cookies oder Zugangsdaten
- qq-bridge `config.json`, `state/` oder `roles/`

Beim ersten Start kopiert der Manager die enthaltene Laufzeit nach `~/SnowLuma`, falls dort noch keine vorhanden ist. Ein vorhandenes SnowLuma-Verzeichnis wird nicht überschrieben.

Die SnowLuma-Laufzeit wird mit einer separaten Erlaubnis von SnowLumaDevs gebündelt. SnowLuma unterliegt weiterhin seiner eigenen EULA / Source-Available Non-Commercial License.

---

## Schnellstart

1. Manager mit dem neuesten Installer installieren.
2. DSH separat installieren und anmelden.
3. SnowLuma starten, `http://127.0.0.1:5099` öffnen und QQ anmelden.
4. Im Manager `ownerQQ`, erlaubte Chats und DSH-/SnowLuma-Verbindungsdaten eintragen.
5. In dieser Reihenfolge starten: `SnowLuma → DSH → qq-bridge`.

Der qq-bridge-Quellcode ist enthalten; bei der ersten Initialisierung kann `npm install` nötig sein.

---

## Funktionen

- Dienststeuerung und Wiederherstellung
- Langzeitspeicher (facts / events / candidates)
- Bearbeiten, logisches Löschen, Wiederherstellen und Auditieren des Speichers
- Prüfung von Persönlichkeits-Kandidaten
- Tagebuch
- Sichere automatische Annahme von Freundschaftsanfragen
- QQ-Space-Überwachung, Likes und Kommentare
- Bilibili-Aktivitätsprotokoll
- Sticker, Stimme und Gesang
- Android-Emulator-Steuerung (optional)
- Dunkles / helles / systemweites Design
- Einrichtungsassistent und interaktive Tour

---

## Kompatibilität

- Windows 11 x64
- SnowLuma 2.x
- qq-bridge-Quellcode enthalten
- DSH separat installiert
- Node.js für die Initialisierung der qq-bridge-Abhängigkeiten erforderlich

### SnowLuma-Updates

Das Upstream-Repository von SnowLuma ist inzwischen Closed Source. Der Manager prüft keine SnowLuma-Updates mehr.

Der Installer enthält eine feste SnowLuma-2.4.0-Laufzeit. Zum Aktualisieren Dienste stoppen, die Laufzeit manuell ersetzen und `config/` sowie `data/` erhalten.

qq-bridge-Komponentenupdates bleiben verfügbar.

---

## Letzte Updates

- **1.2.1** — SnowLuma-Runtime gebündelt; Online-Update für das geschlossene Upstream entfernt
- **1.1.11** — SnowLuma im Installer enthalten und beim ersten Start bereitgestellt
- **1.1.4** — Bildfeld-Kompatibilität für alte/neue DSH
- **1.1.3** — Prüfung von Wachstums Kandidaten; Ablauf der Production-Freigabe korrigiert
- **1.1.1** — bestätigte Fakten/Ereignisse erstellen, bearbeiten, logisch löschen, wiederherstellen, auditieren
- **1.0.11** — sichere automatische Freundschaftsanfragen und Whitelist

## Detaillierte Funktionsmatrix

| Seite / Bereich | Funktion | Grenze |
|---|---|---|
| Übersicht | Ports/PIDs, QQ-Kette, Memory-Zähler, DB-Integrität, Modell, Uptime | reine Anzeige |
| Dienste | Start/Stopp/Neustart SnowLuma → DSH → qq-bridge, Besitz und Wiederherstellung | echte Steuerung standardmäßig aus; nur Manager-Prozesse |
| Dienstseiten | SnowLuma WebUI (5099) und qq-bridge-Konsole (3100) eingebettet | nur Loopback; isolierte `WebContentsView` |
| Ersteinrichtung | Assistent, Besitzer-Titel, SnowLuma-Bootstrap-Passwort, Deployment-Prompt | Passwort einmalig per Umgebungsvariable, nicht gespeichert |
| Umgebungsinstallation | Erkennung SnowLuma / qq-bridge / DSH, Abhängigkeiten, Pfade, Ports | SnowLuma-Runtime und qq-bridge-Quellcode enthalten; DSH manuell |
| Start und Wiederherstellung | Login-Autostart, Bot-Autostart, Auto-Recovery, drei Schalter | alle aus; externe Instanzen werden nicht übernommen |
| Laufzeitlogs | Read-only-Tail, Quellenwechsel, Follow, Diagnose kopieren | kein Löschen/Kürzen; Secrets maskiert |
| Umgebungsprüfung | Node, Verzeichnisse, Konfiguration, Abhängigkeiten, beschreibbarer State, Ports | nur Lesen; keine Auto-Reparatur |
| Konfiguration | Pfade, Titel, Steuerung/Recovery, nicht geheime Felder | Tokens, Cookies, API-Keys nie in der UI |
| Langzeitspeicher | facts/events/candidates, Belege, Konfidenz, Zeitpräzision, Qualität, Review, MaiBot-Import | Production read-only; Review nach Freigabe; Import nur Kandidaten |
| Bilibili | Suche, Trends, Rankings, Details, Untertitel, Kommentare, Danmaku, Ungelesen, BV-Dedupe | nur lokale JSONL |
| Backups | SQLite `VACUUM INTO`, Manifest/SHA256, Restore-Übung, Aufbewahrung | löscht nur `desktop-*` dieser App |
| Über | Version, Architektur, Lizenzen, Pfade, Update | keine Zugangsdaten |

## qq-bridge / DSH-Funktionen

- **Fast Path** — kurzer Text an OpenAI-kompatibles Modell; Medien/Tools an DSH
- **DSH-Bildkompatibilität** — neues DSH: `mediaType`; altes: `mimeType`; Retry nach Boundary-Validation-Fehler
- **Tagebuch** — `qq_diary_context` / `qq_diary_write`, kein fester Zeitplan, nie automatisch an QQ
- **Freunde und Whitelist** — sichere Genehmigung und sofortige Aufnahme
- **Sticker** — Synchronisierung, Sammlung, Notizen, kontextbezogenes Senden
- **Memory V3/V4** — Ingest, Batch-Extraktion, Qualitätsfilter, Konzepterweiterung, Multi-Signal-Recall, reversibles Archivieren
- **Memory-Evaluation** — `npm run eval:memory` (Genauigkeit, Mehrdeutigkeit, Zeit, Personen, Multi-Turn, fehlende Ereignisse)
- **Bilibili** — Suche, Trends, Rankings, Details, Untertitel, Kommentare, Danmaku, UP, Favoriten
- **QQ Space** — Feeds, Likes, Kommentare, Antworten, Posten, Signatur
- **Stimme/Gesang** — Bibliothek, TTS, RVC; aus, lokale Modelle/Audio nötig
- **Android-Emulator** — Screenshot, UI-Baum, Tap, Swipe, Text, App-Start/-Ende, kontrolliertes adb
- **Websuche** — read-only `web_search` / `web_fetch`

## DSH-Bildkompatibilität

```text
Neues DSH : session/prompt image -> mediaType
Altes DSH : mimeType
```

Die Bridge sendet zuerst `mediaType` und wiederholt mit `mimeType`, wenn ein Prompt mit Bild `input-invalid` / `boundary validation` zurückgibt. Reine Textnachrichten sind nicht betroffen. MCP-Bildwerkzeuge verwenden weiterhin `mimeType`.

## MCP-Werkzeugreferenz

Die tatsächliche Verfügbarkeit hängt von `socialV2.tools`, Sticker-/Voice-/RVC-Einstellungen und der MCP-Konfiguration ab. Prüfe `qq_get_prompt` → `enabledTools`.

**QQ lesen**  
`qq_status`, `qq_list_groups`, `qq_get_group_members`, `qq_get_group_history`, `qq_get_prompt`, `qq_get_unread_messages`, `qq_get_recent_messages`, `qq_get_my_recent_messages`, `qq_get_message_detail`, `qq_get_active_members`, `qq_social_state`, `qq_get_forward_msg`, `qq_get_message_images`

**QQ senden und interagieren**  
`qq_send_group_message`, `qq_send_private_message`, `qq_reply`, `qq_send_burst`, `qq_send_message`, `qq_send_poke`, `qq_send_image`, `qq_send_image_data`, `qq_set_poke_style`

**Wecken und Lesen**  
`qq_mark_read`, `qq_set_wake_config`, `qq_wait_for_messages`

**Memory und Slang**  
`qq_memory_append`, `qq_memory_query`, `qq_memory_remove`, `qq_memory_clear`, `qq_slang_query`, `qq_slang_submit`

**Tagebuch**  
`qq_diary_context`, `qq_diary_write`

**Sticker**  
`qq_list_stickers`, `qq_get_sticker_image`, `qq_send_sticker`, `qq_collect_sticker`, `qq_sticker_note`, `qq_set_sticker_remark`

**Stimme und Gesang**  
`qq_list_voices`, `qq_send_voice`, `qq_say`, `qq_sing`

**QQ Space und Freunde**  
`qq_qzone_feeds`, `qq_qzone_detail`, `qq_qzone_like`, `qq_qzone_comment`, `qq_qzone_reply`, `qq_qzone_images`, `qq_post_qzone`, `qq_set_signature`, `qq_handle_friend_request`, `qq_approve_friend_request`, `qq_whitelist_add`

**Zeichnen und Host**  
`qq_draw`, `qq_get_self_image`, `snowluma_status`

**Android**  
`android_status`, `android_screenshot`, `android_ui`, `android_tap`, `android_swipe`, `android_key`, `android_batch`, `android_text`, `android_launch`, `android_close`, `android_packages`, `android_adb`, `android_listen`, `android_capture_share`

**Websuche**  
`web_search`, `web_fetch`

**Bilibili lesen**  
`bili_check_credential`, `bili_search`, `bili_comments`, `bili_subtitle`, `bili_danmaku`, `bili_video_info`, `bili_crawl`, `bili_hot_videos`, `bili_hot_buzzwords`, `bili_weekly_hot`, `bili_rank`, `bili_video_zones`, `bili_user_info`, `bili_user_videos`, `bili_favorite_lists`, `bili_favorite_content`, `bili_unread_messages`, `bili_received_replies`, `bili_received_at_and_likes`

**Bilibili Login/Schreiben/Veröffentlichen**  
`bili_login`, `bili_login_check`, `bili_reply`, `bili_send_dynamic`, `bili_upload_video`, `bili_upload_video_multi`, `bili_send_opus`, `bili_send_message`

Bilibili-Schreibaktionen benötigen eigene Zugangsdaten; Cookies werden nicht gebündelt oder hochgeladen.

## Memory V3 + V4

```text
QQ-Nachrichten
  → qq-bridge Ingest
  → messages-Tabelle (Dedupe/Cursor)
  → Batch-Extraktion
  → Fakt-/Ereignis-Kandidaten
  → manuelles Review oder optionales Auto-Review
  → facts / events
  → V4 Multi-Signal-Recall
  → DSH-Kontext mit Token-Budget
```

- Batch-Extraktion und Cursor
- Kandidaten bleiben bis zur Prüfung pending
- Herkunft, Konfidenz, Qualität und Zeitpräzision bleiben erhalten
- Idempotenz über `dedupe_key` / `batch_key`
- `observeOnly=true` hält Production read-only ohne explizites Auto-Review
- manuelle Änderungen setzen `manual_override`
- logisches Löschen und Audit mit Wiederherstellung
- Backup über `VACUUM INTO` + Manifest/SHA256

V4-Recall kombiniert aktuelle Nachrichten, Thema, Personen, Zeitraum, Teilnehmer und Keywords und sortiert nach Relevanz, Konfidenz, Wichtigkeit, Aktualität und Aktivität neu.

## Konfiguration und Daten

| Komponente | Standardpfad | Hinweis |
|---|---|---|
| Manager | `%APPDATA%\dafiyu-desktop` | Einstellungen, Logs, Test-DB |
| Manager-Konfiguration | `%APPDATA%\dafiyu-desktop\config\config.json` | Pfade, Theme, Steuerung |
| qq-bridge | `C:\Users\<user>\qq-bridge` | Quelle und Runtime |
| qq-bridge-Konfiguration | `<qq-bridge>\config.json` | Hauptkonfiguration |
| qq-bridge-State | `<qq-bridge>\state` | DB, Logs, Tokens |
| SnowLuma | `~/SnowLuma` | Runtime, Config, Data, Logs |
| DSH | `%USERPROFILE%\.dsh\profiles\desktop` | über DSH verwaltet |

Minimale Konfiguration:

```text
ownerQQ
allow.private / allow.groups
dsh.baseUrl / dsh.authToken
snowluma.httpUrl / wsUrl / accessToken
agentPreset
socialV2.enabled
```

Keine Tokens, Cookies, API-Keys, QQ-Anmeldestatus oder Production-Memory committen.

## Entwicklung und Build

```powershell
npm install
npm start
npm run build
```

Vor dem Release-Build die offizielle SnowLuma-Windows-Runtime nach `vendor/SnowLuma` legen. Das Verzeichnis wird nicht committet; der Release-Installer enthält es.

Der Installer ist nicht signiert; SmartScreen kann warnen.

## Einschränkungen

- DSH muss separat installiert und konfiguriert werden
- QQ-Login benötigt SnowLuma WebUI und QR-Code
- Die UI ist derzeit chinesisch
- SnowLuma hat kein Online-Update mehr; manuell ersetzen
- Bilibili MCP und Android hängen von optionaler lokaler Konfiguration ab
- Source-available-Noncommercial-Projekt, kein OSI-Open-Source

---

## Voraussetzungen

- Windows 11 x64
- DSH separat installiert und konfiguriert
- QQ-Konto für die SnowLuma-Anmeldung
- Node.js 22+ zum Initialisieren der qq-bridge-Abhängigkeiten
- Lokale Ports 5099 / 3000 / 3001 / 3100 / 3080 verfügbar

## Architektur

```text
Dafiyu Control Center (Electron)
  renderer (sandbox) → preload allowlist → main
  main: supervisor / health / recovery / backup / memory / logs / embed
        │
SnowLuma (5099 / 3000 / 3001)     qq-bridge / DSH (3100 / agent API)
```

- kein Node, Shell oder beliebiger Dateizugriff im Renderer
- IPC, Pfade und Prozessbesitz werden im Main geprüft
- externe Instanzen werden nur erkannt
- Production-Memory wird nur nach ausdrücklicher Aktion und Audit geändert

## SnowLuma-Attribution

SnowLuma wird von **SnowLumaDevs** entwickelt:

- https://github.com/SnowLuma/SnowLuma
- License: https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA: https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md

Der Windows-Installer enthält die unveränderte SnowLuma-2.4.0-Runtime. Für diese gebündelte Verteilung liegt eine separate Erlaubnis von SnowLumaDevs vor. SnowLuma unterliegt weiterhin seiner eigenen EULA / Source-Available Non-Commercial License. Bei der Weitergabe SnowLumaDevs-Attribution, offizielle Links und vollständige Lizenztexte beibehalten.

---

## Lizenz

Der eigene Code dieses Projekts steht unter der **PolyForm Noncommercial License 1.0.0**:

- nur nichtkommerzielle Nutzung
- persönliches Lernen, Forschung, nichtkommerzielles Self-Hosting und Änderungen erlaubt
- kommerzielle Nutzung, bezahltes Hosting oder Einbindung in kommerzielle Produkte verboten
- source-available / noncommercial, keine OSI-Open-Source-Lizenz

Siehe [LICENSE](LICENSE).

- qq-bridge ist MIT-lizenziert; der Hinweis ist in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) erhalten.
- SnowLuma unterliegt seiner eigenen EULA / Source-Available Non-Commercial License.
- DSH, Charakter-Assets und andere Abhängigkeiten sind nicht von der Projektlizenz abgedeckt.

---

## Links

- [Neueste Version](https://github.com/taoshur/dafiyu-qq-desktop/releases/latest)
- [Issues](https://github.com/taoshur/dafiyu-qq-desktop/issues)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [English README](README.md)
- [中文 README](README.zh-CN.md)
