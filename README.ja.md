# Dafiyu Control Center

**English** | [简体中文](README.zh-CN.md) | **日本語** | [Français](README.fr.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <b>SnowLuma + qq-bridge + DeepSeek Harness を Windows で管理するデスクトップ制御盤。</b><br/>
  QQ エージェントの起動、監視、メモリ審査、バックアップを 1 か所で行えます。
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/taoshur/dafiyu-qq-desktop?label=release" />
  </a>
  <a href="LICENSE">
    <img alt="License: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange" />
  </a>
  <img alt="Platform: Windows 11 x64" src="https://img.shields.io/badge/platform-Windows%2011%20x64-blue" />
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest"><b>ダウンロード</b></a>
  ·
  <a href="#クイックスタート">クイックスタート</a>
  ·
  <a href="#機能">機能</a>
  ·
  <a href="#ライセンス">ライセンス</a>
</p>

---

## これは何か

Dafiyu Control Center は、セルフホスト型 QQ エージェント構成のための **Windows 専用デスクトップ制御盤**です。

```text
SnowLuma      QQ ランタイム / OneBot ゲートウェイ
qq-bridge     メッセージ処理、メモリ、ツール、エージェント連携
DSH           DeepSeek Harness（エージェントホスト）
```

これらを置き換えるものではありません。次の機能を追加します。

- サービスの起動・停止・再起動（所有権チェック付き）
- ポート、ログ、ヘルス、復旧状態の確認
- 長期メモリの閲覧・審査・編集
- 日記と人格成長の閲覧
- Bilibili 活動記録
- SQLite の一貫性バックアップ
- SnowLuma WebUI と qq-bridge コンソールの埋め込み

UI は現在中国語です。この README は海外ユーザー・レビュー用です。

---

## ダウンロード

現在のリリース：**v1.2.1**

```text
Installer: Dafiyu-Control-Center-Setup.exe
Size:      153,091,291 bytes
SHA256:    DBDFC32B7D37242212BFAF0A6A034A3060784DEBF0BD660C2E8D8D78E592BEDA
```

インストーラーは未署名です。Windows SmartScreen の警告が出る場合があります。

---

## インストーラーに含まれるもの

- Dafiyu Control Center
- qq-bridge のソース
- SnowLuma 2.4.0 ランタイム（`index.mjs`、`client`、`native`、`node.exe`、EULA/PRIVACY）

含まれないもの：

- DeepSeek Harness（DSH）
- SnowLuma の `config/`、`data/`、`logs/`
- QQ のログイン状態、Cookie、認証情報
- qq-bridge の `config.json`、`state/`、`roles/`

初回起動時、`~/SnowLuma` にランタイムがなければ同梱ランタイムをコピーします。既存の SnowLuma ディレクトリは上書きしません。

SnowLuma ランタイムは SnowLumaDevs の別途許可に基づいて同梱しています。SnowLuma 自体には公式 EULA / Source-Available Non-Commercial License が適用されます。

---

## クイックスタート

1. 最新のインストーラーを実行します。
2. DSH を別途インストールし、ログインします。
3. SnowLuma を起動し、`http://127.0.0.1:5099` で初回設定と QQ ログインを行います。
4. マネージャーで `ownerQQ`、許可する会話、DSH と SnowLuma の接続情報を設定します。
5. `SnowLuma → DSH → qq-bridge` の順に起動します。

qq-bridge のソースは同梱されていますが、初回初期化時に `npm install` が必要な場合があります。

---

## 機能

- サービス制御と復旧
- 長期メモリ（facts / events / candidates）
- メモリの手動編集、論理削除、復元、監査
- 人格成長の候補審査
- 日記
- 友だち申請の安全な自動承認
- QQ 空間の監視・いいね・コメント
- Bilibili 活動記録
- ステッカー、音声、歌唱
- Android エミュレーター制御（任意）
- ダーク / ライト / システム連動テーマ
- 初回セットアップウィザードとガイド

---

## 互換性

- Windows 11 x64
- SnowLuma 2.x
- qq-bridge 同梱ソース
- DSH は別途インストール
- Node.js は qq-bridge の依存関係を初期化する場合に必要

### SnowLuma の更新

上流の SnowLuma リポジトリはクローズドソースになったため、マネージャーは SnowLuma のオンライン更新を行いません。

インストーラーには固定の SnowLuma 2.4.0 ランタイムが含まれます。更新する場合は、サービスを停止してランタイムを手動で置き換え、`config/` と `data/` を保持してください。

qq-bridge コンポーネントの更新は引き続き利用できます。

---

## ライセンス

このプロジェクト自身のコードは **PolyForm Noncommercial License 1.0.0** で公開されています。

- 非商業利用のみ
- 個人の学習、研究、非商業セルフホスト、改変は許可
- 商業利用、有料ホスティング、商用製品への組み込みは禁止
- OSI のオープンソースライセンスではなく、source-available / noncommercial です

詳細は [LICENSE](LICENSE) を参照してください。

- qq-bridge は MIT。通知は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に保持しています。
- SnowLuma は独自の EULA / Source-Available Non-Commercial License に従います。
- DSH、キャラクター素材、その他の依存関係はこのプロジェクトのライセンス対象外です。

---

## リンク

- [Latest release](https://github.com/taoshur/dafiyu-qq-desktop/releases/latest)
- [Issues](https://github.com/taoshur/dafiyu-qq-desktop/issues)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [English README](README.md)
- [中文 README](README.zh-CN.md)
