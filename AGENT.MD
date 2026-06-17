# Vibe Pet

硬件桌宠项目：读取多种 coding agent 状态，在电脑侧归一成桌宠状态，再通过 BLE 下发到 Wio Terminal 或 ESP-AI Mini Ext。

这个仓库参考了 [rullerzhou-afk/clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) 的 agent 状态映射思路：Codex 优先读 `~/.codex/sessions/**/rollout-*.jsonl`，其他 CLI/IDE 通过各自 hook 或插件上报。ESP-AI Mini Ext 是基于 ESP32-S3 的 AI 开发套件，官方资料见 [ESP-AI Mini Ext v1.0.0](https://espai.fun/open/pcb/mini-ext/1.0.0/)，固定引脚来自 [esp-ai-mini-ext 1.0.0](https://espai.fun/skills/esp-ai-mini-ext-1.0.0.md)。

## 项目结构

```text
src/desktop/                 Electron 桌面桥
src/host/                    本地 hook HTTP 服务与状态聚合
src/host/agent/              Codex JSONL 状态监听
src/host/public/             备用 Web Bluetooth 桥接页面与共享样式
src/hooks/                   Codex / Cursor / Windsurf hook 脚本
src/hooks/agent-hook.js      多 agent 通用 hook 脚本
src/scripts/install-hooks.js hook 安装与卸载
src/firmware/wio-terminal-code-pet/
                             Wio Terminal BLE 显示端
src/firmware/esp-ai-mini-ext-status/
                             ESP-AI Mini Ext BLE 状态灯端
src/firmware/esp-display-code-pet/
                             ESP-AI / M5Stack / LILYGO / Heltec / ESP8266 OLED 显示端
docs/protocol.md             BLE / Wi-Fi 硬件协议
```

## 快速开始

1. 安装并同步 hooks：

```bash
npm install
```

`npm install`、`npm start` 和 `npm run dev` 都会默认自动同步 hooks/plugins。Codex 安装后可能需要在 Codex CLI 中运行 `/hooks` 并批准新命令。需要手动重装时仍可运行 `npm run install:hooks`。

跨平台一键安装：

```bash
# macOS / Linux
./scripts/install.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# Windows CMD
scripts\install.cmd
```

安装脚本会检查 Node.js 版本、安装 npm 依赖，并同步 hooks/plugins。可加 `--start` 安装后启动应用，或加 `--dev` 进入热更新开发模式。

2. 烧录 Wio Terminal 固件：

```bash
cd src/firmware/wio-terminal-code-pet
pio run -e wio_terminal -t upload

# 上次指定端口
# ls /dev/cu.usb*
# pio run -e wio_terminal -t upload --upload-port /dev/cu.usbmodemXXXX

```

3. 启动桌面桥：

```bash
npm start
```

4. 在桌面窗口里点击「连接设备」，选择 `VibePet-Wio`。之后 Codex / Cursor / Windsurf 状态变化会自动写入设备。

桌面窗口顶部会显示 `Vibe Pet` 和项目 GitHub Star 角标。中间是桌宠格子视图，每个 Codex、Cursor、Windsurf 或其他 agent 会话都会生成自己的宠物卡片。每张卡片右上角可以单独切换形象，列表来自 Petdex 的公开 manifest，并把选择保存在本地。即使 Cursor / Codex / Windsurf 已启动但还没触发 hook，桌面桥也会先显示一个 idle 的 app 卡片；真实 hook 或日志状态到来后再同步成 active 状态。右侧面板显示设备输出状态，Wio 默认接收所有 agent 聚合后的状态。

卸载 hooks：

```bash
npm run uninstall:hooks
```

## 桌面桥行为

`npm start` 会启动 Electron 桌面程序。窗口负责 BLE 连接和日/夜主题切换，后台仍会启动本地 HTTP 服务给 hooks/plugins 上报状态，并把运行端口写入 `~/.code-pet/runtime.json`。

| Endpoint | 用途 |
| --- | --- |
| `/bridge` | 备用 Web Bluetooth 桥接 UI |
| `/api/events` | SSE 状态流 |
| `/api/petdex/manifest` | Petdex 形象 manifest 缓存代理 |
| `/api/snapshot` | 当前状态快照 |
| `/api/hook` | hook 上报入口 |
| `/state` | 兼容型 hook/plugin 上报入口 |
| `/api/test-state?state=working` | 手动测试状态 |

默认端口是 `17384`，可以通过环境变量或参数修改：

```bash
CODE_PET_PORT=17385 npm start
npm start -- --port 17385
```

旧网页桥仍可备用启动：

```bash
npm run bridge:web
```

开发桌面 UI 时使用热更新模式：

```bash
npm run dev
```

`npm run dev` 会监听 `src/desktop` 和 `src/host`。修改桌面 HTML、renderer 或共享 CSS 时会自动刷新窗口；修改主进程、preload 或 host 逻辑时会自动重启 Electron。`npm start` 仍然是普通运行模式，不做热更新。

跨平台打包：

```bash
npm run package:current
npm run package:mac
npm run package:linux
npm run package:win
npm run package:all
```

打包入口是 `src/scripts/package.js`，内部调用 Electron Packager，默认先执行 `npm run check`，产物输出到 `dist/`。需要指定架构时可追加参数，例如 `npm run package:mac -- --arch arm64`。当前脚本生成未签名应用包，正式分发仍需平台侧签名、公证或安装器流程。

如果连接时出现 `User cancelled the requestDevice() chooser`：

- 先完全退出当前 Vibe Pet 窗口，再重新运行 `npm start`，避免旧桌面进程仍在使用旧代码。
- 确认 Wio Terminal 或 ESP-AI Mini Ext 已上电，并正在广播 `VibePet-Wio` / `VibePet-ESP-AI-Mini`。
- 桌面桥会持续扫描附近 BLE 设备，名字匹配 Vibe Pet 的设备会标记为「推荐」。如果选择了其他 BLE 设备，通常会提示它没有 Vibe Pet BLE 服务。

## 设备端

### Wio Terminal

Wio Terminal 是主显示端，作为 BLE 外设广播 `VibePet-Wio`，接收状态 JSON 后在 TFT 上绘制桌宠。按下五向键中键可以本地循环测试状态。

### ESP-AI Mini Ext

[ESP-AI Mini Ext](https://espai.fun/open/pcb/mini-ext/1.0.0/) 是基于 ESP32-S3 的 AI 开发套件。Vibe Pet 固件使用同一 BLE 协议，广播 `VibePet-ESP-AI-Mini`，用板载 WS2812 显示状态颜色，并通过 GPIO8 读取电池电压。

固定引脚：

| 功能 | GPIO |
| --- | --- |
| WS2812 | 18 |
| KEY | 10 |
| BAT_ADC | 8 |

烧录：

```bash
cd src/firmware/esp-ai-mini-ext-status
pio run -t upload
```

### ESP32 / ESP8266 带屏设备

`src/firmware/esp-display-code-pet` 是多设备显示固件工程。ESP32/S3 设备通过 BLE 接收桌面端下发的 compact packet；ESP8266 没有 BLE，使用 Wi-Fi 轮询桌面桥 `/api/device-snapshot`。该快照包含每个桌宠的状态、会话标题、角色 slug、角色显示名、角色类型和 spritesheet URL，硬件端按同一状态机播放动作。

ESP-AI Common 3.0.0 使用 [官方开发板资料](https://espai.fun/open/pcb/common/3.0.0/) 中的 TFT/状态灯能力。ESP-AI DIY ESP32S3 使用 [DIY 硬件接线](https://espai.fun/guide/1e7b8i8e/) 中的开放平台扩展引脚：OLED `SCL=38`、`SDA=39`，TFT `MOSI=39`、`SCLK=38`、`CS=9`、`DC=13`，WS2812 状态灯 `IO46`。

已内置 PlatformIO 环境：

| 环境 | 设备 |
| --- | --- |
| `esp_ai_common_3_tft` | ESP-AI Common 3.0.0 TFT |
| `esp_ai_diy_esp32s3_oled` | ESP-AI DIY ESP32S3 OLED |
| `m5stack_core2` | M5Stack Core2 |
| `m5stack_cores3` | M5Stack CoreS3 |
| `m5stickc_plus2` | M5StickC Plus2 |
| `m5stack_cardputer` | M5Stack Cardputer |
| `m5stack_atoms3` | M5Stack AtomS3 |
| `lilygo_t_display` | LILYGO T-Display ESP32 |
| `lilygo_t_display_s3` | LILYGO T-Display S3 |
| `heltec_wifi_kit_32` | Heltec WiFi Kit 32 |
| `heltec_wifi_kit_8` | Heltec WiFi Kit 8 |
| `wemos_d1_mini_oled` | WEMOS D1 mini + OLED Shield |

示例：

```bash
pio run -d src/firmware/esp-display-code-pet -e m5stack_core2 -t upload
pio run -d src/firmware/esp-display-code-pet -e lilygo_t_display_s3 -t upload
```

## 支持的 Agent

`npm run install:hooks` 会默认尝试安装/同步这些集成。已存在对应配置目录时会写入；未安装或未初始化的 agent 会跳过。

| Agent | 集成方式 | 默认配置位置 |
| --- | --- | --- |
| Codex | hooks + JSONL fallback | `~/.codex/hooks.json` |
| Windsurf | Cascade hooks | `~/.codeium/windsurf/hooks.json` |
| Claude CLI / Claude Code | hooks | `~/.claude/settings.json` |
| Gemini CLI | hooks | `~/.gemini/settings.json` |
| Copilot CLI | hooks | `~/.copilot/hooks/hooks.json` 或 `$COPILOT_HOME/hooks/hooks.json` |
| CodeBuddy | hooks | `~/.codebuddy/settings.json` |
| Kimi Code CLI | hooks | `~/.kimi/config.toml` |
| Qwen Code | hooks | `~/.qwen/settings.json` |
| OpenClaw | plugin | `~/.openclaw/openclaw.json` |
| opencode | plugin | `~/.config/opencode/opencode.json` |
| Qoder | hooks | `~/.qoder/settings.json` |
| Hermes Agent | plugin | `~/.hermes/plugins/code-pet` |
| Reasonix CLI | hooks | `~/.reasonix/settings.json` |

Cursor hook 仍然保留，因为它是最初项目参考实现的一部分，默认写入 `~/.cursor/hooks.json`。Windsurf 使用 Cascade Hooks 的 user-level 配置，默认写入 `~/.codeium/windsurf/hooks.json`。

## 状态映射

| 上游事件 | 桌宠状态 |
| --- | --- |
| Codex `event_msg:task_started`, Cursor `beforeSubmitPrompt`, Windsurf `pre_user_prompt` | `thinking` |
| Codex `response_item:function_call`, Cursor `preToolUse`, Windsurf `pre_run_command` / `pre_write_code` | `working` |
| 多个活动会话 | `juggling` / `building` |
| Codex 权限请求或权限启发式 | `notification` |
| Cursor `postToolUseFailure` | `error` |
| Codex `event_msg:task_complete`, Cursor `stop` | `attention` 后自动回到 `idle` |
| compact 上下文 | `sweeping` |

协议细节见 [docs/protocol.md](docs/protocol.md)。

## 为什么使用桌面桥

电脑侧直接用 Node 控制 BLE 在 macOS / Linux / Windows 上依赖差异很大。现在默认采用 Electron 桌面桥：Node 主进程负责 agent 状态采集、本地 hook 服务和端口写入，桌面窗口负责 BLE 写入。这样不用依赖外部浏览器标签页，连接状态也更像一个常驻桌面程序。备用 Web 桥仍保留，方便排查兼容问题。
