import { readFileSync } from "fs";
import { request } from "http";
import { homedir } from "os";
import { join } from "path";

const AGENT_ID = "openclaw";
const RUNTIME_PATH = join(homedir(), ".code-pet", "runtime.json");
const PORTS = [17384, 17385, 17386, 17387, 17388];
const HOOKS = [
  "session_start",
  "model_call_started",
  "model_call_ended",
  "before_tool_call",
  "after_tool_call",
  "before_compaction",
  "after_compaction",
  "session_end",
];

let cachedPort = null;

function readRuntimePort() {
  try {
    const data = JSON.parse(readFileSync(RUNTIME_PATH, "utf8"));
    return Number.isInteger(Number(data.port)) ? Number(data.port) : null;
  } catch {
    return null;
  }
}

function ports() {
  const out = [];
  const seen = new Set();
  const add = (port) => {
    if (Number.isInteger(port) && !seen.has(port)) {
      seen.add(port);
      out.push(port);
    }
  };
  add(cachedPort);
  add(readRuntimePort());
  for (const port of PORTS) add(port);
  return out;
}

function mapHook(name, event = {}) {
  if (name === "session_start") return { state: "idle", event: "SessionStart" };
  if (name === "model_call_started") return { state: "thinking", event: "UserPromptSubmit" };
  if (name === "model_call_ended") return event.outcome === "error"
    ? { state: "error", event: "StopFailure" }
    : { state: "attention", event: "Stop" };
  if (name === "before_tool_call") return { state: "working", event: "PreToolUse" };
  if (name === "after_tool_call") return event.outcome === "error"
    ? { state: "error", event: "PostToolUseFailure" }
    : { state: "working", event: "PostToolUse" };
  if (name === "before_compaction") return { state: "sweeping", event: "PreCompact" };
  if (name === "after_compaction") return { state: "attention", event: "PostCompact" };
  if (name === "session_end") return { state: "sleeping", event: "SessionEnd" };
  return null;
}

function sessionId(event = {}, ctx = {}) {
  const raw = event.sessionId || ctx.sessionId || event.sessionKey || ctx.sessionKey || "default";
  return String(raw).startsWith(`${AGENT_ID}:`) ? String(raw) : `${AGENT_ID}:${raw}`;
}

function postState(body) {
  const payload = JSON.stringify(body);
  for (const port of ports()) {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path: "/api/hook",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
      timeout: 250,
    }, (res) => {
      if (res.statusCode && res.statusCode < 400) cachedPort = port;
      res.resume();
    });
    req.on("error", () => {});
    req.on("timeout", () => req.destroy());
    req.end(payload);
  }
}

export default {
  id: "code-pet",
  name: "Vibe Pet",
  register(api) {
    if (!api || typeof api.on !== "function") return;
    for (const hookName of HOOKS) {
      api.on(hookName, (event, ctx) => {
        const mapped = mapHook(hookName, event);
        if (!mapped) return;
        postState({
          agentId: AGENT_ID,
          agentName: "OpenClaw",
          sessionId: sessionId(event, ctx),
          cwd: event.cwd || ctx.cwd || "",
          state: mapped.state,
          event: mapped.event,
        });
      }, { priority: -100, timeoutMs: 1000 });
    }
  },
};
