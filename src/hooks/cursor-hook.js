#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RUNTIME_PATH = path.join(os.homedir(), ".code-pet", "runtime.json");
const DEBUG_LOG_PATH = path.join(os.homedir(), ".code-pet", "hook-events.jsonl");
const DEFAULT_PORT = 17384;

const HOOK_TO_STATE = {
  sessionStart: { state: "idle", event: "SessionStart" },
  sessionEnd: { state: "sleeping", event: "SessionEnd" },
  beforeSubmitPrompt: { state: "thinking", event: "UserPromptSubmit" },
  preToolUse: { state: "working", event: "PreToolUse" },
  postToolUse: { state: "thinking", event: "PostToolUse" },
  postToolUseFailure: { state: "error", event: "PostToolUseFailure" },
  stop: { state: "attention", event: "Stop" },
  subagentStart: { state: "juggling", event: "SubagentStart" },
  subagentStop: { state: "thinking", event: "SubagentStop" },
  preCompact: { state: "sweeping", event: "PreCompact" },
  afterAgentThought: { state: "thinking", event: "AfterAgentThought" },
};

function readStdin() {
  return new Promise((resolve) => {
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => resolve(body));
    setTimeout(() => resolve(body), 500).unref();
  });
}

function runtimePort() {
  if (process.env.CODE_PET_PORT) return Number(process.env.CODE_PET_PORT) || DEFAULT_PORT;
  try {
    const data = JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf8"));
    return Number(data.port) || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function appendDebug(data) {
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG_PATH), { recursive: true });
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ at: Date.now(), ...data }) + "\n", "utf8");
  } catch {}
}

function postJson(data) {
  const body = JSON.stringify(data);
  const req = http.request({
    host: "127.0.0.1",
    port: runtimePort(),
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

function stdoutForHook(hookName) {
  return hookName === "beforeSubmitPrompt" ? JSON.stringify({ continue: true }) : "{}";
}

function resolveHookName(payload, fallback) {
  return payload.hook_event_name
    || payload.hookEventName
    || payload.event_name
    || payload.event
    || fallback
    || "";
}

function resolveMapped(hookName, payload) {
  if (hookName === "stop") {
    const status = payload.status || payload.result || "";
    if (String(status).toLowerCase() === "error") return { state: "error", event: "StopFailure" };
  }
  return HOOK_TO_STATE[hookName] || null;
}

function resolveTitle(payload) {
  const values = [
    payload.name,
    payload.title,
    payload.session_title,
    payload.sessionTitle,
    payload.tool_name,
    payload.command,
  ];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  }
  return "";
}

(async () => {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const hookName = resolveHookName(payload, process.argv[2]);
  const mapped = resolveMapped(hookName, payload);
  process.stdout.write(stdoutForHook(hookName) + "\n");
  if (!mapped) {
    appendDebug({ agent: "cursor", hookName, mapped: false });
    return;
  }

  const sessionId = payload.conversation_id || payload.session_id || "default";
  const cwd = payload.cwd
    || (Array.isArray(payload.workspace_roots) && payload.workspace_roots[0])
    || "";
  postJson({
    agentId: "cursor",
    agentName: "Cursor",
    sessionId,
    cwd,
    state: mapped.state,
    event: mapped.event,
    title: resolveTitle(payload),
  });
  appendDebug({ agent: "cursor", hookName, state: mapped.state, event: mapped.event, sessionId, cwd });
})();
