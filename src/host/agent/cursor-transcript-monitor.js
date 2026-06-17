"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const RECENT_SESSION_WINDOW_MS = 12 * 60 * 60 * 1000;
const ACTIVE_STATE_WINDOW_MS = 2 * 60 * 1000;
const BACKFILL_GRACE_MS = 5000;
const KEEPALIVE_MS = 30000;
const MAX_PARTIAL_BYTES = 64 * 1024;
const MAX_TAIL_BYTES = 256 * 1024;
const MAX_OUTPUT_CHARS = 1200;
const MAX_TITLE_CHARS = 80;
const DEFAULT_MAX_PROJECT_DIRS = 60;
const DEFAULT_MAX_SESSION_DIRS = 40;
const DEFAULT_MAX_FILES = 12;

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

function compactText(value, max = MAX_OUTPUT_CHARS) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3).trimEnd() + "...";
}

function cleanCursorText(value) {
  if (typeof value !== "string") return "";
  return compactText(value.replace(/\[REDACTED\]/g, "").trim());
}

function stripUserQuery(value) {
  const text = compactText(value, 4000);
  const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  return compactText((match ? match[1] : text)
    .replace(/<\/?user_query>/gi, "")
    .replace(/<attached_files>[\s\S]*?<\/attached_files>/gi, "")
    .trim(), MAX_TITLE_CHARS);
}

function firstNonEmptyLine(value) {
  const text = compactText(value, MAX_TITLE_CHARS * 3);
  return compactText(text.split("\n").find((line) => line.trim()) || text, MAX_TITLE_CHARS);
}

function contentItems(message) {
  if (!message || typeof message !== "object") return [];
  if (typeof message.content === "string") {
    return [{ type: "text", text: message.content }];
  }
  return Array.isArray(message.content) ? message.content : [];
}

function userTitleFromMessage(message) {
  const text = contentItems(message)
    .filter((item) => item && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
  return firstNonEmptyLine(stripUserQuery(text));
}

function valueAt(input, keys) {
  if (!input || typeof input !== "object") return "";
  for (const key of keys) {
    if (typeof input[key] === "string" && input[key].trim()) return input[key].trim();
  }
  return "";
}

function formatToolUse(item) {
  const name = item.name || item.tool_name || item.toolName || "tool";
  const input = item.input && typeof item.input === "object" ? item.input : {};
  const detail = valueAt(input, ["command", "path", "file_path", "filePath", "query", "glob_pattern", "pattern"]);
  if (detail) return compactText(`Tool ${name}: ${detail}`, MAX_OUTPUT_CHARS);
  return `Tool ${name}`;
}

function absolutePathFromTool(item) {
  const input = item && item.input && typeof item.input === "object" ? item.input : {};
  const value = valueAt(input, ["path", "file_path", "filePath"]);
  return path.isAbsolute(value) ? value : "";
}

function assistantInfoFromMessage(message) {
  const texts = [];
  const toolUses = [];
  const paths = [];

  for (const item of contentItems(message)) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.text === "string") {
      const clean = cleanCursorText(item.text);
      if (clean) texts.push(clean);
    } else if (item.type === "tool_use" || item.name || item.tool_name) {
      toolUses.push(formatToolUse(item));
      const toolPath = absolutePathFromTool(item);
      if (toolPath) paths.push(toolPath);
    }
  }

  return {
    output: compactText(texts.join("\n")),
    toolOutput: compactText(toolUses.join("\n")),
    hasToolUse: toolUses.length > 0,
    paths,
  };
}

function extractSessionId(filePath, fileName) {
  const fromFile = path.basename(fileName || filePath, ".jsonl");
  if (fromFile) return fromFile;
  return path.basename(path.dirname(filePath));
}

function statDir(dir) {
  try {
    const stat = fs.statSync(dir);
    return stat.isDirectory() ? stat : null;
  } catch {
    return null;
  }
}

function tryDirectory(dir) {
  const stat = statDir(dir);
  return stat ? dir : "";
}

function decodeSegmentsFrom(root, segments) {
  const chosen = [];
  let current = root;
  let index = 0;

  while (index < segments.length) {
    let matched = "";
    let matchedCount = 0;
    for (let count = 1; count <= segments.length - index; count++) {
      const name = segments.slice(index, index + count).join("-");
      const candidate = path.join(current, name);
      if (tryDirectory(candidate)) {
        matched = name;
        matchedCount = count;
        break;
      }
    }

    if (!matched) return "";
    chosen.push(matched);
    current = path.join(current, matched);
    index += matchedCount;
  }

  return path.join(root, ...chosen);
}

function cwdFromProjectDir(projectDir) {
  const slug = path.basename(projectDir || "");
  if (!slug) return "";

  const home = os.homedir();
  const homeSlug = home.split(path.sep).filter(Boolean).join("-");
  if (slug === homeSlug) return home;
  if (slug.startsWith(`${homeSlug}-`)) {
    const segments = slug.slice(homeSlug.length + 1).split("-").filter(Boolean);
    return decodeSegmentsFrom(home, segments) || path.join(home, ...segments);
  }

  const absolute = `/${slug.split("-").filter(Boolean).join("/")}`;
  return tryDirectory(absolute) || "";
}

class CursorTranscriptMonitor {
  constructor(onState, options = {}) {
    this.onState = onState;
    this.baseDir = expandHome(options.baseDir || "~/.cursor/projects");
    this.intervalMs = options.intervalMs || 1500;
    this.recentSessionWindowMs = options.recentSessionWindowMs || RECENT_SESSION_WINDOW_MS;
    this.activeStateWindowMs = options.activeStateWindowMs || ACTIVE_STATE_WINDOW_MS;
    this.keepaliveMs = options.keepaliveMs || KEEPALIVE_MS;
    this.maxProjectDirs = options.maxProjectDirs || DEFAULT_MAX_PROJECT_DIRS;
    this.maxSessionDirs = options.maxSessionDirs || DEFAULT_MAX_SESSION_DIRS;
    this.maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
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
    this.tracked.clear();
  }

  poll() {
    const files = this._transcriptFiles();
    for (const item of files) this._pollFile(item);
  }

  _pollFile(item) {
    let stat = item.stat;
    try {
      stat = stat || fs.statSync(item.filePath);
    } catch {
      return;
    }

    let tracked = this.tracked.get(item.filePath);
    if (!tracked) {
      tracked = {
        filePath: item.filePath,
        offset: stat.size,
        partial: "",
        projectDir: item.projectDir,
        sessionId: extractSessionId(item.filePath, item.fileName),
        cwd: cwdFromProjectDir(item.projectDir),
        title: "",
        output: "",
        state: "idle",
        event: "cursor:transcript",
        lastEmitAt: 0,
      };
      this._seedFromTail(item.filePath, tracked, stat);
      this.tracked.set(item.filePath, tracked);
      this._emitSeed(tracked, stat);
      if (stat.size > 0 && stat.mtimeMs < this.startedAtMs - BACKFILL_GRACE_MS) return;
    }

    if (stat.size < tracked.offset) tracked.offset = 0;
    if (stat.size <= tracked.offset) {
      this._maybeKeepAlive(tracked, stat);
      return;
    }

    let text = "";
    try {
      const fd = fs.openSync(item.filePath, "r");
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

  _seedFromTail(filePath, tracked, stat) {
    if (!stat.size) return;
    let text = "";
    try {
      const size = Math.min(MAX_TAIL_BYTES, stat.size);
      const start = Math.max(0, stat.size - size);
      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, start);
      fs.closeSync(fd);
      text = buf.toString("utf8");
      if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    } catch {
      return;
    }

    for (const line of text.split("\n")) {
      if (line.trim()) this._processLine(line, tracked, { silent: true });
    }
  }

  _emitSeed(tracked, stat) {
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > this.activeStateWindowMs) return;
    if (!tracked.title && !tracked.output && ageMs > this.recentSessionWindowMs) return;
    this._emit(tracked, tracked.state || "idle", tracked.event || "cursor:transcript");
  }

  _maybeKeepAlive(tracked, stat) {
    const now = Date.now();
    if (now - stat.mtimeMs > this.activeStateWindowMs) return;
    if (tracked.state === "idle") return;
    if (now - tracked.lastEmitAt < this.keepaliveMs) return;
    const state = now - stat.mtimeMs <= this.activeStateWindowMs ? tracked.state : "idle";
    this._emit(tracked, state || "idle", state === "idle" ? "cursor:idle" : tracked.event || "cursor:transcript");
  }

  _processLine(line, tracked, options = {}) {
    const record = jsonParseMaybe(line.replace(/\r$/, ""));
    if (!record || typeof record !== "object") return;

    if (record.role === "user") {
      const title = userTitleFromMessage(record.message);
      if (title) tracked.title = title;
      tracked.output = "";
      if (!options.silent) this._emit(tracked, "thinking", "cursor:user_message", { output: "" });
      else {
        tracked.state = "thinking";
        tracked.event = "cursor:user_message";
      }
      return;
    }

    if (record.role !== "assistant") return;

    const info = assistantInfoFromMessage(record.message);
    if (!tracked.cwd && info.paths.length) tracked.cwd = path.dirname(info.paths[0]);

    if (info.hasToolUse) {
      tracked.output = info.toolOutput || info.output || tracked.output;
      if (!options.silent) this._emit(tracked, "working", "cursor:tool_use");
      else {
        tracked.state = "working";
        tracked.event = "cursor:tool_use";
      }
      return;
    }

    if (info.output) {
      tracked.output = info.output;
      if (!options.silent) this._emit(tracked, "attention", "cursor:assistant_message");
      else {
        tracked.state = "attention";
        tracked.event = "cursor:assistant_message";
      }
      return;
    }

    if (!options.silent) this._emit(tracked, "thinking", "cursor:assistant_message");
    else {
      tracked.state = "thinking";
      tracked.event = "cursor:assistant_message";
    }
  }

  _emit(tracked, state, event, extra = {}) {
    tracked.state = state;
    tracked.event = event;
    tracked.lastEmitAt = Date.now();
    const hasOutput = Object.prototype.hasOwnProperty.call(extra, "output");
    this.onState({
      agentId: "cursor",
      agentName: "Cursor",
      sessionId: tracked.sessionId,
      cwd: tracked.cwd,
      title: tracked.title,
      output: hasOutput ? extra.output : tracked.output || "",
      state,
      event,
      source: "cursor-transcript",
    });
    if (this.verbose) {
      console.log(`[cursor-transcript] ${tracked.sessionId} ${event} -> ${state}`);
    }
  }

  _transcriptFiles() {
    const files = [];
    const cutoff = Date.now() - this.recentSessionWindowMs;

    for (const project of this._projectDirs()) {
      const transcriptDir = path.join(project.path, "agent-transcripts");
      const transcriptStat = statDir(transcriptDir);
      if (!transcriptStat) continue;

      const entries = this._sortedDirEntries(transcriptDir)
        .slice(0, this.maxSessionDirs);
      for (const entry of entries) {
        const entryPath = path.join(transcriptDir, entry.name);
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          this._pushTranscriptFile(files, project.path, entryPath, entry.name, cutoff);
          continue;
        }
        if (!entry.isDirectory()) continue;

        const nested = this._sortedDirEntries(entryPath);
        for (const file of nested) {
          if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
          this._pushTranscriptFile(files, project.path, path.join(entryPath, file.name), file.name, cutoff);
        }
      }
    }

    files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    const byProject = [];
    const seenProjects = new Set();
    for (const file of files) {
      if (seenProjects.has(file.projectDir)) continue;
      seenProjects.add(file.projectDir);
      byProject.push(file);
      if (byProject.length >= this.maxFiles) break;
    }
    return byProject;
  }

  _pushTranscriptFile(files, projectDir, filePath, fileName, cutoff) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }
    if (!this.tracked.has(filePath) && stat.mtimeMs < cutoff) return;
    files.push({ projectDir, filePath, fileName, stat });
  }

  _projectDirs() {
    let entries = [];
    try {
      entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const dirs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(this.baseDir, entry.name);
      try {
        dirs.push({ path: fullPath, stat: fs.statSync(fullPath) });
      } catch {}
    }

    dirs.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return dirs.slice(0, this.maxProjectDirs);
  }

  _sortedDirEntries(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    return entries
      .map((entry) => {
        try {
          return {
            name: entry.name,
            isFile: () => entry.isFile(),
            isDirectory: () => entry.isDirectory(),
            stat: fs.statSync(path.join(dir, entry.name)),
          };
        } catch {
          return {
            name: entry.name,
            isFile: () => entry.isFile(),
            isDirectory: () => entry.isDirectory(),
            stat: { mtimeMs: 0 },
          };
        }
      })
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  }
}

module.exports = {
  CursorTranscriptMonitor,
  cwdFromProjectDir,
};
