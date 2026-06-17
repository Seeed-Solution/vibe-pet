"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_KEEPALIVE_MS = 5000;
const MAX_TITLE_CHARS = 80;
const MAX_OUTPUT_CHARS = 1200;
const MAX_COMPOSERS = 8;
const RECENT_WINDOW_MS = 12 * 60 * 60 * 1000;
const THINKING_WINDOW_MS = 3 * 60 * 1000;
const WORKING_WINDOW_MS = 15 * 60 * 1000;
const ATTENTION_WINDOW_MS = 60 * 60 * 1000;

function expandHome(input) {
  if (!input || !input.startsWith("~")) return input;
  return path.join(os.homedir(), input.slice(1));
}

function compactText(value, max = MAX_OUTPUT_CHARS) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3).trimEnd() + "...";
}

function jsonParseMaybe(input) {
  if (!input || typeof input !== "string") return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function basenameOfPath(input) {
  if (typeof input !== "string" || !input.trim()) return "";
  return path.basename(input.replace(/[\\/]+$/, "")) || input;
}

function workspacePathOf(composer = {}) {
  const uri = composer.workspaceIdentifier && composer.workspaceIdentifier.uri;
  if (uri && typeof uri.fsPath === "string" && uri.fsPath.trim()) return uri.fsPath.trim();
  const repo = Array.isArray(composer.trackedGitRepos) && composer.trackedGitRepos[0];
  if (repo && typeof repo.repoPath === "string") return repo.repoPath;
  return "";
}

function titleOf(composer = {}) {
  const candidates = [
    composer.name,
    composer.subtitle,
    composer.unifiedMode === "agent" ? "Cursor Agent" : "",
  ];
  for (const value of candidates) {
    const text = compactText(value, MAX_TITLE_CHARS);
    if (text) return text;
  }
  return "";
}

function outputOf(composer = {}) {
  const parts = [];
  if (typeof composer.subtitle === "string" && composer.subtitle.trim()) parts.push(composer.subtitle.trim());
  if (typeof composer.contextUsagePercent === "number") {
    parts.push(`Context ${Math.round(composer.contextUsagePercent)}%`);
  }
  if (typeof composer.filesChangedCount === "number" && composer.filesChangedCount > 0) {
    parts.push(`${composer.filesChangedCount} files changed`);
  }
  return compactText(parts.join("\n"));
}

function stateOf(composer = {}, aiUpdatedAt = 0, now = Date.now()) {
  if (composer.hasBlockingPendingActions) return "notification";
  if (composer.hasPendingPlan) return "thinking";
  const updatedAt = Math.max(Number(composer.lastUpdatedAt) || 0, Number(composer.conversationCheckpointLastUpdatedAt) || 0);
  const newestAt = Math.max(updatedAt, aiUpdatedAt || 0);
  if (aiUpdatedAt && now - aiUpdatedAt <= WORKING_WINDOW_MS) return "working";
  if (newestAt && now - newestAt <= THINKING_WINDOW_MS) return "thinking";
  if (newestAt && now - newestAt <= ATTENTION_WINDOW_MS) return "attention";
  return "idle";
}

function sqliteValue(dbPath, sql, callback) {
  execFile("sqlite3", [dbPath, sql], { maxBuffer: 8 * 1024 * 1024, timeout: 3000 }, (err, stdout) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null, String(stdout || ""));
  });
}

class CursorComposerMonitor {
  constructor(onState, options = {}) {
    this.onState = onState;
    this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    this.keepaliveMs = options.keepaliveMs || DEFAULT_KEEPALIVE_MS;
    this.globalDb = expandHome(options.globalDb || "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb");
    this.aiDb = expandHome(options.aiDb || "~/.cursor/ai-tracking/ai-code-tracking.db");
    this.maxComposers = options.maxComposers || MAX_COMPOSERS;
    this.recentWindowMs = options.recentWindowMs || RECENT_WINDOW_MS;
    this.verbose = !!options.verbose;
    this.interval = null;
    this.inFlight = false;
    this.lastJson = "";
    this.lastEmitAt = 0;
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
    if (!fs.existsSync(this.globalDb)) return;
    this.inFlight = true;
    this._readComposerHeaders((err, composers) => {
      if (err) {
        this.inFlight = false;
        return;
      }
      this._readAiActivity((aiActivity) => {
        this.inFlight = false;
        this._emitComposers(composers, aiActivity);
      });
    });
  }

  _readComposerHeaders(callback) {
    sqliteValue(this.globalDb, "select value from ItemTable where key='composer.composerHeaders';", (err, stdout) => {
      if (err) {
        callback(err);
        return;
      }
      const data = jsonParseMaybe(stdout.trim());
      const composers = data && Array.isArray(data.allComposers) ? data.allComposers : [];
      callback(null, composers);
    });
  }

  _readAiActivity(callback) {
    if (!fs.existsSync(this.aiDb)) {
      callback(new Map());
      return;
    }
    const sql = [
      "select conversationId, max(createdAt), group_concat(distinct fileName) ",
      "from ai_code_hashes ",
      "where conversationId is not null and conversationId != '' ",
      "group by conversationId ",
      "order by max(createdAt) desc limit 50;",
    ].join("");
    sqliteValue(this.aiDb, sql, (_err, stdout) => {
      const out = new Map();
      for (const line of String(stdout || "").split("\n")) {
        if (!line.trim()) continue;
        const [conversationId, createdAt, fileNames] = line.split("|");
        if (!conversationId) continue;
        out.set(conversationId, {
          updatedAt: Number(createdAt) || 0,
          files: String(fileNames || "").split(",").filter(Boolean),
        });
      }
      callback(out);
    });
  }

  _emitComposers(composers, aiActivity) {
    const now = Date.now();
    const recent = composers
      .filter((composer) => composer && composer.type === "head" && composer.composerId)
      .map((composer) => {
        const ai = aiActivity.get(composer.composerId) || {};
        const updatedAt = Math.max(
          Number(composer.lastUpdatedAt) || 0,
          Number(composer.conversationCheckpointLastUpdatedAt) || 0,
          Number(composer.createdAt) || 0,
          Number(ai.updatedAt) || 0
        );
        const state = stateOf(composer, ai.updatedAt, now);
        return { composer, ai, updatedAt, state };
      })
      .filter((entry) => entry.updatedAt && now - entry.updatedAt <= this.recentWindowMs)
      .filter((entry) => entry.state !== "idle" || now - entry.updatedAt <= ATTENTION_WINDOW_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, this.maxComposers);

    const json = JSON.stringify(recent.map((entry) => [
      entry.composer.composerId,
      entry.updatedAt,
      titleOf(entry.composer),
      entry.state,
    ]));
    const hasLiveState = recent.some((entry) => !["idle", "sleeping"].includes(entry.state));
    if (json === this.lastJson && (!hasLiveState || now - this.lastEmitAt < this.keepaliveMs)) return;
    this.lastJson = json;
    this.lastEmitAt = now;

    for (const entry of [...recent].reverse()) {
      const composer = entry.composer;
      const cwd = workspacePathOf(composer);
      const title = titleOf(composer);
      const aiFiles = Array.isArray(entry.ai.files) ? entry.ai.files.filter(Boolean).slice(0, 3) : [];
      const output = aiFiles.length
        ? compactText(`Edited ${aiFiles.map(basenameOfPath).join(", ")}`)
        : outputOf(composer);
      const state = entry.state;
      this.onState({
        agentId: "cursor",
        agentName: "Cursor",
        sessionId: composer.composerId,
        cwd,
        title,
        output,
        state,
        event: state === "working" ? "cursor:ai_tracking" : "cursor:composer",
        source: "cursor-composer",
        activityUpdatedAt: entry.updatedAt,
      });
      if (this.verbose) {
        console.log(`[cursor-composer] ${composer.composerId} ${state} ${title}`);
      }
    }
  }
}

module.exports = {
  CursorComposerMonitor,
};
