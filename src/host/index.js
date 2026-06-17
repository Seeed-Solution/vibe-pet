"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { URL } = require("url");
const { CodexLogMonitor } = require("./agent/codex-log-monitor");
const { CursorComposerMonitor } = require("./agent/cursor-composer-monitor");
const { CursorTranscriptMonitor } = require("./agent/cursor-transcript-monitor");
const { getPetdexPets } = require("./petdex");
const { StateHub } = require("./state-hub");
const { SERVICE_UUID, STATE_CHAR_UUID } = require("./protocol");

const DEFAULT_PORT = 17384;
const RUNTIME_PATH = path.join(os.homedir(), ".code-pet", "runtime.json");
const PUBLIC_DIR = path.join(__dirname, "public");

function parseArgs(argv) {
  const out = {
    host: "127.0.0.1",
    port: Number(process.env.CODE_PET_PORT) || DEFAULT_PORT,
    verbose: false,
    codexLog: true,
    cursorTranscript: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host") out.host = argv[++i] || out.host;
    else if (arg === "--port") out.port = Number(argv[++i]) || out.port;
    else if (arg === "--verbose") out.verbose = true;
    else if (arg === "--no-codex-log") out.codexLog = false;
    else if (arg === "--no-cursor-transcript") out.cursorTranscript = false;
  }
  return out;
}

function writeRuntime(port) {
  fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true });
  fs.writeFileSync(RUNTIME_PATH, JSON.stringify({ app: "vibe-pet", port }, null, 2), "utf8");
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function serveStatic(res, fileName) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

function createServer(hub, options) {
  const sseClients = new Set();

  hub.on("change", (payload) => {
    const body = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) client.write(body);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/bridge")) {
      serveStatic(res, "index.html");
      return;
    }
    if (req.method === "GET" && url.pathname === "/bridge.js") {
      serveStatic(res, "bridge.js");
      return;
    }
    if (req.method === "GET" && url.pathname === "/i18n.js") {
      serveStatic(res, "i18n.js");
      return;
    }
    if (req.method === "GET" && url.pathname === "/styles.css") {
      serveStatic(res, "styles.css");
      return;
    }
    if (req.method === "GET" && url.pathname === "/logo.svg") {
      serveStatic(res, "logo.svg");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/protocol") {
      sendJson(res, 200, { serviceUuid: SERVICE_UUID, stateCharUuid: STATE_CHAR_UUID });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/petdex/manifest") {
      try {
        sendJson(res, 200, await getPetdexPets({ force: url.searchParams.get("force") === "1" }));
      } catch (err) {
        sendJson(res, 502, { ok: false, error: err.message });
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/snapshot") {
      sendJson(res, 200, hub.getSnapshot());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/device-snapshot") {
      const snapshot = typeof options.deviceSnapshotProvider === "function"
        ? options.deviceSnapshotProvider()
        : { v: 1, at: Date.now(), pets: [], aggregate: hub.getAggregate().devicePacket };
      sendJson(res, 200, snapshot);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "snapshot", at: Date.now(), ...hub.getSnapshot() })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/test-state") {
      const state = url.searchParams.get("state") || "thinking";
      hub.upsert({
        agentId: "test",
        agentName: "Test",
        sessionId: "manual",
        state,
        event: "ManualTest",
        title: "manual test",
      });
      sendJson(res, 200, hub.getSnapshot());
      return;
    }
    if (req.method === "POST" && (url.pathname === "/api/hook" || url.pathname === "/state")) {
      try {
        const body = await readBody(req);
        const payload = JSON.parse(body || "{}");
        hub.upsert(payload);
        if (options.verbose) console.log("[hook]", payload.agentId || payload.agent_id, payload.event, payload.state);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err.message });
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.closeSseClients = () => {
    for (const client of sseClients) {
      try {
        client.write(`event: shutdown\ndata: {}\n\n`);
        client.end();
      } catch {}
    }
    sseClients.clear();
  };

  return server;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const hub = new StateHub();
  const server = createServer(hub, options);

  let codexMonitor = null;
  if (options.codexLog) {
    codexMonitor = new CodexLogMonitor((state) => hub.upsert(state), { verbose: options.verbose });
    codexMonitor.start();
  }
  let cursorTranscriptMonitor = null;
  let cursorComposerMonitor = null;
  if (options.cursorTranscript) {
    cursorTranscriptMonitor = new CursorTranscriptMonitor((state) => hub.upsert(state), { verbose: options.verbose });
    cursorTranscriptMonitor.start();
    cursorComposerMonitor = new CursorComposerMonitor((state) => hub.upsert(state), { verbose: options.verbose });
    cursorComposerMonitor.start();
  }

  server.listen(options.port, options.host, () => {
    writeRuntime(options.port);
    console.log(`Vibe Pet bridge: http://${options.host}:${options.port}/bridge`);
    console.log(`BLE service: ${SERVICE_UUID}`);
  });

  const shutdown = () => {
    if (codexMonitor) codexMonitor.stop();
    if (cursorComposerMonitor) cursorComposerMonitor.stop();
    if (cursorTranscriptMonitor) cursorTranscriptMonitor.stop();
    if (server.closeSseClients) server.closeSseClients();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) main();

module.exports = {
  createServer,
};
