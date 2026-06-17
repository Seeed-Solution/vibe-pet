"use strict";

const { execFile } = require("child_process");

const AGENTS = [
  {
    id: "codex",
    name: "Codex",
    match: (line) => line.includes("/Codex.app/") || /\bcodex\b/i.test(line),
  },
  {
    id: "cursor",
    name: "Cursor",
    match: (line) => line.includes("/Cursor.app/") || /\bcursor\b/i.test(line),
  },
  {
    id: "windsurf",
    name: "Windsurf",
    match: (line) => line.includes("/Windsurf.app/") || /\bwindsurf\b/i.test(line),
  },
];

class PresenceMonitor {
  constructor(onState, options = {}) {
    this.onState = onState;
    this.hasSession = typeof options.hasSession === "function" ? options.hasSession : () => false;
    this.intervalMs = options.intervalMs || 5000;
    this.verbose = !!options.verbose;
    this.interval = null;
    this.inFlight = false;
  }

  start() {
    if (this.interval) return;
    this.poll();
    this.interval = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  poll() {
    if (this.inFlight) return;
    this.inFlight = true;
    execFile("ps", ["axo", "args"], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      this.inFlight = false;
      if (err) return;
      const lines = String(stdout || "").split("\n");
      for (const agent of AGENTS) {
        if (this.hasSession(agent.id)) continue;
        if (!lines.some((line) => agent.match(line))) continue;
        this.onState({
          agentId: agent.id,
          agentName: agent.name,
          sessionId: "app",
          state: "idle",
          event: "AppRunning",
          title: "等待 hook 事件",
          source: "process-presence",
        });
        if (this.verbose) console.log(`[presence] ${agent.name} app detected`);
      }
    });
  }
}

module.exports = {
  PresenceMonitor,
};
