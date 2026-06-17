#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RUNTIME_PATH = path.join(os.homedir(), ".code-pet", "runtime.json");
const DEBUG_LOG_PATH = path.join(os.homedir(), ".code-pet", "hook-events.jsonl");
const DEFAULT_PORT = 17384;

const EVENT_TO_STATE = {
  SessionStart: "idle",
  UserPromptSubmit: "thinking",
  PreToolUse: "working",
  PermissionRequest: "notification",
  PostToolUse: "thinking",
  Stop: "attention",
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

function appendDebug(data) {
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG_PATH), { recursive: true });
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ at: Date.now(), ...data }) + "\n", "utf8");
  } catch {}
}

function sessionIdFromTranscript(filePath) {
  if (typeof filePath !== "string") return "";
  const fileName = path.basename(filePath);
  const match = fileName.match(
    /^rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
  );
  return match ? match[1] : "";
}

(async () => {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const event = process.argv[2] || payload.hook_event_name || payload.event || "";
  const state = EVENT_TO_STATE[event];
  process.stdout.write("{}\n");
  if (!state) {
    appendDebug({ agent: "codex", event, mapped: false });
    return;
  }

  const sessionId = sessionIdFromTranscript(payload.transcript_path)
    || payload.session_id
    || payload.conversation_id
    || "default";

  const data = {
    agentId: "codex",
    agentName: "Codex",
    sessionId,
    cwd: payload.cwd || "",
    state,
    event,
    source: "codex-official",
  };
  postJson(data);
  appendDebug({ agent: "codex", event, state, sessionId, cwd: data.cwd, source: data.source });
})();
