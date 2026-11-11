# Dafiyu Control Center

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Español](README.es.md) | **Deutsch** | [Português](README.pt-BR.md)

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
