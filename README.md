<p align="center">
  <img src="docs/assets/vibe-pet-readme-icon.png" width="96" alt="Vibe Pet logo">
</p>

<h1 align="center">Vibe Pet</h1>

<p align="center">
  <strong>Hardware desktop pets for your AI coding agents.</strong><br>
  <strong>Choose from thousands of characters or create your own in one click.</strong><br>
  Turn Codex, Cursor, Windsurf, and other agents into live companions across desktop and hardware.
</p>

<p align="center">
  English
  ·
  <a href="docs/protocol.md">Protocol</a>
  ·
  <a href="https://github.com/crafter-station/petdex">Petdex</a>
  ·
  <a href="README.zh-CN.md">中文</a>
  ·
  <a href="README.ja-JP.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/wangzongming/vibe-pet"><img alt="stars" src="https://img.shields.io/github/stars/wangzongming/vibe-pet?style=flat-square"></a>
  <a href="https://github.com/wangzongming/vibe-pet/issues"><img alt="issues" src="https://img.shields.io/github/issues/wangzongming/vibe-pet?style=flat-square"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-111111?style=flat-square"></a>
  <a href="https://nodejs.org/"><img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D18-2f7d32?style=flat-square"></a>
  <a href="https://www.electronjs.org/"><img alt="Electron" src="https://img.shields.io/badge/runtime-Electron-4666ff?style=flat-square"></a>
</p>

Vibe Pet is a hardware desktop pet project for AI coding agents. It watches live activity from Codex, Cursor, Windsurf, and other AI coding agents in CLIs and IDEs, turns states such as thinking, tool use, waiting for approval, completed, and error into animated pets, then syncs the same state to Wio Terminal or ESP32-S3 hardware over BLE.

<p align="center">
  <img src="images/home.gif" width="49%" alt="Vibe Pet character picker">
  <img src="images/work.gif" width="49%" alt="Vibe Pet desktop companion">
</p>

## Highlights

- Multi-agent pet view: every active editor or AI coding agent gets its own pet card instead of sharing one combined state.
- Real desktop pets: pets from the main window are also spawned onto the desktop, and each one can be dragged independently.
- Hardware sync: send state over Bluetooth to devices such as Wio Terminal or ESP-AI Mini Ext.
- Character switching: choose a character from [Petdex](https://github.com/crafter-station/petdex) by default or use a custom character you made.

## Supported Agents

Vibe Pet automatically tries to install or sync integrations for:

| Agent | Integration |
| --- | --- |
| Codex | Hooks and JSONL session monitoring |
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

## Supported Hardware

| Hardware | Display / role | Sync |
| --- | --- | --- |
| [Wio Terminal](https://www.seeedstudio.com/Wio-Terminal-p-4509.html) | Main animated pet display | BLE |
| [ESP-AI Mini Ext](https://espai.fun/open/pcb/mini-ext/1.0.0/) | ESP32-S3-based AI dev kit for lightweight status or display output | BLE |
| [ESP-AI Common 3.0.0](https://espai.fun/open/pcb/common/3.0.0/) | ESP32-S3 AI dev board with ST7789 TFT and status light | BLE |
| [ESP-AI DIY ESP32S3](https://espai.fun/guide/1e7b8i8e/) | DIY ESP32S3 wiring profile for OLED display and WS2812 status light | BLE |
| [M5Stack Core2](https://docs.m5stack.com/en/core/core2) | 320x240 color touch display | BLE |
| [M5Stack CoreS3](https://docs.m5stack.com/en/core/CoreS3) | ESP32-S3 color touch display | BLE |
| [M5StickC Plus2](https://docs.m5stack.com/en/core/M5StickC%20PLUS2) | Compact color display | BLE |
| [M5Stack Cardputer](https://docs.m5stack.com/en/core/Cardputer) | Keyboard device with color display | BLE |
| [M5Stack AtomS3](https://docs.m5stack.com/en/core/AtomS3) | Tiny ESP32-S3 color display | BLE |
| [LILYGO T-Display ESP32](https://www.lilygo.cc/products/t-display) | 1.14-inch ST7789 color display | BLE |
| [LILYGO T-Display S3](https://www.lilygo.cc/products/t-display-s3) | ESP32-S3 ST7789 color display | BLE |
| [Heltec WiFi Kit 32](https://heltec.org/project/wifi-kit-32-v3/) | ESP32 OLED display | BLE |
| [Heltec WiFi Kit 8](https://heltec.org/project/wifi-kit-8/) | ESP8266 OLED display | Wi-Fi polling |
| [WEMOS D1 mini + OLED Shield](https://www.wemos.cc/en/latest/d1_mini_shield/oled_0_66.html) | ESP8266 OLED shield | Wi-Fi polling |

Want to bring Vibe Pet to your own device? The BLE and Wi-Fi hardware payloads are intentionally small, so new screens, status lights, badges, and custom boards can be added without changing the desktop app.

## Quick Start

```bash
npm install
npm start
```

`npm install`, `npm start`, and `npm run dev` install or sync hooks by default. To reinstall hooks manually:

```bash
npm run install:hooks
```

One-click install:

```bash
# macOS / Linux
./scripts/install.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# Windows CMD
scripts\install.cmd
```

Add `--start` to launch the app after installation, or `--dev` to start hot reload development mode.

After launch, use the desktop app to connect your device. You can also use Vibe Pet without hardware if you only want the desktop pets.

For development with hot reload:

```bash
npm run dev
```

## Packaging

The packaging scripts support macOS, Linux, and Windows. App bundle output goes to `dist/`.

```bash
npm run package:current
npm run package:mac
npm run package:linux
npm run package:win
npm run package:all
```

Installer output goes to `dist/installers/`. To build an installer for the current platform:

```bash
npm run build
```

Platform-specific and all-target installer commands are also available:

```bash
npm run build:current
npm run build:mac
npm run build:linux
npm run build:win
npm run build:all
```

Pass an architecture when needed:

```bash
npm run package:mac -- --arch arm64
npm run package:linux -- --arch x64
npm run build:win -- --arch x64
npm run build:linux -- --target AppImage
```

Installer defaults are DMG for macOS, NSIS for Windows, and AppImage plus deb for Linux. Installers are unsigned; release distribution may still require platform-specific signing or notarization. macOS installers must be built on macOS.

Display firmware for ESP-AI display boards, M5Stack, LILYGO, Heltec, and ESP8266 OLED boards lives in `src/firmware/esp-display-code-pet`:

```bash
pio run -d src/firmware/esp-display-code-pet -e esp_ai_common_3_tft -t upload
pio run -d src/firmware/esp-display-code-pet -e esp_ai_diy_esp32s3_oled -t upload
pio run -d src/firmware/esp-display-code-pet -e m5stack_core2 -t upload
pio run -d src/firmware/esp-display-code-pet -e lilygo_t_display_s3 -t upload
```

For ESP8266 OLED boards, set `CODE_PET_WIFI_SSID`, `CODE_PET_WIFI_PASSWORD`, and `CODE_PET_BRIDGE_URL` in `src/firmware/esp-display-code-pet/platformio.ini` so the device can poll `/api/device-snapshot`.

## Technical Documentation

- Project structure, local endpoints, BLE / Wi-Fi behavior, and hook mapping are documented in [AGENT.MD](AGENT.MD)
- Protocol documentation starts at the [protocol index](docs/protocol.md)
- English protocol docs:
  - [IDE / Agent protocol](docs/ide-protocol.md)
  - [hardware protocol](docs/hardware-protocol.md)
- Chinese protocol docs:
  - [IDE / Agent 协议](docs/ide-protocol.zh-CN.md)
  - [硬件协议](docs/hardware-protocol.zh-CN.md)

## Sponsor

<a href="https://www.seeedstudio.com/">
  <img src="https://www.seeed.cc/_next/image?q=90&amp;url=%2Fpub%2Fimages%2Flogo.png&amp;w=3840" alt="Seeed Studio" width="220">
</a>

## Contributing

Ideas, bug reports, hardware ports, new agent integrations, translations, and UI improvements are all welcome. Open an issue to discuss what you want to build, or send a PR when you already have something working.
