"use strict";

const path = require("path");
const { EventEmitter } = require("events");
const { normalizeState, toDevicePacket } = require("./protocol");

const SESSION_TTL_MS = 10 * 60 * 1000;
const CODEX_OFFICIAL_TTL_MS = 10 * 60 * 1000;
const MAX_OUTPUT_CHARS = 1200;
const DECAY_MS = {
  thinking: 90000,
  working: 180000,
  typing: 180000,
  building: 180000,
  juggling: 180000,
  attention: 8000,
  error: 15000,
  sweeping: 9000,
};

const CODEX_LOG_EVENTS_COVERED_BY_OFFICIAL_HOOKS = new Set([
  "session_meta",
  "event_msg:task_started",
  "event_msg:user_message",
  "event_msg:guardian_assessment",
  "response_item:function_call",
  "response_item:custom_tool_call",
  "response_item:function_call_output",
  "response_item:custom_tool_call_output",
  "event_msg:exec_command_end",
  "event_msg:patch_apply_end",
  "event_msg:custom_tool_call_output",
  "event_msg:task_complete",
]);

const CODEX_WORKING_LIKE_STATES = new Set([
  "thinking",
  "working",
  "typing",
  "building",
  "juggling",
  "notification",
]);

const PRIORITY = {
  error: 100,
  notification: 95,
  permission: 95,
  attention: 80,
  sweeping: 70,
  building: 64,
  juggling: 62,
  typing: 60,
  working: 58,
  thinking: 50,
  sleeping: 10,
  idle: 0,
};

function basenameOfCwd(cwd) {
  if (typeof cwd !== "string" || !cwd.trim()) return "";
  return path.basename(cwd.replace(/[\\/]+$/, "")) || "";
}

function sessionKey(input) {
  const agent = input.agentId || input.agent_id || input.agent || "agent";
  const session = input.sessionId || input.session_id || input.id || "default";
  return `${agent}:${session}`;
}

function sourceOf(input = {}) {
  return input.source || input.hookSource || input.hook_source || "";
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function outputOf(input = {}) {
  if (hasOwn(input, "output")) return input.output;
  if (hasOwn(input, "message")) return input.message;
  if (hasOwn(input, "text")) return input.text;
  return undefined;
}

function normalizeOutput(value) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\r/g, "").trim();
  if (clean.length <= MAX_OUTPUT_CHARS) return clean;
  return clean.slice(0, MAX_OUTPUT_CHARS - 3).trimEnd() + "...";
}

function numericTimestamp(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

class StateHub extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessionTtlMs = options.sessionTtlMs || SESSION_TTL_MS;
    this.sessions = new Map();
    this.decayTimers = new Map();
    this.lastSnapshotJson = "";
  }

  upsert(input = {}) {
    const now = Date.now();
    const key = sessionKey(input);
    const existing = this.sessions.get(key) || {};
    const state = normalizeState(input.state || existing.state || "idle");
    const incomingSource = sourceOf(input);
    const rawOutput = outputOf(input);
    const hasOutput = rawOutput !== undefined;
    const output = hasOutput ? normalizeOutput(rawOutput) : existing.output || "";
    const activityUpdatedAt = numericTimestamp(
      input.activityUpdatedAt,
      input.activity_updated_at,
      input.sourceUpdatedAt,
      input.source_updated_at
    ) || now;
    if (this._shouldSuppressCodexLog(input, existing, incomingSource, state, now)) {
      return this._mergeSuppressedMetadata(key, existing, input);
    }
    const next = {
      ...existing,
      key,
      sessionId: input.sessionId || input.session_id || existing.sessionId || "default",
      agentId: input.agentId || input.agent_id || input.agent || existing.agentId || "agent",
      agentName: input.agentName || input.agent_name || existing.agentName || "",
      state,
      event: input.event || existing.event || "",
      cwd: input.cwd || existing.cwd || "",
      cwdBasename: input.cwdBasename || basenameOfCwd(input.cwd || existing.cwd || ""),
      title: input.title || input.sessionTitle || existing.title || "",
      output,
      outputUpdatedAt: hasOutput && output ? now : existing.outputUpdatedAt,
      activityUpdatedAt,
      source: incomingSource || existing.source || "",
      officialHookAt: incomingSource === "codex-official" ? now : existing.officialHookAt,
      updatedAt: now,
    };

    if (next.sessionId !== "app" && next.agentId) {
      const appKey = `${next.agentId}:app`;
      if (appKey !== key) {
        this.sessions.delete(appKey);
        this._clearDecay(appKey);
      }
    }

    if (next.agentId === "cursor" && next.source === "cursor-composer") {
      this._removeCursorTranscriptSessions(next.sessionId);
    }

    this.sessions.set(key, next);
    this._scheduleDecay(key, next);
    this._emitIfChanged("state", next);
    return next;
  }

  remove(input = {}) {
    const key = sessionKey(input);
    this.sessions.delete(key);
    this._clearDecay(key);
    this._emitIfChanged("session_deleted", { key });
  }

  getAggregate() {
    this._expireOldSessions();
    const sessions = Array.from(this.sessions.values());
    const active = sessions.filter((entry) => !["idle", "sleeping"].includes(entry.state));
    if (!active.length) {
      return {
        state: "idle",
        agent: "agent",
        agentId: "agent",
        event: "",
        activeCount: 0,
        sessionCount: sessions.length,
        title: "",
        cwdBasename: "",
        output: "",
        updatedAt: Date.now(),
      };
    }

    active.sort((a, b) => {
      const score = (PRIORITY[b.state] || 0) - (PRIORITY[a.state] || 0);
      const activityScore = (b.activityUpdatedAt || b.updatedAt || 0) - (a.activityUpdatedAt || a.updatedAt || 0);
      return score || activityScore || b.updatedAt - a.updatedAt;
    });

    const chosen = active[0];
    const workingCount = active.filter((entry) =>
      ["working", "typing", "building", "juggling"].includes(entry.state)
    ).length;

    let state = chosen.state;
    if (workingCount >= 3 && (PRIORITY[state] || 0) <= PRIORITY.building) state = "building";
    else if (workingCount >= 2 && (PRIORITY[state] || 0) <= PRIORITY.juggling) state = "juggling";

    return {
      state,
      agent: chosen.agentName || chosen.agentId,
      agentId: chosen.agentId,
      event: chosen.event,
      activeCount: active.length,
      sessionCount: sessions.length,
      title: chosen.title,
      cwdBasename: chosen.cwdBasename,
      output: chosen.output || "",
      outputUpdatedAt: chosen.outputUpdatedAt,
      updatedAt: chosen.updatedAt,
      devicePacket: toDevicePacket({
        state,
        agent: chosen.agentName || chosen.agentId,
        event: chosen.event,
        activeCount: active.length,
        title: chosen.title,
        cwdBasename: chosen.cwdBasename,
      }),
    };
  }

  getSnapshot() {
    this._expireOldSessions();
    const sessions = this._visibleSessions();
    return {
      aggregate: this.getAggregate(),
      sessions,
    };
  }

  _emitIfChanged(type, item) {
    const aggregate = this.getAggregate();
    const sessions = this._visibleSessions();
    const payload = {
      type,
      at: Date.now(),
      item,
      aggregate,
      sessions,
    };
    const snapshotJson = JSON.stringify({
      aggregate,
      sessions: sessions.map((entry) => ({
        key: entry.key,
        sessionId: entry.sessionId,
        agentId: entry.agentId,
        agentName: entry.agentName,
        state: entry.state,
        event: entry.event,
        cwdBasename: entry.cwdBasename,
        title: entry.title,
        output: entry.output,
        outputUpdatedAt: entry.outputUpdatedAt,
        activityUpdatedAt: entry.activityUpdatedAt,
        source: entry.source,
      })),
    });
    if (snapshotJson !== this.lastSnapshotJson || type !== "state") {
      this.lastSnapshotJson = snapshotJson;
      this.emit("change", payload);
    }
  }

  _scheduleDecay(key, entry) {
    this._clearDecay(key);
    const ms = DECAY_MS[entry.state];
    if (!ms) return;
    this.decayTimers.set(key, setTimeout(() => {
      const current = this.sessions.get(key);
      if (!current || current.updatedAt !== entry.updatedAt) return;
      this.upsert({
        agentId: current.agentId,
        agentName: current.agentName,
        sessionId: current.sessionId,
        cwd: current.cwd,
        title: current.title,
        state: "idle",
        event: "AutoDecay",
      });
    }, ms));
  }

  _clearDecay(key) {
    const timer = this.decayTimers.get(key);
    if (timer) clearTimeout(timer);
    this.decayTimers.delete(key);
  }

  _shouldSuppressCodexLog(input, existing, incomingSource, state, now) {
    if (incomingSource !== "codex-log") return false;
    const agentId = input.agentId || input.agent_id || input.agent || existing.agentId || "";
    if (agentId !== "codex" || existing.agentId !== "codex") return false;
    if (!existing.officialHookAt || now - existing.officialHookAt > CODEX_OFFICIAL_TTL_MS) return false;
    const event = input.event || "";
    if (!CODEX_LOG_EVENTS_COVERED_BY_OFFICIAL_HOOKS.has(event)) return false;
    if (event === "event_msg:task_complete" && CODEX_WORKING_LIKE_STATES.has(existing.state)) return false;
    if (state === "error") return false;
    if (CODEX_WORKING_LIKE_STATES.has(state) || state === "sweeping" || state === "attention") return false;
    return true;
  }

  _mergeSuppressedMetadata(key, existing, input) {
    const rawOutput = outputOf(input);
    const hasOutput = rawOutput !== undefined;
    const output = hasOutput ? normalizeOutput(rawOutput) : existing.output || "";
    const next = {
      ...existing,
      cwd: input.cwd || existing.cwd || "",
      cwdBasename: input.cwdBasename || basenameOfCwd(input.cwd || existing.cwd || ""),
      title: input.title || input.sessionTitle || existing.title || "",
      output,
      outputUpdatedAt: hasOutput && output ? Date.now() : existing.outputUpdatedAt,
      activityUpdatedAt: numericTimestamp(
        input.activityUpdatedAt,
        input.activity_updated_at,
        input.sourceUpdatedAt,
        input.source_updated_at
      ) || existing.activityUpdatedAt || Date.now(),
    };
    this.sessions.set(key, next);
    return next;
  }

  _expireOldSessions() {
    const cutoff = Date.now() - this.sessionTtlMs;
    for (const [key, value] of this.sessions) {
      if (value.updatedAt >= cutoff) continue;
      this.sessions.delete(key);
      this._clearDecay(key);
    }
  }

  _removeCursorTranscriptSessions(activeSessionId) {
    for (const [key, value] of this.sessions) {
      if (value.agentId !== "cursor") continue;
      if (value.sessionId === activeSessionId) continue;
      if (value.source !== "cursor-transcript") continue;
      this.sessions.delete(key);
      this._clearDecay(key);
    }
  }

  _visibleSessions() {
    const sessions = Array.from(this.sessions.values());
    const agentsWithRealSessions = new Set(
      sessions
        .filter((entry) => entry.sessionId !== "app")
        .map((entry) => entry.agentId)
    );
    return sessions.filter((entry) => entry.sessionId !== "app" || !agentsWithRealSessions.has(entry.agentId));
  }
}

module.exports = {
  StateHub,
};
