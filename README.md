<p align="center">
  <img src="docs/assets/vibe-pet-readme-icon.png" width="96" alt="Vibe Pet logo">
</p>

<h1 align="center">Vibe Pet</h1>

<p align="center">
  <strong>Hardware desktop pets for your AI coding agents</strong><br>
  <strong>Choose from thousands of characters or create your own in one click</strong><br>
  Turn Codex, Cursor, Windsurf, and other agents into live companions across desktop and hardware
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
  <img src="images/home.gif" width="43.5%" alt="Vibe Pet character picker">
  <img src="images/work.gif" width="49%" alt="Vibe Pet desktop companion">
</p>

## Highlights

- Multi-agent pet view: every active editor or AI coding agent gets its own pet card instead of sharing one combined state.
- Real desktop pets: pets from the main window are also spawned onto the desktop, and each one can be dragged independently.
- Hardware sync: send state over Bluetooth to devices such as Wio Terminal or ESP-AI-MINI AI Dev Kit.
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

| Hardware | Display / role | Sync | Adapted | Notes |
| --- | --- | --- | --- | --- |
| [Wio Terminal](https://www.seeedstudio.com/Wio-Terminal-p-4509.html) | Main animated pet display | BLE | ✅ | Mature BLE animated display target. |
| [ESP-AI-MINI AI Dev Kit](https://espai.fun/open/pcb/mini-ext/1.0.0/) | ESP32-S3-based AI dev kit | BLE | ✅ | TFT target; LVGL character rendering. |
| [ESP-AI v3 Dev Board](https://espai.fun/open/pcb/common/3.0.0/) | ESP32-S3-based AI dev kit | BLE | ✅ | TFT target; LVGL character rendering. |
| [ESP-AI v4 Dev Board](https://espai.fun/open/pcb/common/4.0.0/) | ESP32-S3-based AI dev kit | BLE | ✅ | TFT target; LVGL character rendering. |
| [M5Stack CoreS3](https://docs.m5stack.com/en/core/CoreS3) | ESP32-S3 color touch display | BLE | ✅ | M5Unified ESP32-S3 target. |

Want to bring Vibe Pet to your own device? The BLE and Wi-Fi hardware payloads are intentionally small, so new screens, status lights, badges, and custom boards can be added without changing the desktop app.

## Download and Install

Download the installer for your platform from the [Releases page](https://github.com/wangzongming/vibe-pet/releases).

- macOS: download the `.dmg` or `.zip` build.
- Windows: download the `.exe` installer.
- Linux: download the `.AppImage` or `.deb` package.

After installation, launch Vibe Pet and use the desktop app to connect your device. You can also use Vibe Pet without hardware if you only want the desktop pets.

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

Ideas, bug reports, hardware ports, new agent integrations, translations, and UI improvements are all welcome. If you want to contribute code, read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, packaging, testing, and PR guidance.
