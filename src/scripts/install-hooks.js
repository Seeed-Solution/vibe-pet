#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;
const MANAGED_MARKERS = ["code-pet", "agent-hook.js", "codex-hook.js", "cursor-hook.js"];

const CURSOR_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "subagentStart",
  "subagentStop",
  "preCompact",
  "afterAgentThought",
  "stop",
];

const WINDSURF_EVENTS = [
  "pre_read_code",
  "post_read_code",
  "pre_write_code",
  "post_write_code",
  "pre_run_command",
  "post_run_command",
  "pre_mcp_tool_use",
  "post_mcp_tool_use",
  "pre_user_prompt",
  "post_cascade_response",
  "post_cascade_response_with_transcript",
  "post_setup_worktree",
];

const CODEX_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "Stop",
];

const CLAUDE_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Notification",
  "Elicitation",
  "PermissionRequest",
];

const GEMINI_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "BeforeAgent",
  "AfterAgent",
  "BeforeTool",
  "AfterTool",
  "Notification",
  "PreCompress",
];

const COPILOT_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "errorOccurred",
  "agentStop",
  "subagentStart",
  "subagentStop",
  "preCompact",
  "permissionRequest",
];

const CODEBUDDY_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "PermissionRequest",
  "Notification",
  "PreCompact",
];

const KIMI_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Notification",
];

const QWEN_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "PermissionRequest",
  "Notification",
];

const QODER_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "Notification",
  "PermissionRequest",
  "PermissionDenied",
  "SessionEnd",
];

const REASONIX_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SubagentStop",
  "Notification",
  "PreCompact",
];

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function commandFor(script, ...args) {
  return [NODE, path.join(ROOT, "hooks", script), ...args].map(quote).join(" ");
}

function genericCommand(agentId, event) {
  return commandFor("agent-hook.js", agentId, event);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function pathExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function managedText(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return MANAGED_MARKERS.some((marker) => text.includes(marker));
}

function removeManagedEntries(entries) {
  if (!Array.isArray(entries)) return { entries: [], removed: 0 };
  const out = [];
  let removed = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      out.push(entry);
      continue;
    }
    if (Array.isArray(entry.hooks)) {
      const hooks = entry.hooks.filter((hook) => !managedText(hook));
      removed += entry.hooks.length - hooks.length;
      if (hooks.length) out.push({ ...entry, hooks });
      else removed += 1;
      continue;
    }
    if (managedText(entry)) {
      removed += 1;
    } else {
      out.push(entry);
    }
  }
  return { entries: out, removed };
}

function skipIfMissing(dir, name, silent) {
  if (pathExists(dir)) return false;
  if (!silent) console.log(`${name}: ${dir} not found, skipped`);
  return true;
}

function registerCursor({ uninstall = false, silent = false } = {}) {
  const filePath = path.join(os.homedir(), ".cursor", "hooks.json");
  const config = readJson(filePath);
  if (!config.hooks || typeof config.hooks !== "object") config.hooks = {};
  if (typeof config.version !== "number") config.version = 1;

  let added = 0;
  let removed = 0;
  for (const event of CURSOR_EVENTS) {
    const arr = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    const clean = removeManagedEntries(arr);
    removed += clean.removed;
    if (uninstall) {
      if (clean.entries.length) config.hooks[event] = clean.entries;
      else delete config.hooks[event];
      continue;
    }
    clean.entries.push({ command: commandFor("cursor-hook.js", event) });
    config.hooks[event] = clean.entries;
    added++;
  }

  writeJson(filePath, config);
  return { name: "Cursor", filePath, added: uninstall ? 0 : added, removed, skipped: false };
}

function flatCommandHookEntry(command, options = {}) {
  const entry = {
    command,
    show_output: !!options.showOutput,
  };
  if (process.platform === "win32") entry.powershell = command;
  return entry;
}

function registerFlatCommandHooks({ name, dir, filePath, agentId, events, uninstall = false, silent = false }) {
  if (skipIfMissing(dir, name, silent)) return { name, filePath, added: 0, removed: 0, skipped: true };
  const config = readJson(filePath);
  if (!config.hooks || typeof config.hooks !== "object") config.hooks = {};

  let added = 0;
  let removed = 0;
  for (const event of events) {
    const arr = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    const clean = removeManagedEntries(arr);
    removed += clean.removed;
    if (uninstall) {
      if (clean.entries.length) config.hooks[event] = clean.entries;
      else delete config.hooks[event];
      continue;
    }
    clean.entries.push(flatCommandHookEntry(genericCommand(agentId, event), { showOutput: false }));
    config.hooks[event] = clean.entries;
    added++;
  }

  writeJson(filePath, config);
  return { name, filePath, added: uninstall ? 0 : added, removed, skipped: false };
}

function ensureCodexFeature(configPath) {
  let text = "";
  try {
    text = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  if (!text.trim()) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "[features]\nhooks = true\n", "utf8");
    return true;
  }

  const lines = text.split(/\r?\n/);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const sectionPattern = /^\s*\[[^\]]+\]\s*$/;
  const featuresAt = lines.findIndex((line) => /^\s*\[features\]\s*$/.test(line));
  if (featuresAt >= 0) {
    let sectionEnd = lines.length;
    for (let i = featuresAt + 1; i < lines.length; i++) {
      if (sectionPattern.test(lines[i])) {
        sectionEnd = i;
        break;
      }
    }
    for (let i = featuresAt + 1; i < sectionEnd; i++) {
      const match = lines[i].match(/^(\s*hooks\s*=\s*)(true|false)\s*$/);
      if (!match) continue;
      if (match[2] === "true") return false;
      lines[i] = `${match[1]}true`;
      fs.writeFileSync(configPath, lines.join(newline), "utf8");
      return true;
    }
    lines.splice(featuresAt + 1, 0, "hooks = true");
    fs.writeFileSync(configPath, lines.join(newline), "utf8");
    return true;
  }

  fs.writeFileSync(configPath, `${text.replace(/\s*$/, "")}\n\n[features]\nhooks = true\n`, "utf8");
  return true;
}

function registerCodex({ uninstall = false } = {}) {
  const codexDir = path.join(os.homedir(), ".codex");
  const hooksPath = path.join(codexDir, "hooks.json");
  const configPath = path.join(codexDir, "config.toml");
  const config = readJson(hooksPath);
  if (!config.hooks || typeof config.hooks !== "object") config.hooks = {};

  let added = 0;
  let removed = 0;
  for (const event of CODEX_EVENTS) {
    const arr = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    const clean = removeManagedEntries(arr);
    removed += clean.removed;
    if (uninstall) {
      if (clean.entries.length) config.hooks[event] = clean.entries;
      else delete config.hooks[event];
      continue;
    }
    clean.entries.push({
      hooks: [{
        type: "command",
        command: commandFor("codex-hook.js", event),
        timeout: event === "PermissionRequest" ? 600 : 30,
      }],
    });
    config.hooks[event] = clean.entries;
    added++;
  }

  writeJson(hooksPath, config);
  const featureChanged = uninstall ? false : ensureCodexFeature(configPath);
  return { name: "Codex", filePath: hooksPath, configPath, added: uninstall ? 0 : added, removed, featureChanged };
}

function nestedHookEntry(command, options = {}) {
  const hook = { type: "command", command };
  if (options.named) hook.name = "code-pet";
  if (options.timeout) hook.timeout = options.timeout;
  return {
    matcher: options.matcher === undefined ? "*" : options.matcher,
    hooks: [hook],
  };
}

function registerNestedJsonHooks({ name, dir, filePath, agentId, events, matcher = "*", named = true, uninstall = false, silent = false }) {
  if (skipIfMissing(dir, name, silent)) return { name, filePath, added: 0, removed: 0, skipped: true };
  const config = readJson(filePath);
  if (!config.hooks || typeof config.hooks !== "object") config.hooks = {};

  let added = 0;
  let removed = 0;
  for (const event of events) {
    const arr = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    const clean = removeManagedEntries(arr);
    removed += clean.removed;
    if (uninstall) {
      if (clean.entries.length) config.hooks[event] = clean.entries;
      else delete config.hooks[event];
      continue;
    }
    clean.entries.push(nestedHookEntry(genericCommand(agentId, event), { matcher, named, timeout: 30 }));
    config.hooks[event] = clean.entries;
    added++;
  }

  if (uninstall || added || removed) writeJson(filePath, config);
  return { name, filePath, added: uninstall ? 0 : added, removed, skipped: false };
}

function registerReasonix({ uninstall = false, silent = false } = {}) {
  const dir = path.join(os.homedir(), ".reasonix");
  const filePath = path.join(dir, "settings.json");
  if (skipIfMissing(dir, "Reasonix", silent)) return { name: "Reasonix", filePath, added: 0, removed: 0, skipped: true };
  const config = readJson(filePath);
  if (!config.hooks || typeof config.hooks !== "object") config.hooks = {};

  let added = 0;
  let removed = 0;
  for (const event of REASONIX_EVENTS) {
    const arr = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    const clean = removeManagedEntries(arr);
    removed += clean.removed;
    if (uninstall) {
      if (clean.entries.length) config.hooks[event] = clean.entries;
      else delete config.hooks[event];
      continue;
    }
    clean.entries.push({ match: "*", command: genericCommand("reasonix", event) });
    config.hooks[event] = clean.entries;
    added++;
  }

  if (uninstall || added || removed) writeJson(filePath, config);
  return { name: "Reasonix", filePath, added: uninstall ? 0 : added, removed, skipped: false };
}

function resolveCopilotHome() {
  return process.env.COPILOT_HOME && process.env.COPILOT_HOME.trim()
    ? process.env.COPILOT_HOME.trim()
    : path.join(os.homedir(), ".copilot");
}

function registerCopilot({ uninstall = false, silent = false } = {}) {
  const home = resolveCopilotHome();
  const dir = path.join(home, "hooks");
  const filePath = path.join(dir, "hooks.json");
  if (skipIfMissing(home, "Copilot CLI", silent)) return { name: "Copilot CLI", filePath, added: 0, removed: 0, skipped: true };
  const config = readJson(filePath);
  if (!config.hooks || typeof config.hooks !== "object") config.hooks = {};

  let added = 0;
  let removed = 0;
  for (const event of COPILOT_EVENTS) {
    const arr = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    const clean = removeManagedEntries(arr);
    removed += clean.removed;
    if (uninstall) {
      if (clean.entries.length) config.hooks[event] = clean.entries;
      else delete config.hooks[event];
      continue;
    }
    const command = genericCommand("copilot-cli", event);
    clean.entries.push({
      type: "command",
      bash: command,
      powershell: `& ${command}`,
      timeoutSec: event === "permissionRequest" ? 600 : 5,
    });
    config.hooks[event] = clean.entries;
    added++;
  }

  if (uninstall || added || removed) writeJson(filePath, config);
  return { name: "Copilot CLI", filePath, added: uninstall ? 0 : added, removed, skipped: false };
}

function stripKimiBlocks(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let removed = 0;
  for (let i = 0; i < lines.length;) {
    if (!/^\s*\[\[hooks\]\]\s*$/.test(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const block = [];
    let j = i;
    for (; j < lines.length; j++) {
      if (j !== i && /^\s*\[\[[^\]]+\]\]\s*$/.test(lines[j])) break;
      block.push(lines[j]);
    }
    if (managedText(block.join("\n"))) removed++;
    else out.push(...block);
    i = j;
  }
  return { content: out.join("\n"), removed };
}

function registerKimi({ uninstall = false, silent = false } = {}) {
  const dir = path.join(os.homedir(), ".kimi");
  const filePath = path.join(dir, "config.toml");
  if (skipIfMissing(dir, "Kimi Code CLI", silent)) return { name: "Kimi Code CLI", filePath, added: 0, removed: 0, skipped: true };
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const stripped = stripKimiBlocks(content);
  if (uninstall) {
    fs.writeFileSync(filePath, stripped.content.trimEnd() + "\n", "utf8");
    return { name: "Kimi Code CLI", filePath, added: 0, removed: stripped.removed, skipped: false };
  }
  const blocks = KIMI_EVENTS.map((event) => `[[hooks]]
event = "${event}"
command = '${genericCommand("kimi-cli", event)}'
matcher = ""
timeout = 30
`).join("\n");
  const next = `${stripped.content.replace(/^hooks\s*=\s*\[\]\s*$/m, "").trimEnd()}\n\n${blocks}`;
  fs.writeFileSync(filePath, next.trimStart(), "utf8");
  return { name: "Kimi Code CLI", filePath, added: KIMI_EVENTS.length, removed: stripped.removed, skipped: false };
}

function registerOpencode({ uninstall = false, silent = false } = {}) {
  const dir = path.join(os.homedir(), ".config", "opencode");
  const filePath = path.join(dir, "opencode.json");
  const pluginDir = path.join(ROOT, "hooks", "opencode-plugin").replace(/\\/g, "/");
  if (skipIfMissing(dir, "opencode", silent)) return { name: "opencode", filePath, added: 0, removed: 0, skipped: true };
  const config = readJson(filePath);
  if (!Array.isArray(config.plugin)) config.plugin = [];
  const before = config.plugin.length;
  config.plugin = config.plugin.filter((entry) => !(typeof entry === "string" && (entry === pluginDir || entry.includes("opencode-plugin"))));
  const removed = before - config.plugin.length;
  if (!uninstall) config.plugin.push(pluginDir);
  writeJson(filePath, config);
  return { name: "opencode", filePath, added: uninstall ? 0 : 1, removed, skipped: false };
}

function registerOpenClaw({ uninstall = false, silent = false } = {}) {
  const dir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
  const filePath = process.env.OPENCLAW_CONFIG_PATH || path.join(dir, "openclaw.json");
  const pluginDir = path.join(ROOT, "hooks", "openclaw-plugin").replace(/\\/g, "/");
  if (skipIfMissing(dir, "OpenClaw", silent) || !pathExists(filePath)) {
    return { name: "OpenClaw", filePath, added: 0, removed: 0, skipped: true };
  }
  const config = readJson(filePath);
  if (!config.plugins || typeof config.plugins !== "object") config.plugins = {};
  if (!config.plugins.load || typeof config.plugins.load !== "object") config.plugins.load = {};
  if (!Array.isArray(config.plugins.load.paths)) config.plugins.load.paths = [];
  if (!config.plugins.entries || typeof config.plugins.entries !== "object") config.plugins.entries = {};
  const before = config.plugins.load.paths.length;
  config.plugins.load.paths = config.plugins.load.paths.filter((entry) => !(typeof entry === "string" && entry.includes("openclaw-plugin")));
  const removed = before - config.plugins.load.paths.length;
  if (uninstall) {
    delete config.plugins.entries["code-pet"];
  } else {
    config.plugins.load.paths.push(pluginDir);
    config.plugins.entries["code-pet"] = { enabled: true, hooks: { allowConversationAccess: false } };
  }
  writeJson(filePath, config);
  return { name: "OpenClaw", filePath, added: uninstall ? 0 : 1, removed, skipped: false };
}

function registerHermes({ uninstall = false, silent = false } = {}) {
  const hermesHome = process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
  const targetDir = path.join(hermesHome, "plugins", "code-pet");
  const sourceDir = path.join(ROOT, "hooks", "hermes-plugin");
  if (skipIfMissing(hermesHome, "Hermes Agent", silent)) return { name: "Hermes Agent", filePath: targetDir, added: 0, removed: 0, skipped: true };
  if (uninstall) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    return { name: "Hermes Agent", filePath: targetDir, added: 0, removed: 1, skipped: false };
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of ["plugin.yaml", "__init__.py"]) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }
  const hermesBin = path.join(hermesHome, "hermes-agent", "venv", process.platform === "win32" ? "Scripts/hermes.exe" : "bin/hermes");
  if (pathExists(hermesBin)) {
    spawnSync(hermesBin, ["plugins", "enable", "code-pet"], {
      env: { ...process.env, HERMES_HOME: hermesHome },
      encoding: "utf8",
      timeout: 5000,
    });
  }
  return { name: "Hermes Agent", filePath: targetDir, added: 1, removed: 0, skipped: false };
}

function runAll(options) {
  return [
    registerCursor(options),
    registerCodex(options),
    registerFlatCommandHooks({
      ...options,
      name: "Windsurf",
      dir: path.join(os.homedir(), ".codeium", "windsurf"),
      filePath: path.join(os.homedir(), ".codeium", "windsurf", "hooks.json"),
      agentId: "windsurf",
      events: WINDSURF_EVENTS,
    }),
    registerNestedJsonHooks({
      ...options,
      name: "Claude CLI / Claude Code",
      dir: path.join(os.homedir(), ".claude"),
      filePath: path.join(os.homedir(), ".claude", "settings.json"),
      agentId: "claude-code",
      events: CLAUDE_EVENTS,
      matcher: "",
      named: false,
    }),
    registerNestedJsonHooks({
      ...options,
      name: "Gemini CLI",
      dir: path.join(os.homedir(), ".gemini"),
      filePath: path.join(os.homedir(), ".gemini", "settings.json"),
      agentId: "gemini-cli",
      events: GEMINI_EVENTS,
      matcher: "*",
      named: true,
    }),
    registerCopilot(options),
    registerNestedJsonHooks({
      ...options,
      name: "CodeBuddy",
      dir: path.join(os.homedir(), ".codebuddy"),
      filePath: path.join(os.homedir(), ".codebuddy", "settings.json"),
      agentId: "codebuddy",
      events: CODEBUDDY_EVENTS,
      matcher: "",
      named: false,
    }),
    registerKimi(options),
    registerNestedJsonHooks({
      ...options,
      name: "Qwen Code",
      dir: path.join(os.homedir(), ".qwen"),
      filePath: path.join(os.homedir(), ".qwen", "settings.json"),
      agentId: "qwen-code",
      events: QWEN_EVENTS,
      matcher: "*",
      named: true,
    }),
    registerNestedJsonHooks({
      ...options,
      name: "Qoder",
      dir: path.join(os.homedir(), ".qoder"),
      filePath: path.join(os.homedir(), ".qoder", "settings.json"),
      agentId: "qoder",
      events: QODER_EVENTS,
      matcher: "*",
      named: true,
    }),
    registerReasonix(options),
    registerOpenClaw(options),
    registerOpencode(options),
    registerHermes(options),
  ];
}

function main() {
  const uninstall = process.argv.includes("--uninstall");
  const silent = process.argv.includes("--silent");
  if (process.env.VIBE_PET_SKIP_HOOKS === "1") {
    if (!silent) console.log("Vibe Pet hooks/plugins sync skipped.");
    return;
  }
  const results = runAll({ uninstall, silent });
  if (silent) return;
  console.log(uninstall ? "Vibe Pet hooks/plugins removed." : "Vibe Pet hooks/plugins installed.");
  for (const result of results) {
    const status = result.skipped ? "skipped" : `added=${result.added} removed=${result.removed}`;
    console.log(`${result.name}: ${status} -> ${result.filePath}`);
  }
  if (!uninstall) console.log("Codex users may need to run /hooks once and approve the new commands.");
}

if (require.main === module) main();
