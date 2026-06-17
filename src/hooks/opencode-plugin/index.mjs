import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const AGENT_ID = "opencode";
const AGENT_NAME = "opencode";
const RUNTIME_PATH = join(homedir(), ".code-pet", "runtime.json");
const PORTS = [17384, 17385, 17386, 17387, 17388];

let cachedPort = null;
let lastSessionId = "opencode:default";

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

function normalizeSessionId(value) {
  const raw = typeof value === "string" && value ? value : "default";
  return raw.startsWith(`${AGENT_ID}:`) ? raw : `${AGENT_ID}:${raw}`;
}

function eventSessionId(event) {
  const props = event && event.properties && typeof event.properties === "object" ? event.properties : {};
  return props.sessionID || event.sessionID || lastSessionId;
}

function mapEvent(event) {
  if (!event || typeof event.type !== "string") return null;
  const status = event.properties && event.properties.status && event.properties.status.type;
  if (event.type === "session.created") return { state: "idle", name: "SessionStart" };
  if (event.type === "session.deleted" || event.type === "server.instance.disposed") return { state: "sleeping", name: "SessionEnd" };
  if (event.type === "message.part.updated") {
    if (status === "running") return { state: "thinking", name: "UserPromptSubmit" };
    if (status === "tool") return { state: "working", name: "PreToolUse" };
    if (status === "error") return { state: "error", name: "StopFailure" };
  }
  if (event.type === "session.idle") return { state: "attention", name: "Stop" };
  if (event.type === "permission.asked") return { state: "notification", name: "PermissionRequest" };
  return null;
}

function postState(body) {
  const payload = JSON.stringify(body);
  for (const port of ports()) {
    fetch(`http://127.0.0.1:${port}/api/hook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    }).then((res) => {
      if (res.ok) cachedPort = port;
    }).catch(() => {});
  }
}

export default async function codePetOpencodePlugin(ctx = {}) {
  const cwd = typeof ctx.directory === "string" ? ctx.directory : "";
  return {
    event: async ({ event }) => {
      const mapped = mapEvent(event);
      const rawSessionId = eventSessionId(event);
      if (rawSessionId) lastSessionId = normalizeSessionId(rawSessionId);
      if (!mapped) return;
      postState({
        agentId: AGENT_ID,
        agentName: AGENT_NAME,
        sessionId: lastSessionId,
        cwd,
        state: mapped.state,
        event: mapped.name,
      });
    },
  };
}
