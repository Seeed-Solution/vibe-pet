<p align="center">
  <img src="docs/assets/vibe-pet-readme-icon.png" width="96" alt="Vibe Pet ロゴ">
</p>

<h1 align="center">Vibe Pet</h1>

<p align="center">
  <strong>AI コーディングエージェントのためのハードウェアデスクトップペット</strong><br>
  <strong>数千種類のキャラクターから選ぶことも、ワンクリックで自分のキャラクターを作ることもできます</strong><br>
  Codex、Cursor、Windsurf などのエージェントを、デスクトップとハードウェア上のライブコンパニオンにします
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="docs/protocol.md">プロトコル</a>
  ·
  <a href="https://github.com/crafter-station/petdex">Petdex</a>
  ·
  <a href="README.zh-CN.md">中文</a>
  ·
  日本語
</p>

<p align="center">
  <a href="https://github.com/wangzongming/vibe-pet"><img alt="stars" src="https://img.shields.io/github/stars/wangzongming/vibe-pet?style=flat-square"></a>
  <a href="https://github.com/wangzongming/vibe-pet/issues"><img alt="issues" src="https://img.shields.io/github/issues/wangzongming/vibe-pet?style=flat-square"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-111111?style=flat-square"></a>
  <a href="https://nodejs.org/"><img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D18-2f7d32?style=flat-square"></a>
  <a href="https://www.electronjs.org/"><img alt="Electron" src="https://img.shields.io/badge/runtime-Electron-4666ff?style=flat-square"></a>
</p>

Vibe Pet は AI コーディングエージェントのためのハードウェアデスクトップペットです。Codex、Cursor、Windsurf などの CLI / IDE AI エージェントの状態を読み取り、「考え中」「ツール実行中」「承認待ち」「完了」「エラー」といった動きを小さなペットのアニメーションに変換し、BLE 経由で Wio Terminal や ESP32-S3 デバイスへ同期します。

<p align="center">
  <img src="images/home.gif" width="49%" alt="Vibe Pet character picker">
  <img src="images/work.gif" width="49%" alt="Vibe Pet desktop companion">
</p>

## 主な機能

- 複数エージェントのペット表示：実行中のエディタや AI コーディングエージェントごとに個別のペットカードを表示し、ひとつの状態に混ざらないようにします。
- デスクトップ上のペット：メイン画面のペットをデスクトップ上にも表示し、それぞれ独立してドラッグできます。
- ハードウェア同期：Bluetooth で Wio Terminal や ESP-AI Mini Ext などのデバイスへ状態を送信します。
- キャラクター切り替え：デフォルトでは [Petdex](https://github.com/crafter-station/petdex) からキャラクターを選び、自作キャラクターを使うこともできます。

## 対応 Agent

Vibe Pet は以下の AI エージェントの hooks またはプラグイン設定を自動で同期しようとします。

| Agent | 連携方式 |
| --- | --- |
| Codex | Hooks と JSONL セッション監視 |
| Cursor | Hooks |
| Windsurf | Cascade hooks |
| Claude CLI | Hooks |
| Claude Code | Hooks |
| Gemini CLI | Hooks |
| Copilot CLI | Hooks |
| CodeBuddy | Hooks |
| Kimi Code CLI | Hooks |
| Qwen Code | Hooks |
| OpenClaw | Plugin |
| opencode | Plugin |
| Qoder | Hooks |
| Hermes Agent | Plugin |
| Reasonix CLI | Hooks |

## 対応ハードウェア

| ハードウェア | 表示 / 役割 | 同期方式 |
| --- | --- | --- |
| [Wio Terminal](https://www.seeedstudio.com/Wio-Terminal-p-4509.html) | メインのアニメーション表示デバイス | BLE |
| [ESP-AI Mini Ext](https://espai.fun/open/pcb/mini-ext/1.0.0/) | ESP32-S3 ベースの AI 開発キット。軽量なステータスライトまたは表示デバイスとして利用 | BLE |
| [ESP-AI Common 3.0.0](https://espai.fun/open/pcb/common/3.0.0/) | ST7789 TFT とステータスライト付きの ESP32-S3 AI 開発ボード | BLE |
| [ESP-AI DIY ESP32S3](https://espai.fun/guide/1e7b8i8e/) | OLED 表示と WS2812 ステータスライト向けの DIY ESP32S3 配線プロファイル | BLE |
| [M5Stack Core2](https://docs.m5stack.com/en/core/core2) | 320x240 カラータッチディスプレイ | BLE |
| [M5Stack CoreS3](https://docs.m5stack.com/en/core/CoreS3) | ESP32-S3 カラータッチディスプレイ | BLE |
| [M5StickC Plus2](https://docs.m5stack.com/en/core/M5StickC%20PLUS2) | 小型カラーディスプレイ | BLE |
| [M5Stack Cardputer](https://docs.m5stack.com/en/core/Cardputer) | キーボード付きカラーディスプレイ端末 | BLE |
| [M5Stack AtomS3](https://docs.m5stack.com/en/core/AtomS3) | 小型 ESP32-S3 カラーディスプレイ | BLE |
| [LILYGO T-Display ESP32](https://www.lilygo.cc/products/t-display) | 1.14 インチ ST7789 カラーディスプレイ | BLE |
| [LILYGO T-Display S3](https://www.lilygo.cc/products/t-display-s3) | ESP32-S3 ST7789 カラーディスプレイ | BLE |
| [Heltec WiFi Kit 32](https://heltec.org/project/wifi-kit-32-v3/) | ESP32 OLED ディスプレイ | BLE |
| [Heltec WiFi Kit 8](https://heltec.org/project/wifi-kit-8/) | ESP8266 OLED ディスプレイ | Wi-Fi ポーリング |
| [WEMOS D1 mini + OLED Shield](https://www.wemos.cc/en/latest/d1_mini_shield/oled_0_66.html) | ESP8266 OLED シールド | Wi-Fi ポーリング |

Vibe Pet を自分のハードウェアに対応させることも歓迎します。BLE と Wi-Fi のハードウェア向けペイロードは小さく保っているため、新しい画面、ステータスライト、バッジ型デバイス、カスタムボードもデスクトップアプリの中核を変えずに追加できます。

## ダウンロードとインストール

[Releases page](https://github.com/wangzongming/vibe-pet/releases) から、お使いのプラットフォーム向けのインストーラーをダウンロードしてください。

- macOS: `.dmg` または `.zip` ビルドをダウンロードします。
- Windows: `.exe` インストーラーをダウンロードします。
- Linux: `.AppImage` または `.deb` パッケージをダウンロードします。

インストール後に Vibe Pet を起動し、デスクトップアプリからデバイスに接続します。ハードウェアを接続しなくても、デスクトップペットだけで利用できます。

## 技術ドキュメント

- プロジェクト構成、ローカルエンドポイント、BLE / Wi-Fi の動作、hook のマッピングなどの技術情報は [AGENT.MD](AGENT.MD) を参照してください
- プロトコル文書の入口は [protocol index](docs/protocol.md) です
- 英語版プロトコル文書:
  - [IDE / Agent protocol](docs/ide-protocol.md)
  - [hardware protocol](docs/hardware-protocol.md)
- 中国語版プロトコル文書:
  - [IDE / Agent 协议](docs/ide-protocol.zh-CN.md)
  - [硬件协议](docs/hardware-protocol.zh-CN.md)

## スポンサー

<a href="https://www.seeedstudio.com/">
  <img src="https://www.seeed.cc/_next/image?q=90&amp;url=%2Fpub%2Fimages%2Flogo.png&amp;w=3840" alt="Seeed Studio" width="220">
</a>

## コントリビューション

アイデア、バグ報告、ハードウェア対応、新しい AI コーディングエージェント連携、翻訳、UI 改善を歓迎します。コードで貢献したい場合は、開発環境、パッケージング、テスト、PR 手順をまとめた [CONTRIBUTING.md](CONTRIBUTING.md) を読んでください。
