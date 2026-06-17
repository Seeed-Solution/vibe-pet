"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ACTIVE_SESSION_WINDOW_MS = 5 * 60 * 1000;
const BACKFILL_GRACE_MS = 5000;
const APPROVAL_HEURISTIC_MS = 2000;
const MAX_PARTIAL_BYTES = 64 * 1024;
const MAX_OUTPUT_CHARS = 1200;
const MAX_TITLE_CHARS = 80;

const LOG_EVENT_MAP = {
  session_meta: "idle",
  "event_msg:task_started": "thinking",
  "event_msg:user_message": "thinking",
  "event_msg:guardian_assessment": "working",
  "event_msg:exec_command_end": "thinking",
  "event_msg:patch_apply_end": "thinking",
  "event_msg:custom_tool_call_output": "thinking",
  "response_item:reasoning": "thinking",
  "response_item:function_call": "working",
  "response_item:custom_tool_call": "working",
  "response_item:web_search_call": "working",
  "response_item:function_call_output": "thinking",
  "response_item:custom_tool_call_output": "thinking",
  "event_msg:task_complete": "codex-turn-end",
  "event_msg:context_compacted": "sweeping",
  "event_msg:turn_aborted": "idle",
};

function expandHome(input) {
  if (!input || !input.startsWith("~")) return input;
  return path.join(os.homedir(), input.slice(1));
}

function jsonParseMaybe(input) {
  if (!input || typeof input !== "string") return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function extractSessionId(fileName) {
  const match = String(fileName || "").match(
    /^rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
  );
  if (match) return match[1];
  return path.basename(fileName, ".jsonl");
}

function compactText(value, max = MAX_OUTPUT_CHARS) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3).trimEnd() + "...";
}

function messageTextFromPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.message === "string") return compactText(payload.message);
  if (typeof payload.text === "string") return compactText(payload.text);
  const content = Array.isArray(payload.content) ? payload.content : [];
  const parts = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.text === "string") parts.push(item.text);
    else if (typeof item.output_text === "string") parts.push(item.output_text);
  }
  return compactText(parts.join("\n"));
}

function titleFromUserMessage(payload) {
  const text = messageTextFromPayload(payload);
  if (!text) return "";
  const firstLine = text.split("\n").find((line) => line.trim()) || text;
  return compactText(firstLine, MAX_TITLE_CHARS);
}

class CodexLogMonitor {
  constructor(onState, options = {}) {
    this.onState = onState;
    this.baseDir = expandHome(options.sessionDir || "~/.codex/sessions");
    this.intervalMs = options.intervalMs || 1500;
    this.verbose = !!options.verbose;
    this.startedAtMs = Date.now();
    this.tracked = new Map();
    this.interval = null;
  }

  start() {
    if (this.interval) return;
    this.startedAtMs = Date.now();
    this.poll();
    this.interval = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    for (const tracked of this.tracked.values()) {
      if (tracked.approvalTimer) clearTimeout(tracked.approvalTimer);
    }
    this.tracked.clear();
  }

  poll() {
    for (const dir of this._sessionDirs()) {
      let files = [];
      try {
        files = fs.readdirSync(dir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.startsWith("rollout-") || !file.endsWith(".jsonl")) continue;
        const filePath = path.join(dir, file);
        if (!this.tracked.has(filePath) && !this._isRecentlyActive(filePath)) continue;
        this._pollFile(filePath, file);
      }
    }
  }

  _pollFile(filePath, fileName) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }

    let tracked = this.tracked.get(filePath);
    if (!tracked) {
      const staleHistory = stat.size > 0 && stat.mtimeMs < this.startedAtMs - BACKFILL_GRACE_MS;
      tracked = {
        filePath,
        offset: staleHistory ? stat.size : 0,
        partial: "",
        sessionId: extractSessionId(fileName),
        cwd: "",
        title: "",
        output: "",
        state: "idle",
        event: "",
        hadToolUse: false,
        pendingApprovalDetail: null,
        approvalTimer: null,
      };
      if (staleHistory) this._readSessionMeta(filePath, tracked);
      this.tracked.set(filePath, tracked);
      if (staleHistory) return;
    }

    if (stat.size < tracked.offset) tracked.offset = 0;
    if (stat.size <= tracked.offset) return;

    let text = "";
    try {
      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(stat.size - tracked.offset);
      fs.readSync(fd, buf, 0, buf.length, tracked.offset);
      fs.closeSync(fd);
      tracked.offset = stat.size;
      text = tracked.partial + buf.toString("utf8");
    } catch {
      return;
    }

    const lines = text.split("\n");
    const remainder = lines.pop() || "";
    tracked.partial = remainder.length > MAX_PARTIAL_BYTES ? "" : remainder;

    for (const line of lines) {
      if (line.trim()) this._processLine(line, tracked);
    }
  }

  _processLine(line, tracked) {
    const record = jsonParseMaybe(line.replace(/\r$/, ""));
    if (!record || typeof record !== "object") return;

    const type = record.type || "";
    const payload = record.payload && typeof record.payload === "object" ? record.payload : {};
    const subtype = payload.type || "";
    const key = subtype ? `${type}:${subtype}` : type;

    if (type === "session_meta") {
      this._applySessionMeta(payload, tracked);
    }

    if (type === "turn_context" && typeof payload.summary === "string") {
      const summary = payload.summary.trim();
      if (summary && summary !== "none" && summary !== "auto") tracked.title = summary;
    }

    if (key === "event_msg:user_message") {
      const title = titleFromUserMessage(payload);
      if (title) tracked.title = title;
    }

    const output = this._extractAgentOutput(key, payload);
    if (output) {
      tracked.output = output;
      this._emit(tracked, tracked.state || "thinking", key, { output });
    }

    if (key === "event_msg:task_started") {
      tracked.hadToolUse = false;
    }

    if (
      key === "event_msg:exec_command_end"
      || key === "response_item:function_call_output"
      || key === "event_msg:patch_apply_end"
    ) {
      this._clearApproval(tracked);
    }

    const state = LOG_EVENT_MAP[key];
    if (state === undefined || state === null) return;

    if (state === "codex-turn-end") {
      this._clearApproval(tracked);
      const resolved = tracked.hadToolUse ? "attention" : "idle";
      tracked.hadToolUse = false;
      this._emit(tracked, resolved, key);
      return;
    }

    if (key === "response_item:function_call") {
      tracked.hadToolUse = true;
      const command = this._extractShellCommand(payload);
      if (command) {
        tracked.pendingApprovalDetail = command;
        if (this._isExplicitApprovalRequest(payload)) {
          this._emit(tracked, "notification", "PermissionRequest");
          return;
        }
        if (tracked.approvalTimer) clearTimeout(tracked.approvalTimer);
        tracked.approvalTimer = setTimeout(() => {
          tracked.approvalTimer = null;
          this._emit(tracked, "notification", "PermissionHeuristic");
        }, APPROVAL_HEURISTIC_MS);
      }
    }

    this._emit(tracked, state, key);
  }

  _emit(tracked, state, event, extra = {}) {
    tracked.state = state;
    tracked.event = event;
    this.onState({
      agentId: "codex",
      agentName: "Codex",
      sessionId: tracked.sessionId,
      cwd: tracked.cwd,
      title: tracked.title,
      output: extra.output || tracked.output || "",
      state,
      event,
      source: "codex-log",
    });
    if (this.verbose) {
      console.log(`[codex-log] ${tracked.sessionId} ${event} -> ${state}`);
    }
  }

  _extractAgentOutput(key, payload) {
    if (key === "event_msg:agent_message") return messageTextFromPayload(payload);
    if (key !== "response_item:message") return "";
    if (payload.role && payload.role !== "assistant") return "";
    return messageTextFromPayload(payload);
  }

  _applySessionMeta(payload, tracked) {
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.cwd === "string") tracked.cwd = payload.cwd;
    if (typeof payload.originator === "string" && payload.originator.toLowerCase().includes("desktop")) {
      tracked.agentName = "Codex Desktop";
    }
  }

  _readSessionMeta(filePath, tracked) {
    let text = "";
    try {
      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(Math.min(256 * 1024, fs.statSync(filePath).size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      text = buf.toString("utf8");
    } catch {
      return;
    }

    for (const line of text.split("\n")) {
      const record = jsonParseMaybe(line);
      if (record && record.type === "session_meta") {
        this._applySessionMeta(record.payload, tracked);
        return;
      }
    }
  }

  _extractShellCommand(payload) {
    if (!payload || typeof payload !== "object") return "";
    if (payload.name !== "shell_command" && payload.name !== "exec_command") return "";
    const args = typeof payload.arguments === "string" ? jsonParseMaybe(payload.arguments) : payload.arguments;
    if (!args || typeof args !== "object") return "";
    return String(args.command || args.cmd || "");
  }

  _isExplicitApprovalRequest(payload) {
    if (!payload || typeof payload !== "object") return false;
    const args = typeof payload.arguments === "string" ? jsonParseMaybe(payload.arguments) : payload.arguments;
    if (!args || typeof args !== "object") return false;
    return args.sandbox_permissions === "require_escalated"
      || (typeof args.justification === "string" && args.justification.trim().length > 0);
  }

  _clearApproval(tracked) {
    if (tracked.approvalTimer) clearTimeout(tracked.approvalTimer);
    tracked.approvalTimer = null;
    tracked.pendingApprovalDetail = null;
  }

  _isRecentlyActive(filePath) {
    try {
      return Date.now() - fs.statSync(filePath).mtimeMs <= ACTIVE_SESSION_WINDOW_MS;
    } catch {
      return false;
    }
  }

  _sessionDirs() {
    const dirs = [];
    const seen = new Set();
    const add = (dir) => {
      if (dir && !seen.has(dir)) {
        seen.add(dir);
        dirs.push(dir);
      }
    };

    const now = new Date();
    for (let daysAgo = 0; daysAgo <= 2; daysAgo++) {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      add(path.join(
        this.baseDir,
        String(d.getFullYear()),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
      ));
    }

    for (const dir of this._recentExistingDayDirs(7)) add(dir);
    for (const dir of this._activeDayDirs()) add(dir);
    return dirs;
  }

  _recentExistingDayDirs(limit) {
    const out = [];
    let years = [];
    try {
      years = fs.readdirSync(this.baseDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));
    } catch {
      return out;
    }

    for (const year of years) {
      const yearPath = path.join(this.baseDir, year);
      let months = [];
      try {
        months = fs.readdirSync(yearPath, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name))
          .map((entry) => entry.name)
          .sort((a, b) => b.localeCompare(a));
      } catch {
        continue;
      }

      for (const month of months) {
        const monthPath = path.join(yearPath, month);
        let days = [];
        try {
          days = fs.readdirSync(monthPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name))
            .map((entry) => entry.name)
            .sort((a, b) => b.localeCompare(a));
        } catch {
          continue;
        }
        for (const day of days) {
          out.push(path.join(monthPath, day));
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  _activeDayDirs() {
    const out = new Set();
    for (const dir of this._recentExistingDayDirs(60)) {
      let files = [];
      try {
        files = fs.readdirSync(dir);
      } catch {
        continue;
      }
      if (files.some((file) =>
        file.startsWith("rollout-")
        && file.endsWith(".jsonl")
        && this._isRecentlyActive(path.join(dir, file))
      )) {
        out.add(dir);
      }
    }
    return Array.from(out);
  }
}

module.exports = {
  CodexLogMonitor,
};
