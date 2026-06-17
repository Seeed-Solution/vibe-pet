#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const RUNTIME_PATH = path.join(os.homedir(), ".code-pet", "runtime.json");
const DEFAULT_PORTS = [17384, 17385, 17386, 17387, 17388];

const AGENTS = {
  "claude-code": {
    name: "Claude Code",
    events: {
      SessionStart: "idle",
      SessionEnd: "sleeping",
      UserPromptSubmit: "thinking",
      PreToolUse: "working",
      PostToolUse: "working",
      PostToolUseFailure: "error",
      Stop: "attention",
      StopFailure: "error",
      SubagentStart: "juggling",
      SubagentStop: "working",
      PreCompact: "sweeping",
      PostCompact: "attention",
      Notification: "notification",
      Elicitation: "notification",
      PermissionRequest: "notification",
    },
  },
  "claude-cli": {
    name: "Claude CLI",
    aliasOf: "claude-code",
  },
  "gemini-cli": {
    name: "Gemini CLI",
    stdout: (event) => (event === "BeforeTool" || event === "AfterTool")
      ? JSON.stringify({ decision: "allow" })
      : "{}",
    events: {
      SessionStart: "idle",
      SessionEnd: "sleeping",
      BeforeAgent: "thinking",
      BeforeTool: "working",
      AfterTool: "working",
      AfterAgent: "idle",
      Notification: "notification",
      PreCompress: "sweeping",
    },
  },
  "copilot-cli": {
    name: "Copilot CLI",
    events: {
      sessionStart: "idle",
      sessionEnd: "sleeping",
      userPromptSubmitted: "thinking",
      preToolUse: "working",
      postToolUse: "working",
      errorOccurred: "error",
      agentStop: "attention",
      subagentStart: "juggling",
      subagentStop: "working",
      preCompact: "sweeping",
      permissionRequest: "notification",
    },
  },
  codebuddy: {
    name: "CodeBuddy",
    events: {
      SessionStart: "idle",
      SessionEnd: "sleeping",
      UserPromptSubmit: "thinking",
      PreToolUse: "working",
      PostToolUse: "working",
      PostToolUseFailure: "error",
      Stop: "attention",
      PermissionRequest: "notification",
      Notification: "notification",
      PreCompact: "sweeping",
    },
  },
  windsurf: {
    name: "Windsurf",
    events: {
      pre_read_code: "working",
      post_read_code: "thinking",
      pre_write_code: "working",
      post_write_code: "thinking",
      pre_run_command: "working",
      post_run_command: "thinking",
      pre_mcp_tool_use: "working",
      post_mcp_tool_use: "thinking",
      pre_user_prompt: "thinking",
      post_cascade_response: "attention",
      post_cascade_response_with_transcript: "attention",
      post_setup_worktree: "working",
    },
  },
  "kimi-cli": {
    name: "Kimi Code CLI",
    events: {
      SessionStart: "idle",
      SessionEnd: "sleeping",
      UserPromptSubmit: "thinking",
      PreToolUse: "working",
      PostToolUse: "working",
      PostToolUseFailure: "error",
      Stop: "attention",
      StopFailure: "error",
      SubagentStart: "juggling",
      SubagentStop: "working",
      PreCompact: "sweeping",
      PostCompact: "attention",
      Notification: "notification",
    },
  },
  "qwen-code": {
    name: "Qwen Code",
    events: {
      SessionStart: "idle",
      SessionEnd: "sleeping",
      UserPromptSubmit: "thinking",
      PreToolUse: "working",
      PostToolUse: "working",
      Stop: "attention",
      PermissionRequest: "notification",
      Notification: "notification",
    },
  },
  qoder: {
    name: "Qoder",
    events: {
      SessionStart: "idle",
      UserPromptSubmit: "thinking",
      PreToolUse: "working",
      PostToolUse: "working",
      PostToolUseFailure: "error",
      Stop: "attention",
      Notification: "notification",
      PermissionRequest: "notification",
      PermissionDenied: "notification",
      SessionEnd: "sleeping",
    },
  },
  reasonix: {
    name: "Reasonix CLI",
    events: {
      SessionStart: "idle",
      SessionEnd: "sleeping",
      UserPromptSubmit: "thinking",
      PreToolUse: "working",
      PostToolUse: "working",
      Stop: "attention",
      SubagentStop: "working",
      Notification: "notification",
      PreCompact: "sweeping",
    },
  },
};

function resolveAgent(id) {
  const agent = AGENTS[id] || null;
  if (!agent || !agent.aliasOf) return agent;
  return { ...AGENTS[agent.aliasOf], name: agent.name };
}

function readStdin() {
  return new Promise((resolve) => {
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => resolve(body));
    setTimeout(() => resolve(body), 500).unref();
  });
}

function parseJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function nestedString(input, ...keys) {
  let current = input;
  for (const key of keys) {
    if (!current || typeof current !== "object") return "";
    current = current[key];
  }
  return typeof current === "string" && current.trim() ? current.trim() : "";
}

function dirnameOfAbsolute(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) return "";
  return path.dirname(value);
}

function resolveHookName(payload, fallback) {
  return firstString(
    payload.agent_action_name,
    payload.hook_event_name,
    payload.hookEventName,
    payload.event,
    payload.event_name,
    fallback
  );
}

function resolveSessionId(agentId, payload) {
  const raw = firstString(
    payload.trajectory_id,
    payload.execution_id,
    payload.session_id,
    payload.sessionId,
    payload.conversation_id,
    payload.conversationId,
    nestedString(payload, "tool_info", "trajectory_id"),
    nestedString(payload, "tool_info", "execution_id"),
    payload.transcript_path && path.basename(payload.transcript_path, ".jsonl"),
    "default"
  );
  return raw.startsWith(`${agentId}:`) ? raw : `${agentId}:${raw}`;
}

function resolveCwd(payload) {
  const toolInfo = payload.tool_info && typeof payload.tool_info === "object" ? payload.tool_info : {};
  return firstString(
    payload.cwd,
    payload.workspace_root,
    Array.isArray(payload.workspace_roots) ? payload.workspace_roots[0] : "",
    payload.project_dir,
    payload.directory,
    payload.root_workspace_path,
    payload.workspace_path,
    toolInfo.cwd,
    toolInfo.root_workspace_path,
    toolInfo.workspace_path,
    toolInfo.worktree_path,
    dirnameOfAbsolute(toolInfo.file_path),
    dirnameOfAbsolute(toolInfo.path),
    dirnameOfAbsolute(payload.file_path),
    dirnameOfAbsolute(payload.path)
  );
}

function resolveTitle(payload) {
  const toolInfo = payload.tool_info && typeof payload.tool_info === "object" ? payload.tool_info : {};
  return firstString(
    payload.title,
    payload.name,
    payload.session_title,
    payload.sessionTitle,
    payload.user_prompt,
    payload.prompt_text,
    toolInfo.user_prompt,
    toolInfo.command,
    toolInfo.command_line,
    toolInfo.file_path,
    toolInfo.path,
    toolInfo.name,
    payload.prompt && typeof payload.prompt === "string" ? payload.prompt.split(/\r?\n/)[0] : ""
  ).slice(0, 80);
}

function runtimePorts() {
  const ports = [];
  const seen = new Set();
  const add = (port) => {
    const n = Number(port);
    if (Number.isInteger(n) && n > 0 && n < 65536 && !seen.has(n)) {
      seen.add(n);
      ports.push(n);
    }
  };
  if (process.env.CODE_PET_PORT) add(process.env.CODE_PET_PORT);
  try {
    const data = JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf8"));
    add(data.port);
  } catch {}
  for (const port of DEFAULT_PORTS) add(port);
  return ports;
}

function postJson(data) {
  const body = JSON.stringify(data);
  for (const port of runtimePorts()) {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/hook",
      method: "POST",
      timeout: 200,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    });
    req.on("error", () => {});
    req.on("timeout", () => req.destroy());
    req.end(body);
  }
}

function outputFor(agent, hookName) {
  if (typeof agent.stdout === "function") return agent.stdout(hookName);
  return "{}";
}

(async () => {
  const agentId = process.argv[2] || "";
  const fallbackEvent = process.argv[3] || "";
  const agent = resolveAgent(agentId);
  const raw = await readStdin();
  const payload = parseJson(raw);
  const hookName = resolveHookName(payload, fallbackEvent);
  process.stdout.write(outputFor(agent || {}, hookName) + "\n");
  if (!agent || !hookName) return;

  let state = agent.events[hookName];
  if (agentId === "gemini-cli" && hookName === "AfterTool") {
    const response = payload.tool_response;
    if (response && response.error) state = "error";
  }
  if (!state) return;

  postJson({
    agentId,
    agentName: agent.name,
    sessionId: resolveSessionId(agentId, payload),
    cwd: resolveCwd(payload),
    title: resolveTitle(payload),
    state,
    event: hookName,
    source: `${agentId}-hook`,
  });
})();
