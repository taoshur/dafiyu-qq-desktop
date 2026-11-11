# Dafiyu Control Center

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語** | [Français](README.fr.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

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

## 最近の更新

- **1.2.1** — SnowLuma ランタイムを同梱。クローズドソース化した SnowLuma のオンライン更新を削除
- **1.1.11** — インストーラーに SnowLuma を同梱し、初回起動時に配置
- **1.1.4** — 新旧 DSH の画像フィールド互換
- **1.1.3** — 人格成長候補の審査、本番アンロック期限切れ修正
- **1.1.1** — 確定した事実・イベントの追加、編集、論理削除、復元、監査
- **1.0.11** — 友だち申請の安全な自動承認とホワイトリスト

## 詳細機能一覧

| ページ / 領域 | できること | 境界 |
|---|---|---|
| 概要 | サービスのポート/PID、QQ 経路、Memory 件数、DB 整合性、モデル、稼働時間 | 表示のみ |
| サービス | SnowLuma → DSH → qq-bridge の起動/停止/再起動、所有権と復旧方針 | 実制御は既定でオフ。管理アプリが起動したプロセスだけ停止 |
| サービス Web | SnowLuma WebUI（5099）と qq-bridge コンソール（3100）を埋め込み | ループバックのみ。独立した `WebContentsView` |
| 初回設定 | ウィザード、呼び方、SnowLuma 初期パスワード、デプロイ用プロンプト | パスワードは一度だけ環境変数で渡し、保存しない |
| 環境インストール | SnowLuma / qq-bridge / DSH、依存、パス、ポート、公式ソースを検出 | SnowLuma ランタイムと qq-bridge ソースは同梱。DSH は手動 |
| 起動と復旧 | ログイン自启、ボット自启、異常時復旧の 3 スイッチ | 既定はすべてオフ。外部インスタンスは引き継がない |
| 実行ログ | 読み取り専用 tail、ソース切替、追従、診断コピー | 削除・切り詰めなし。機密値はマスク |
| 環境チェック | Node、ディレクトリ、設定、依存、state 書き込み、ポート事前確認 | 読み取り専用。自動修復なし |
| 設定 | パス、呼び方、制御/復旧スイッチ、非機密フィールド | トークン、Cookie、API Key は UI に返さない |
| 長期メモリ | facts/events/candidates の閲覧・検索、根拠、信頼度、時間精度、品質、本番審査、MaiBot インポート | 本番は既定で読み取り専用。審査は明示アンロック。インポートは保留候補のみ |
| Bilibili | 検索、急上昇、ランキング、動画詳細、字幕、コメント、弾幕、未読、BV 重複排除 | ローカル JSONL の読み取りのみ |
| バックアップ | SQLite `VACUUM INTO`、manifest/SHA256、復元演習、保持 | 本アプリが作った `desktop-*` のみ削除 |
| バージョン情報 | バージョン、構成、ライセンス、データパス、更新入口 | 認証情報なし |

## qq-bridge / DSH の機能

- **高速パス** — 短いプレーンテキストは OpenAI 互換モデルへ。複雑/メディア/ツールは DSH へフォールバック
- **DSH 画像互換** — 新 DSH は `mediaType`、旧 DSH は `mimeType`。境界検証失敗時に旧フィールドで再試行
- **日記** — `qq_diary_context` / `qq_diary_write`。固定スケジュールなし。QQ へ自動送信しない
- **友だちとホワイトリスト** — 安全な申請を自動承認し、即座にホワイトリストへ
- **ステッカー** — 自動補完、同期、収集、注釈、文脈に応じた送信
- **Memory V3/V4** — 取り込み、バッチ抽出、品質フィルタ、概念拡張、マルチシグナル召回、可逆アーカイブ
- **メモリ評価** — `npm run eval:memory`。正確性、曖昧性、時間、人物横断、複数ターン、存在しない出来事
- **Bilibili** — 検索、急上昇、ランキング、詳細、字幕、コメント、弾幕、UP 主、お気に入り
- **QQ 空間** — フィード、いいね、コメント、返信、投稿、署名
- **音声/歌唱** — 音声ライブラリ、TTS、RVC。既定はオフでローカルモデル/音声が必要
- **Android エミュレーター** — スクリーンショット、UI ツリー、タップ、スワイプ、入力、アプリ起動/終了、制御された adb
- **Web 検索** — 読み取り専用 `web_search` / `web_fetch`

## DSH 画像互換

新しい DSH の `session/prompt` は画像ブロックに `mediaType` を要求します。旧 DSH は `mimeType` を使います。橋渡しは新しいフィールドで送信し、画像を含む prompt が `input-invalid` / `boundary validation` を返した場合だけ旧フィールドで再試行します。テキストのみのメッセージには影響しません。MCP 画像ツールは引き続き `mimeType` を使います。

## MCP ツール一覧

実際の有効状態は `socialV2.tools`、ステッカー/音声/RVC 設定、MCP 設定で決まります。実行時は `qq_get_prompt` の `enabledTools` を確認してください。

**QQ 読み取り**  
`qq_status`, `qq_list_groups`, `qq_get_group_members`, `qq_get_group_history`, `qq_get_prompt`, `qq_get_unread_messages`, `qq_get_recent_messages`, `qq_get_my_recent_messages`, `qq_get_message_detail`, `qq_get_active_members`, `qq_social_state`, `qq_get_forward_msg`, `qq_get_message_images`

**QQ 送信・操作**  
`qq_send_group_message`, `qq_send_private_message`, `qq_reply`, `qq_send_burst`, `qq_send_message`, `qq_send_poke`, `qq_send_image`, `qq_send_image_data`, `qq_set_poke_style`

**起動・既読**  
`qq_mark_read`, `qq_set_wake_config`, `qq_wait_for_messages`

**メモリ・スラング**  
`qq_memory_append`, `qq_memory_query`, `qq_memory_remove`, `qq_memory_clear`, `qq_slang_query`, `qq_slang_submit`

**日記**  
`qq_diary_context`, `qq_diary_write`

**ステッカー**  
`qq_list_stickers`, `qq_get_sticker_image`, `qq_send_sticker`, `qq_collect_sticker`, `qq_sticker_note`, `qq_set_sticker_remark`

**音声・歌唱**  
`qq_list_voices`, `qq_send_voice`, `qq_say`, `qq_sing`

**QQ 空間・友だち**  
`qq_qzone_feeds`, `qq_qzone_detail`, `qq_qzone_like`, `qq_qzone_comment`, `qq_qzone_reply`, `qq_qzone_images`, `qq_post_qzone`, `qq_set_signature`, `qq_handle_friend_request`, `qq_approve_friend_request`, `qq_whitelist_add`

**描画・ホスト**  
`qq_draw`, `qq_get_self_image`, `snowluma_status`

**Android**  
`android_status`, `android_screenshot`, `android_ui`, `android_tap`, `android_swipe`, `android_key`, `android_batch`, `android_text`, `android_launch`, `android_close`, `android_packages`, `android_adb`, `android_listen`, `android_capture_share`

**Web 検索**  
`web_search`, `web_fetch`

**Bilibili 読み取り**  
`bili_check_credential`, `bili_search`, `bili_comments`, `bili_subtitle`, `bili_danmaku`, `bili_video_info`, `bili_crawl`, `bili_hot_videos`, `bili_hot_buzzwords`, `bili_weekly_hot`, `bili_rank`, `bili_video_zones`, `bili_user_info`, `bili_user_videos`, `bili_favorite_lists`, `bili_favorite_content`, `bili_unread_messages`, `bili_received_replies`, `bili_received_at_and_likes`

**Bilibili ログイン/書き込み/投稿**  
`bili_login`, `bili_login_check`, `bili_reply`, `bili_send_dynamic`, `bili_upload_video`, `bili_upload_video_multi`, `bili_send_opus`, `bili_send_message`

Bilibili の書き込みにはユーザー自身の認証情報が必要です。Cookie は同梱・送信されません。

## Memory V3 + V4

```text
QQ メッセージ
  → qq-bridge 取り込み
  → messages テーブル（重複排除/カーソル）
  → 抽出ワーカー
  → 事実/イベント候補
  → 手動審査または任意の自動審査
  → facts / events
  → V4 マルチシグナル召回
  → トークン予算内で DSH コンテキストへ注入
```

- バッチ抽出とカーソルでコストを抑制
- 候補は審査/自動承認まで保留
- 根拠、信頼度、品質、時間精度を保持
- dedupe_key / batch_key による冪等性
- `observeOnly=true` は自動審査を明示しない限り本番を読み取り専用に保つ
- 手動編集は `manual_override` を設定し、自動上書きを防ぐ
- 論理削除と監査で復元可能
- `VACUUM INTO` と manifest/SHA256 でバックアップ

V4 召回は直近メッセージ、話題、人物、時間範囲、参加者、キーワードを組み合わせ、関連性、信頼度、重要度、新しさ、活発さで再ランキングします。

## 設定とデータ

| コンポーネント | 既定パス | 備考 |
|---|---|---|
| マネージャー | `%APPDATA%\dafiyu-desktop` | 設定、ログ、テスト DB |
| マネージャー設定 | `%APPDATA%\dafiyu-desktop\config\config.json` | パス、テーマ、制御スイッチ |
| qq-bridge | `C:\Users\<user>\qq-bridge` | ソースと実行環境 |
| qq-bridge 設定 | `<qq-bridge>\config.json` | メイン設定 |
| qq-bridge state | `<qq-bridge>\state` | DB、ログ、トークン |
| SnowLuma | `~/SnowLuma` | ランタイム、設定、データ、ログ |
| DSH | `%USERPROFILE%\.dsh\profiles\desktop` | DSH 経由で管理 |

最小設定：

```text
ownerQQ
allow.private / allow.groups
dsh.baseUrl / dsh.authToken
snowluma.httpUrl / wsUrl / accessToken
agentPreset
socialV2.enabled
```

トークン、Cookie、API Key、QQ ログイン状態、本番メモリをリポジトリへコミットしないでください。

## 開発とビルド

```powershell
npm install
npm start
npm run build
```

リリース用インストーラーを作る前に、公式 SnowLuma Windows ランタイムを `vendor/SnowLuma` に置いてください。このディレクトリは Git にコミットしません。リリース用インストーラーには同梱されます。

インストーラーは未署名です。Windows SmartScreen の警告が出る場合があります。

## 制限

- DSH は別途インストールと設定が必要
- QQ ログインは SnowLuma WebUI の QR コードが必要
- UI は現在中国語
- SnowLuma のオンライン更新は終了。手動で置き換える
- Bilibili MCP と Android ツールは任意のローカル設定に依存
- 非商業向け source-available プロジェクトであり、OSI オープンソースではない

---

## 動作環境

- Windows 11 x64
- DSH を別途インストール・設定
- QQ アカウント（SnowLuma ログイン用）
- qq-bridge の依存関係を初期化する場合は Node.js 22+
- ローカルポート 5099 / 3000 / 3001 / 3100 / 3080 が利用可能

## 構成

```text
Dafiyu Control Center (Electron)
  renderer (sandbox) → preload allowlist → main
  main: supervisor / health / recovery / backup / memory / logs / embed
        │
SnowLuma (5099 / 3000 / 3001)     qq-bridge / DSH (3100 / agent API)
```

設計境界：

- renderer に Node / shell / 任意ファイルアクセスなし
- IPC、パス、プロセス所有権を main で検証
- 外部プロセスは検出のみ
- 本番メモリは明示的な操作と監査なしに書き換えない

## SnowLuma の表示

SnowLuma は **SnowLumaDevs** が開発しています。

- https://github.com/SnowLuma/SnowLuma
- License: https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA: https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md

Windows インストーラーには未変更の SnowLuma 2.4.0 ランタイムを同梱しています。この同梱配布については SnowLumaDevs の別途許可を得ています。SnowLuma には独自の EULA / Source-Available Non-Commercial License が適用されます。再配布時は SnowLumaDevs の表示、公式リンク、完全なライセンス文を保持してください。

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
