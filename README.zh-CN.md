# Vibe Pet

给 AI 编程助手准备的硬件桌宠。

把每一个 AI 编程助手变成陪你思考、工作和完成任务的实时桌宠，让 AI 协作真正出现在桌面和硬件上。

[![GitHub stars](https://img.shields.io/github/stars/wangzongming/vibe-pet?style=flat-square)](https://github.com/wangzongming/vibe-pet)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-2f7d32?style=flat-square)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/runtime-Electron-4666ff?style=flat-square)](https://www.electronjs.org/)

[English](README.md) | 中文 | [日本語](README.ja-JP.md)

Vibe Pet 是一个给 AI 编程助手准备的硬件桌宠项目。它会读取 Codex、Cursor、Windsurf 以及其他 CLI / IDE 中 AI 编程助手的实时状态，把「思考中」「执行工具」「等待确认」「完成」「报错」这些事件变成桌面上的小宠物动画，并通过 BLE 同步到 Wio Terminal 或 ESP32-S3 设备。

## 核心功能

- 多助手桌宠视图：每个正在运行的编辑器或 AI 编程助手会话都有自己的宠物卡片，不会混成一个状态。
- 真正的桌面宠物：主窗口里的宠物也会同步生成到桌面上，每个宠物都可以独立拖拽。
- 硬件同步：通过蓝牙把状态写入 Wio Terminal 或 ESP-AI Mini Ext。
- 实时输出：在桌宠卡片里显示 AI 编程助手最近的输出内容，并在内容变多时自动滚动。
- 会话标题：顶部显示当前会话或工作区标题，方便区分多个 Cursor、Codex 或 Windsurf 实例。
- 角色切换：内置「噜噜」角色，也可以从 [Petdex](https://github.com/crafter-station/petdex) 刷新和选择更多精灵图角色。
- 固件烧录：桌面程序内置 Wio Terminal 和 ESP32-S3 固件烧录入口。
- 多语言界面：支持中文、英文、日语，默认英文。
- 日夜主题：支持白天模式和夜晚模式。

## 支持的 Agent

Vibe Pet 会默认尝试同步这些 AI 编程助手的 hooks 或插件配置：

| Agent | 集成方式 |
| --- | --- |
| Codex | Hooks 和 JSONL 会话监听 |
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

## 支持的硬件

| 硬件 | 显示 / 用途 | 同步方式 |
| --- | --- | --- |
| [Wio Terminal](https://www.seeedstudio.com/Wio-Terminal-p-4509.html) | 主显示端，用于显示桌宠动画 | BLE |
| [ESP-AI Mini Ext](https://espai.fun/open/pcb/mini-ext/1.0.0/) | 基于 ESP32-S3 的 AI 开发套件，可作为状态灯或轻量显示端 | BLE |
| [ESP-AI Common 3.0.0](https://espai.fun/open/pcb/common/3.0.0/) | 带 ST7789 TFT 和状态灯的 ESP32-S3 AI 开发板 | BLE |
| [ESP-AI DIY ESP32S3](https://espai.fun/guide/1e7b8i8e/) | DIY ESP32S3 接线方案，支持 OLED 屏和 WS2812 状态灯 | BLE |
| [M5Stack Core2](https://docs.m5stack.com/en/core/core2) | 320x240 彩色触摸屏 | BLE |
| [M5Stack CoreS3](https://docs.m5stack.com/en/core/CoreS3) | ESP32-S3 彩色触摸屏 | BLE |
| [M5StickC Plus2](https://docs.m5stack.com/en/core/M5StickC%20PLUS2) | 小尺寸彩色屏 | BLE |
| [M5Stack Cardputer](https://docs.m5stack.com/en/core/Cardputer) | 带键盘和彩色屏的设备 | BLE |
| [M5Stack AtomS3](https://docs.m5stack.com/en/core/AtomS3) | 迷你 ESP32-S3 彩色屏 | BLE |
| [LILYGO T-Display ESP32](https://www.lilygo.cc/products/t-display) | 1.14 英寸 ST7789 彩色屏 | BLE |
| [LILYGO T-Display S3](https://www.lilygo.cc/products/t-display-s3) | ESP32-S3 ST7789 彩色屏 | BLE |
| [Heltec WiFi Kit 32](https://heltec.org/project/wifi-kit-32-v3/) | ESP32 OLED 屏 | BLE |
| [Heltec WiFi Kit 8](https://heltec.org/project/wifi-kit-8/) | ESP8266 OLED 屏 | Wi-Fi 轮询 |
| [WEMOS D1 mini + OLED Shield](https://www.wemos.cc/en/latest/d1_mini_shield/oled_0_66.html) | ESP8266 OLED 扩展屏 | Wi-Fi 轮询 |

也欢迎把 Vibe Pet 适配到你自己的硬件上。BLE 和 Wi-Fi 硬件负载本身很轻量，新的屏幕、状态灯、徽章设备或自定义开发板都可以在不改桌面端核心逻辑的情况下接入。

## 快速开始

```bash
npm install
npm start
```

`npm install`、`npm start` 和 `npm run dev` 会默认安装或同步 hooks。需要手动重装时可以运行：

```bash
npm run install:hooks
```

一键安装：

```bash
# macOS / Linux
./scripts/install.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# Windows CMD
scripts\install.cmd
```

加上 `--start` 会在安装后直接启动应用，加上 `--dev` 会进入热更新开发模式。

启动后在桌面程序顶部连接设备。如果你只是想先看桌面宠物效果，不连接硬件也可以直接使用。

开发时使用热更新：

```bash
npm run dev
```

## 打包

打包脚本支持 macOS、Linux 和 Windows，产物会输出到 `dist/`。

```bash
npm run package:current
npm run package:mac
npm run package:linux
npm run package:win
npm run package:all
```

需要指定架构时：

```bash
npm run package:mac -- --arch arm64
npm run package:linux -- --arch x64
```

当前产物是未签名的 Electron 应用包。正式分发时仍可能需要按平台处理签名、公证或安装器。

ESP-AI 显示设备、M5Stack、LILYGO、Heltec 和 ESP8266 OLED 设备的显示固件位于 `src/firmware/esp-display-code-pet`：

```bash
pio run -d src/firmware/esp-display-code-pet -e esp_ai_common_3_tft -t upload
pio run -d src/firmware/esp-display-code-pet -e esp_ai_diy_esp32s3_oled -t upload
pio run -d src/firmware/esp-display-code-pet -e m5stack_core2 -t upload
pio run -d src/firmware/esp-display-code-pet -e lilygo_t_display_s3 -t upload
```

ESP8266 OLED 设备需要在 `src/firmware/esp-display-code-pet/platformio.ini` 中填写 `CODE_PET_WIFI_SSID`、`CODE_PET_WIFI_PASSWORD` 和 `CODE_PET_BRIDGE_URL`，设备会通过 `/api/device-snapshot` 轮询桌面端状态。

更详细的目录结构、协议、端点和 hook 行为见 [AGENT.MD](AGENT.MD)。硬件协议见 [docs/protocol.md](docs/protocol.md)。

## 赞助商

<a href="https://www.seeedstudio.com/">
  <img src="https://www.seeed.cc/_next/image?q=90&amp;url=%2Fpub%2Fimages%2Flogo.png&amp;w=3840" alt="Seeed Studio" width="220">
</a>

## 参与贡献

欢迎提交想法、问题反馈、硬件适配、新的 AI 编程助手集成、翻译和 UI 优化。你可以先开 issue 讨论方案，也可以在已经有可运行实现时直接提交 PR。
