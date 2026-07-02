<p align="center">
  <img src="docs/assets/vibe-pet-readme-icon.png" width="96" alt="Vibe Pet 标志">
</p>

<h1 align="center">Vibe Pet</h1>

<p align="center">
  <strong>给 AI 编程助手准备的桌宠</strong><br>
  <strong>几千款形象任你选择或者一键制作自己的形象</strong><br>
  把 Codex、Cursor、Windsurf 和其他助手变成出现在桌面与硬件上的实时伙伴
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="docs/protocol.md">协议</a>
  ·
  <a href="https://github.com/crafter-station/petdex">Petdex</a>
  ·
  中文
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

Vibe Pet 是一个给 AI 编程助手准备的桌宠项目。它会读取 Codex、Cursor、Windsurf 以及其他 CLI / IDE 中 AI 编程助手的实时状态，变成桌面上的小宠物动画，并通过 BLE 同步到 Wio Terminal 或 ESP32-S3 等设备。

<p align="center">
  <img src="images/home.gif" width="43.5%" alt="Vibe Pet 角色选择器">
  <img src="images/work.gif" width="49%" alt="Vibe Pet 桌面宠物">
</p>

## 核心功能

- 多助手桌宠视图：每个正在运行的编辑器或 AI 编程助手都有自己的宠物卡片，不会混成一个状态。
- 真正的桌面宠物：主窗口里的宠物也会同步生成到桌面上，每个宠物都可以独立拖拽。
- 硬件同步：通过蓝牙把状态写入 Wio Terminal 或 ESP-AI-MINI AI开发套件等设备。
- 角色切换：默认从 [Petdex](https://github.com/crafter-station/petdex) 选择角色或者使用自己做的角色。 

## 支持的 Agent

Vibe Pet 会默认尝试同步这些 AI 编程助手的 hooks 或插件配置：

| Agent | 集成方式 |
| --- | --- |
| Codex | Hooks 和 JSONL 会话监听 |
| Codex CLI | Hooks 和 JSONL 会话监听 |
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

| 硬件 | 显示 / 用途 | 同步方式 | 适配完毕 | 说明 |
| --- | --- | --- | --- | --- |
| [SenseCAP Indicator](https://wiki.seeedstudio.com/cn/Sensor/SenseCAP/SenseCAP_Indicator/Get_started_with_SenseCAP_Indicator/) | 4 英寸 480×480 触控屏 | BLE | Ing | ESP32-S3 + RP2040；ST7701S RGB 显示屏；LVGL 角色渲染。 |
| [Wio Terminal](https://www.seeedstudio.com/Wio-Terminal-p-4509.html) | 主显示端，用于显示桌宠动画 | BLE | Ing | 成熟的 BLE 动画显示目标。 |
| [ESP-AI-MINI AI开发套件](https://espai.fun/open/pcb/mini-ext/1.0.0/) | 基于 ESP32-S3 的 AI 开发套件 | BLE | Ing | TFT 目标；LVGL 角色渲染。 |

也欢迎把 Vibe Pet 适配到你自己的硬件上。BLE 和 Wi-Fi 硬件负载本身很轻量，新的屏幕、状态灯、徽章设备或自定义开发板都可以在不改桌面端核心逻辑的情况下接入。

## 下载安装

从 [Releases 页面](https://github.com/wangzongming/vibe-pet/releases) 下载适合你平台的安装包。

- macOS：下载 `.dmg` 或 `.zip` 构建。
- Windows：下载 `.exe` 安装包。
- Linux：下载 `.AppImage` 或 `.deb` 包。

安装后启动 Vibe Pet，并在桌面程序中连接设备。如果你只是想先看桌面宠物效果，不连接硬件也可以直接使用。

## 技术文档

- 更详细的目录结构、端点和 hook 行为见 [AGENT.MD](AGENT.MD)
- 协议文档入口见 [协议总览](docs/protocol.md)
- 中文协议文档：
  - [IDE / Agent 协议](docs/ide-protocol.zh-CN.md)
  - [硬件协议](docs/hardware-protocol.zh-CN.md)
- 英文协议文档：
  - [IDE / Agent protocol](docs/ide-protocol.md)
  - [hardware protocol](docs/hardware-protocol.md)

## 赞助商

<a href="https://www.seeedstudio.com/">
  <img src="https://www.seeed.cc/_next/image?q=90&amp;url=%2Fpub%2Fimages%2Flogo.png&amp;w=3840" alt="Seeed Studio" width="220">
</a>

## 参与贡献

欢迎提交想法、问题反馈、硬件适配、新的 AI 编程助手集成、翻译和 UI 优化。如果你想贡献代码，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，其中包含开发环境、打包、测试和 PR 流程说明。
