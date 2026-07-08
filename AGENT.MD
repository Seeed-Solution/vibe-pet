# Vibe Pet — Agent Guide

> 面向 **Cursor**、**Codex** 及其他 AI coding agent 的本仓库工作指南。  
> 修改代码前先读本文；协议细节见 `docs/`。

## 快速索引

| 项目 | 值 |
| --- | --- |
| 产品名 | Vibe Pet |
| npm 包名 | `vibe-pet` |
| 当前版本 | `1.7.0` |
| 运行时 | Electron + Node.js ≥ 18 |
| 主入口 | `src/desktop/main.js` |
| 本地 bridge 默认端口 | `17384` |
| 运行时端口文件 | `~/.code-pet/runtime.json` |
| 协议文档 | [IDE/Agent](docs/ide-protocol.md) · [硬件](docs/hardware-protocol.md) |

## 架构

```text
IDE/CLI hooks ──┐
Codex JSONL ────┼──► StateHub (src/host/state-hub.js)
Cursor DB/logs ─┘         │
                          ├──► 主窗口桌宠网格 (src/desktop/)
                          ├──► 桌面浮动桌宠 (pet-overlay)
                          ├──► BLE 写入 (Electron 主进程)
                          └──► GET /api/device-snapshot (Wi-Fi 轮询)
```

- **桌面桥**：Electron 主进程启动 `src/host/` HTTP 服务，负责 hook 上报、状态聚合、Petdex 代理；渲染进程负责 UI 与 BLE。
- **StateHub**：会话 key 为 `agentId:sessionId`；多会话聚合后下发硬件。
- **Petdex**：角色 manifest 来自 `https://petdex.dev/api/manifest`，经 `/api/petdex/manifest` 缓存代理。

参考项目：[clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) 的状态映射思路。

## 目录结构

```text
src/desktop/                         Electron 桌面应用（主窗口 + 浮动桌宠 + BLE + 烧录）
src/host/                            本地 HTTP bridge 与 StateHub
src/host/agent/                      后台监听器（Codex JSONL / Cursor composer / transcript / presence）
src/host/public/                     备用 Web Bluetooth 桥 UI
src/hooks/                           各 agent 的 hook / plugin 脚本
  agent-hook.js                      通用 CLI hook 入口
  cursor-hook.js                     Cursor 专用 hook
  codex-hook.js                      Codex 专用 hook
src/scripts/                         安装、打包、检查、固件打包脚本
src/firmware/
  wio-terminal-code-pet/             Wio Terminal（BLE）
  esp-ai-mini-ext-tft-code-pet/      ESP-AI Mini Ext TFT（BLE）
  sensecap-indicator-code-pet/       SenseCAP Indicator（BLE）
docs/                                协议与贡献文档
scripts/install.{sh,ps1,cmd}         跨平台一键安装
```

## 常用命令

```bash
npm install              # 安装依赖并同步 hooks/plugins
npm start                # 启动桌面应用
npm run dev              # 热更新开发（监听 src/desktop + src/host）
npm run check            # 项目检查
npm run install:hooks    # 手动同步 hooks/plugins
npm run uninstall:hooks  # 卸载 hooks/plugins
npm run bridge:web       # 仅启动 Web 桥（无 Electron）
npm run firmware:package # 打包各硬件 main.bin
npm run build            # electron-builder 安装包（当前平台）
npm run package:current  # Electron Packager 未签名应用包 → dist/
```

端口覆盖：`CODE_PET_PORT=17385 npm start` 或 `npm start -- --port 17385`

跳过 hook 同步：`VIBE_PET_SKIP_HOOKS=1 npm start`

## 给 Cursor 的工作说明

### 集成位置

| 项 | 路径 |
| --- | --- |
| Hook 配置 | `~/.cursor/hooks.json` |
| Hook 脚本 | `src/hooks/cursor-hook.js` |
| 安装逻辑 | `src/scripts/install-hooks.js` → `registerCursor()` |

### Hook 事件（已注册）

`sessionStart` · `sessionEnd` · `beforeSubmitPrompt` · `preToolUse` · `postToolUse` · `postToolUseFailure` · `subagentStart` · `subagentStop` · `preCompact` · `afterAgentThought` · `stop`

### 额外状态来源（无需 hook 也能部分工作）

| 监听器 | 文件 | source 标识 |
| --- | --- | --- |
| Composer DB | `src/host/agent/cursor-composer-monitor.js` | `cursor-composer` |
| Transcript | `src/host/agent/cursor-transcript-monitor.js` | `cursor-transcript` |

### Cursor hook → 桌宠状态

| Hook 事件 | 状态 |
| --- | --- |
| `sessionStart` | `idle` |
| `sessionEnd` | `sleeping` |
| `beforeSubmitPrompt` | `thinking` |
| `preToolUse` | `working` |
| `postToolUse` | `thinking` |
| `postToolUseFailure` | `error` |
| `subagentStart` | `juggling` |
| `preCompact` | `sweeping` |
| `stop` | `attention` |

### 改 Cursor 集成时

- 改事件映射：优先改 `src/hooks/cursor-hook.js` 的 `HOOK_TO_STATE`
- 增删 hook 事件：同步改 `install-hooks.js` 的 `CURSOR_EVENTS`
- 不要破坏 `beforeSubmitPrompt` 需返回 `{"continue":true}` 的行为

## 给 Codex 的工作说明

### 集成位置

| 项 | 路径 |
| --- | --- |
| Hook 配置 | `~/.codex/hooks.json` |
| Feature 开关 | `~/.codex/config.toml` → `[features] hooks = true` |
| Hook 脚本 | `src/hooks/codex-hook.js` |
| JSONL 监听 | `src/host/agent/codex-log-monitor.js` |

### Hook 事件（已注册）

`SessionStart` · `UserPromptSubmit` · `PreToolUse` · `PermissionRequest` · `PostToolUse` · `Stop`

### JSONL 回退

- 路径：`~/.codex/sessions/**/rollout-*.jsonl`
- 当 official hook 未覆盖或延迟时，由 `CodexLogMonitor` 补状态
- 已被 official hook 覆盖的事件见 `state-hub.js` 中 `CODEX_LOG_EVENTS_COVERED_BY_OFFICIAL_HOOKS`

### Codex hook → 桌宠状态

| Hook 事件 | 状态 |
| --- | --- |
| `SessionStart` | `idle` |
| `UserPromptSubmit` | `thinking` |
| `PreToolUse` | `working` |
| `PermissionRequest` | `notification` |
| `PostToolUse` | `thinking` |
| `Stop` | `attention` |

### JSONL 常见事件 → 状态

| JSONL 事件 | 状态 |
| --- | --- |
| `event_msg:task_started` | `thinking` |
| `response_item:function_call` | `working` |
| `event_msg:task_complete` | `attention` → `idle` |
| `event_msg:context_compacted` | `sweeping` |
| 权限相关 | `notification` |

### 改 Codex 集成时

- Hook 映射：`src/hooks/codex-hook.js` 的 `EVENT_TO_STATE`
- JSONL 映射：`src/host/agent/codex-log-monitor.js`
- 安装后用户可能需在 Codex CLI 执行 `/hooks` 并批准新命令

## 其他 Agent 集成

`npm install` / `npm start` / `npm run dev` 会自动调用 `install-hooks.js`。未安装对应 agent 时跳过。

| Agent | 方式 | 配置位置 | agentId |
| --- | --- | --- | --- |
| Windsurf | hooks | `~/.codeium/windsurf/hooks.json` | `windsurf` |
| Claude CLI / Claude Code | hooks | `~/.claude/settings.json` | `claude-code` |
| Gemini CLI | hooks | `~/.gemini/settings.json` | `gemini-cli` |
| Copilot CLI | hooks | `~/.copilot/hooks/hooks.json` 或 `$COPILOT_HOME/...` | `copilot-cli` |
| CodeBuddy | hooks | `~/.codebuddy/settings.json` | `codebuddy` |
| Kimi Code CLI | hooks | `~/.kimi/config.toml` | `kimi-cli` |
| Qwen Code | hooks | `~/.qwen/settings.json` | `qwen-code` |
| Qoder | hooks | `~/.qoder/settings.json` | `qoder` |
| Reasonix CLI | hooks | `~/.reasonix/settings.json` | `reasonix-cli` |
| OpenClaw | plugin | `~/.openclaw/openclaw.json` | — |
| opencode | plugin | `~/.config/opencode/opencode.json` | — |
| Hermes Agent | plugin | `~/.hermes/plugins/code-pet` | — |

通用 CLI 走 `src/hooks/agent-hook.js`，用法：`node agent-hook.js <agentId> <event>`

新增 agent：在 `install-hooks.js` 的 `runAll()` 注册，必要时加专用 hook 脚本。

## 本地 Bridge API

| Endpoint | 方法 | 用途 |
| --- | --- | --- |
| `/api/hook` | POST | 主上报入口 |
| `/state` | POST | 兼容上报入口 |
| `/api/snapshot` | GET | 当前聚合状态 |
| `/api/device-snapshot` | GET | 硬件/Wi-Fi 用紧凑快照 |
| `/api/events` | GET | SSE 状态流 |
| `/api/petdex/manifest` | GET | Petdex 角色 manifest 代理 |
| `/api/protocol` | GET | 协议元信息 |
| `/api/test-state?state=working` | GET | 手动测试 |
| `/bridge` | GET | Web Bluetooth 备用 UI |

Hook 查找端口顺序：`CODE_PET_PORT` → `~/.code-pet/runtime.json` → `17384`–`17388`

完整 payload 与字段说明：[docs/ide-protocol.md](docs/ide-protocol.md) / [中文](docs/ide-protocol.zh-CN.md)

## 桌宠状态

| 状态 | 含义 |
| --- | --- |
| `idle` | 已打开，无活跃任务 |
| `thinking` | 读上下文 / 规划 |
| `working` | 调工具 / 改文件 / 跑命令 |
| `typing` | 输出文本 |
| `building` | 多工作流或构建类任务 |
| `juggling` | 多子任务 / subagent |
| `attention` | 本轮完成，需轻微关注 |
| `notification` | 需审批 / 授权 |
| `error` | 出错 |
| `sweeping` | 压缩 / 清理上下文 |
| `sleeping` | 会话结束或不活跃 |

聚合逻辑在 `src/host/state-hub.js`；硬件包格式在 `src/host/protocol.js`。

## 硬件目标

### 应用内烧录支持的目录

| 目录 | 设备 | BLE 广播名 |
| --- | --- | --- |
| `wio-terminal-code-pet` | Wio Terminal | `VibePet-Wio` |
| `esp-ai-mini-ext-tft-code-pet` | ESP-AI Mini Ext TFT | `VibePet-ESP-AI-Mini-TFT` |
| `sensecap-indicator-code-pet` | SenseCAP Indicator | `VibePet-SenseCAP-Indicator` |

桌面端扫描前缀见 `src/host/protocol.js` 的 `DEVICE_NAME_PREFIXES`（含 `VibePet-*` 与旧名 `CodePet-*`）。

ESP 目标烧录 `main.bin` @ `0x0`（需合并镜像）；Wio 走 Arduino CLI 兜底。打包全部 `main.bin`：

```bash
npm run firmware:package
```

硬件协议：[docs/hardware-protocol.md](docs/hardware-protocol.md)

## 开发约定

1. **最小改动**：只改任务相关文件；hook、StateHub、protocol、固件状态机需保持一致。
2. **复用现有模式**：新 agent 参照 `agent-hook.js` + `install-hooks.js`；新硬件参照已适配的 `wio-terminal-code-pet` / `esp-ai-mini-ext-tft-code-pet` / `sensecap-indicator-code-pet`。
3. **状态单一来源**：规范化状态只通过 `protocol.js` 的 `normalizeState()`；硬件包只通过 `toDevicePacket()`。
4. **会话隔离**：每个真实会话用独立 `sessionId`，key 为 `agentId:sessionId`。
5. **隐私边界**：hook 可上报本地 title/短 output；硬件只收紧凑 display 字段（见协议文档）。
6. **不要提交**：`.env`、密钥、`node_modules/`、`dist/` 产物。
7. **检查**：改完跑 `npm run check`；涉及 UI 用 `npm run dev` 验证。

## 常见任务入口

| 任务 | 主要文件 |
| --- | --- |
| 桌面 UI / BLE / 烧录 | `src/desktop/main.js`, `renderer.js`, `preload.js` |
| 浮动桌宠 | `src/desktop/pet-overlay.js`, `pet-overlay.html` |
| 状态聚合 | `src/host/state-hub.js` |
| HTTP bridge | `src/host/index.js` |
| Hook 安装 | `src/scripts/install-hooks.js` |
| 打包发布 | `src/scripts/package-installers.js`, `electron-builder.json` |
| 固件动画/状态机 | 各 `src/firmware/*/src/main.cpp` |

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [README.zh-CN.md](README.zh-CN.md) | 用户向介绍 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献流程与打包 |
| [docs/protocol.md](docs/protocol.md) | 协议总览 |
| [docs/ide-protocol.md](docs/ide-protocol.md) | IDE/Agent 上报协议 |
| [docs/hardware-protocol.md](docs/hardware-protocol.md) | BLE/Wi-Fi 硬件协议 |
| [src/firmware/README.md](src/firmware/README.md) | 固件目录说明 |
