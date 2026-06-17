# Vibe Pet

AI コーディングエージェントのためのハードウェアデスクトップペット。

すべての AI コーディングエージェントを、考え、働き、完了を一緒に喜ぶライブコンパニオンとしてデスクトップとハードウェアに届けます。

[![GitHub stars](https://img.shields.io/github/stars/wangzongming/vibe-pet?style=flat-square)](https://github.com/wangzongming/vibe-pet)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-2f7d32?style=flat-square)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/runtime-Electron-4666ff?style=flat-square)](https://www.electronjs.org/)

[English](README.md) | [中文](README.zh-CN.md) | 日本語

Vibe Pet は AI コーディングエージェントのためのハードウェアデスクトップペットです。Codex、Cursor、Windsurf などの CLI / IDE AI エージェントの状態を読み取り、「考え中」「ツール実行中」「承認待ち」「完了」「エラー」といった動きを小さなペットのアニメーションに変換し、BLE 経由で Wio Terminal や ESP32-S3 デバイスへ同期します。

## 主な機能

- 複数エージェントのペット表示：実行中のエディタや AI エージェントのセッションごとに個別のペットカードを表示します。
- デスクトップ上のペット：メイン画面のペットをデスクトップ上にも表示し、それぞれ独立してドラッグできます。
- ハードウェア同期：Bluetooth Low Energy で Wio Terminal または ESP-AI Mini Ext に状態を送信します。
- リアルタイム出力：各ペットカードに AI エージェントの最新出力を表示し、長い内容は自動でスクロールします。
- セッションタイトル：複数の Cursor、Codex、Windsurf を区別しやすいように、会話やワークスペース名を表示します。
- キャラクター切り替え：内蔵キャラクター「噜噜」に加えて、[Petdex](https://github.com/crafter-station/petdex) からスプライトキャラクターを更新して選択できます。
- ファームウェア書き込み：Wio Terminal と ESP32-S3 のファームウェアを書き込む機能をデスクトップアプリに内蔵しています。
- 多言語 UI：中国語、英語、日本語に対応し、初期言語は英語です。
- 昼夜テーマ：ライトモードとナイトモードを切り替えられます。

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

## クイックスタート

```bash
npm install
npm start
```

`npm install`、`npm start`、`npm run dev` は hooks のインストールまたは同期をデフォルトで実行します。手動で再インストールする場合：

```bash
npm run install:hooks
```

ワンクリックインストール：

```bash
# macOS / Linux
./scripts/install.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# Windows CMD
scripts\install.cmd
```

`--start` を付けるとインストール後にアプリを起動します。`--dev` を付けるとホットリロード開発モードで起動します。

起動後、デスクトップアプリからデバイスに接続します。ハードウェアを接続しなくても、デスクトップペットだけで利用できます。

ホットリロード付きで開発する場合：

```bash
npm run dev
```

## パッケージング

パッケージングスクリプトは macOS、Linux、Windows に対応しています。出力先は `dist/` です。

```bash
npm run package:current
npm run package:mac
npm run package:linux
npm run package:win
npm run package:all
```

必要に応じてアーキテクチャを指定できます。

```bash
npm run package:mac -- --arch arm64
npm run package:linux -- --arch x64
```

生成されるのは未署名の Electron アプリバンドルです。配布時には各プラットフォームの署名、公証、インストーラー作成が別途必要になる場合があります。

ESP-AI 表示ボード、M5Stack、LILYGO、Heltec、ESP8266 OLED 向けの表示ファームウェアは `src/firmware/esp-display-code-pet` にあります。

```bash
pio run -d src/firmware/esp-display-code-pet -e esp_ai_common_3_tft -t upload
pio run -d src/firmware/esp-display-code-pet -e esp_ai_diy_esp32s3_oled -t upload
pio run -d src/firmware/esp-display-code-pet -e m5stack_core2 -t upload
pio run -d src/firmware/esp-display-code-pet -e lilygo_t_display_s3 -t upload
```

ESP8266 OLED デバイスでは、`src/firmware/esp-display-code-pet/platformio.ini` に `CODE_PET_WIFI_SSID`、`CODE_PET_WIFI_PASSWORD`、`CODE_PET_BRIDGE_URL` を設定してください。デバイスは `/api/device-snapshot` をポーリングしてデスクトップの状態を同期します。

プロジェクト構成、ローカルエンドポイント、BLE / Wi-Fi の動作、hook のマッピングなどの技術情報は [AGENT.MD](AGENT.MD) を参照してください。ハードウェアプロトコルは [docs/protocol.md](docs/protocol.md) にあります。

## スポンサー

<a href="https://www.seeedstudio.com/">
  <img src="https://www.seeed.cc/_next/image?q=90&amp;url=%2Fpub%2Fimages%2Flogo.png&amp;w=3840" alt="Seeed Studio" width="220">
</a>

## コントリビューション

アイデア、バグ報告、ハードウェア対応、新しい AI コーディングエージェント連携、翻訳、UI 改善を歓迎します。作りたいものがあれば issue で相談してください。動く実装がある場合は PR も歓迎です。
