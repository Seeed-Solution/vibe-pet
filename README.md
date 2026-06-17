# Vibe Pet

Hardware desktop pets for your AI coding agents.

Turn every AI coding agent into a live companion that thinks, works, and celebrates with you across desktop and hardware.

[![GitHub stars](https://img.shields.io/github/stars/wangzongming/vibe-pet?style=flat-square)](https://github.com/wangzongming/vibe-pet)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-2f7d32?style=flat-square)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/runtime-Electron-4666ff?style=flat-square)](https://www.electronjs.org/)

English | [中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

Vibe Pet is a hardware desktop pet project for AI coding agents. It watches live activity from Codex, Cursor, Windsurf, and other AI coding agents in CLIs and IDEs, turns states such as thinking, tool use, waiting for approval, completed, and error into animated pets, then syncs the same state to Wio Terminal or ESP32-S3 hardware over BLE.

## Highlights

- Multi-agent pet grid: every active editor or AI coding agent session gets its own pet card.
- Real desktop pets: pets from the main window are mirrored onto your desktop as draggable floating companions.
- Hardware sync: send normalized AI coding agent state to Wio Terminal or ESP-AI Mini Ext over Bluetooth Low Energy.
- Live output: show recent AI coding agent output inside each pet card with automatic scrolling.
- Session titles: display the current session or workspace title so multiple Cursor, Codex, or Windsurf windows are easy to tell apart.
- Character switching: includes the built-in Lulu character and can refresh more sprites from [Petdex](https://github.com/crafter-station/petdex).
- Firmware flashing: flash Wio Terminal and ESP32-S3 firmware directly from the desktop app.
- Multilingual UI: Chinese, English, and Japanese are supported. English is the default.
- Day and night themes: switch between light and night modes.

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

The packaging scripts support macOS, Linux, and Windows. Output goes to `dist/`.

```bash
npm run package:current
npm run package:mac
npm run package:linux
npm run package:win
npm run package:all
```

Pass an architecture when needed:

```bash
npm run package:mac -- --arch arm64
npm run package:linux -- --arch x64
```

Packages are unsigned Electron app bundles. Release distribution may still require platform-specific signing, notarization, or installer tooling.

Display firmware for ESP-AI display boards, M5Stack, LILYGO, Heltec, and ESP8266 OLED boards lives in `src/firmware/esp-display-code-pet`:

```bash
pio run -d src/firmware/esp-display-code-pet -e esp_ai_common_3_tft -t upload
pio run -d src/firmware/esp-display-code-pet -e esp_ai_diy_esp32s3_oled -t upload
pio run -d src/firmware/esp-display-code-pet -e m5stack_core2 -t upload
pio run -d src/firmware/esp-display-code-pet -e lilygo_t_display_s3 -t upload
```

For ESP8266 OLED boards, set `CODE_PET_WIFI_SSID`, `CODE_PET_WIFI_PASSWORD`, and `CODE_PET_BRIDGE_URL` in `src/firmware/esp-display-code-pet/platformio.ini` so the device can poll `/api/device-snapshot`.

Technical details such as project structure, local endpoints, BLE / Wi-Fi behavior, and hook mapping live in [AGENT.MD](AGENT.MD). The hardware protocol is documented in [docs/protocol.md](docs/protocol.md).

## Sponsor

<a href="https://www.seeedstudio.com/">
  <img src="https://www.seeed.cc/_next/image?q=90&amp;url=%2Fpub%2Fimages%2Flogo.png&amp;w=3840" alt="Seeed Studio" width="220">
</a>

## Contributing

Ideas, bug reports, hardware ports, new agent integrations, translations, and UI improvements are all welcome. Open an issue to discuss what you want to build, or send a PR when you already have something working.
