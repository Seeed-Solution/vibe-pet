"use strict";

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, spawn } = require("child_process");
const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, shell, Tray } = require("electron");
const { CodexLogMonitor } = require("../host/agent/codex-log-monitor");
const { CursorComposerMonitor } = require("../host/agent/cursor-composer-monitor");
const { CursorTranscriptMonitor } = require("../host/agent/cursor-transcript-monitor");
const { PresenceMonitor } = require("../host/agent/presence-monitor");
const { createServer } = require("../host");
const { getPetdexPets } = require("../host/petdex");
const { StateHub } = require("../host/state-hub");
const { SERVICE_UUID } = require("../host/protocol");
const { flashEspMainBin, listSerialPorts: listEspSerialPorts } = require("./esp-flasher");
const { setupAutoUpdater } = require("./updater");
const { HOOK_RUNNER_ENV, runAll: syncAgentHooks } = require("../scripts/install-hooks");

const DEFAULT_PORT = 17384;
const BLUETOOTH_SCAN_NAME_PREFIX = "VibePet";
const PROJECT_REPO_URL = "https://github.com/Seeed-Solution/vibe-pet";
const PROJECT_REPO_API_URL = "https://api.github.com/repos/Seeed-Solution/vibe-pet";
const PETDEX_REPO_URL = "https://github.com/crafter-station/petdex";
const RUNTIME_PATH = path.join(os.homedir(), ".code-pet", "runtime.json");
const ANALYTICS_STATE_PATH = path.join(os.homedir(), ".code-pet", "analytics.json");
const HOOK_RUNNER_PATH = path.join(os.homedir(), ".code-pet", process.platform === "win32" ? "hook-runner.cmd" : "hook-runner");
const HOOK_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const HOOK_SYNC_MIN_INTERVAL_MS = 30 * 1000;
const ANALYTICS_PROVIDER = "tencent-rum";
const DEFAULT_TENCENT_RUM_ID = "3oLdoCL4jZnGkgvoYp";
const DEFAULT_TENCENT_RUM_HOST_URL = "https://aegis.qq.com";
const TENCENT_RUM_HOST_CANDIDATES = [
  { url: "https://rumt-zh.com", region: "china" },
  { url: "https://rumt-sg.com", region: "singapore" },
  { url: "https://rumt-us.com", region: "silicon-valley" },
  { url: "https://aegis.qq.com", region: "default" },
];
const INDEX_HTML = path.join(__dirname, "index.html");
const PET_OVERLAY_HTML = path.join(__dirname, "pet-overlay.html");
const PRELOAD_JS = path.join(__dirname, "preload.js");
const DESKTOP_ASSET_DIR = path.join(__dirname, "assets");
const APP_ICON_BASE = path.join(DESKTOP_ASSET_DIR, "app-icon");
const APP_ICON_PNG = `${APP_ICON_BASE}.png`;
const APP_ICON_ICNS = `${APP_ICON_BASE}.icns`;
const APP_ICON_ICO = `${APP_ICON_BASE}.ico`;
const TRAY_ICON_PNG = path.join(DESKTOP_ASSET_DIR, "tray-icon.png");
const TRAY_TEMPLATE_ICON_PNG = path.join(DESKTOP_ASSET_DIR, "tray-iconTemplate.png");
const LOGO_PNG = path.join(DESKTOP_ASSET_DIR, "logo.png");
const HOST_DIR = path.join(__dirname, "..", "host");
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PET_OVERLAY_WIDTH = 172;
const PET_OVERLAY_HEIGHT = 202;
const WINDOW_TITLEBAR_HEIGHT = 42;
const WINDOW_THEME_COLORS = {
  day: {
    background: "#eef4f7",
    symbol: "#18202a",
  },
  night: {
    background: "#101316",
    symbol: "#edf1f3",
  },
};
const FIRMWARE_ROOT = path.join(PROJECT_ROOT, "src", "firmware");
const firmwareProject = (name) => path.join(FIRMWARE_ROOT, name);
const MAIN_BIN_NAME = "main.bin";
const FIRMWARE_TARGETS = {
  wio_terminal: {
    id: "wio_terminal",
    name: "Wio Terminal",
    projectDir: firmwareProject("wio-terminal-code-pet"),
    flasher: "arduino",
    fqbn: "Seeeduino:samd:seeed_wio_terminal",
    firmwareFile: MAIN_BIN_NAME,
  },
  esp_ai_mini_ext_tft: {
    id: "esp_ai_mini_ext_tft",
    name: "ESP-AI-MINI AI开发套件",
    projectDir: firmwareProject("esp-ai-mini-ext-tft-code-pet"),
    flasher: "esp",
    firmwareFile: MAIN_BIN_NAME,
    flashAddress: 0x0,
  },
  esp_ai_common_3_tft: {
    id: "esp_ai_common_3_tft",
    name: "ESP-AI v3 开发板",
    projectDir: firmwareProject("esp-ai-v3-tft-code-pet"),
    flasher: "esp",
    firmwareFile: MAIN_BIN_NAME,
    flashAddress: 0x0,
  },
  esp_ai_common_4_tft: {
    id: "esp_ai_common_4_tft",
    name: "ESP-AI v4开发板",
    projectDir: firmwareProject("esp-ai-v3-tft-code-pet"),
    flasher: "esp",
    firmwareFile: MAIN_BIN_NAME,
    flashAddress: 0x0,
  },
  m5stack_cores3: {
    id: "m5stack_cores3",
    name: "M5Stack CoreS3",
    projectDir: firmwareProject("m5stack-cores3-code-pet"),
    flasher: "esp",
    firmwareFile: MAIN_BIN_NAME,
    flashAddress: 0x0,
  },
};

app.commandLine.appendSwitch("enable-features", "WebBluetooth");
app.setName("Vibe Pet");
app.setAppUserModelId("com.wangzongming.vibe-pet");

const startupOptions = parseArgs(process.argv.slice(1));
if (startupOptions.watch) {
  app.setPath("userData", path.join(os.homedir(), ".code-pet", "electron-dev"));
}

let mainWindow = null;
let hub = null;
let server = null;
let codexMonitor = null;
let cursorComposerMonitor = null;
let cursorTranscriptMonitor = null;
let presenceMonitor = null;
let bridgeInfo = {
  host: "127.0.0.1",
  port: DEFAULT_PORT,
  serviceUuid: SERVICE_UUID,
};
let bluetoothSelection = null;
let bluetoothSelectionCancelRequested = false;
let firmwareFlashTask = null;
let firmwareFlashCancelled = false;
let desktopPetWindows = new Map();
let desktopPetPayloads = new Map();
let desktopPetPositions = new Map();
let tray = null;
let hookSyncTimer = null;
let lastHookSyncAt = 0;
let githubStarsCache = {
  value: null,
  updatedAt: 0,
};
let analyticsSessionId = createAnalyticsSessionId();
let pendingAnalyticsEvents = [];
let selectedTencentRumHost = {
  url: "",
  region: "",
  source: "unresolved",
};

function createAnalyticsSessionId() {
  const seconds = Math.floor(Date.now() / 1000).toString();
  const suffix = Math.floor(Math.random() * 1e8).toString().padStart(8, "0");
  return `${seconds}${suffix}`;
}

function analyticsState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ANALYTICS_STATE_PATH, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAnalyticsState(state) {
  try {
    fs.mkdirSync(path.dirname(ANALYTICS_STATE_PATH), { recursive: true });
    fs.writeFileSync(ANALYTICS_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch {}
}

function createAnalyticsInstallId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function analyticsStateWithInstallId() {
  const state = analyticsState();
  if (typeof state.installId === "string" && state.installId) return state;
  const next = { ...state, installId: createAnalyticsInstallId() };
  writeAnalyticsState(next);
  return next;
}

function configuredTencentRumId(state = analyticsState()) {
  const fromArgs = String(startupOptions.tencentRumId || "").trim();
  if (fromArgs) return fromArgs;
  const fromEnv = String(process.env.CODE_PET_TENCENT_RUM_ID || process.env.TENCENT_RUM_ID || "").trim();
  if (fromEnv) return fromEnv;
  return String(state.tencentRumId || "").trim() || DEFAULT_TENCENT_RUM_ID;
}

function manuallyConfiguredTencentRumHostUrl(state = analyticsState()) {
  const fromArgs = String(startupOptions.tencentRumHostUrl || "").trim();
  if (fromArgs && fromArgs !== "auto") return fromArgs;
  const fromEnv = String(process.env.CODE_PET_TENCENT_RUM_HOST_URL || process.env.TENCENT_RUM_HOST_URL || "").trim();
  if (fromEnv && fromEnv !== "auto") return fromEnv;
  const fromState = String(state.tencentRumHostUrl || "").trim();
  return fromState && fromState !== "auto" ? fromState : "";
}

function normalizeTencentRumHostUrl(url) {
  const value = String(url || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(value) ? value : "";
}

function configuredTencentRumHostUrl(state = analyticsState()) {
  const manual = normalizeTencentRumHostUrl(manuallyConfiguredTencentRumHostUrl(state));
  if (manual) return manual;
  return selectedTencentRumHost.url || normalizeTencentRumHostUrl(state.autoTencentRumHostUrl) || DEFAULT_TENCENT_RUM_HOST_URL;
}

function configuredTencentRumHostSource(state = analyticsState()) {
  if (normalizeTencentRumHostUrl(manuallyConfiguredTencentRumHostUrl(state))) return "manual";
  return selectedTencentRumHost.source || (state.autoTencentRumHostUrl ? "cached-auto" : "default");
}

function probeTencentRumHost(candidate, timeout = 1800) {
  const startedAt = Date.now();
  const hostUrl = normalizeTencentRumHostUrl(candidate && candidate.url);
  if (!hostUrl) return Promise.resolve({ ...candidate, ok: false, latencyMs: Infinity, error: "invalid_url" });

  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve({
        ...candidate,
        url: hostUrl,
        latencyMs: Date.now() - startedAt,
        ...result,
      });
    };

    const req = https.request(`${hostUrl}/collect/events`, {
      method: "HEAD",
      timeout,
      headers: {
        "user-agent": `VibePet/${app.getVersion()} analytics-probe`,
      },
    }, (res) => {
      res.resume();
      done({ ok: true, statusCode: res.statusCode || 0 });
    });

    req.on("error", (err) => {
      done({ ok: false, error: err && err.code ? err.code : err.message || "request_error" });
    });
    req.on("timeout", () => {
      done({ ok: false, error: "timeout" });
      req.destroy();
    });
    req.end();
  });
}

async function selectTencentRumHostUrl() {
  const state = analyticsState();
  const manual = normalizeTencentRumHostUrl(manuallyConfiguredTencentRumHostUrl(state));
  if (manual) {
    selectedTencentRumHost = { url: manual, region: "manual", source: "manual" };
    return selectedTencentRumHost;
  }

  const results = await Promise.all(TENCENT_RUM_HOST_CANDIDATES.map((candidate) => probeTencentRumHost(candidate)));
  const best = results
    .filter((result) => result.ok)
    .sort((a, b) => a.latencyMs - b.latencyMs)[0];

  if (best) {
    selectedTencentRumHost = { url: best.url, region: best.region || "", source: "auto", latencyMs: best.latencyMs };
    writeAnalyticsState({
      ...state,
      autoTencentRumHostUrl: best.url,
      autoTencentRumHostRegion: best.region || "",
      autoTencentRumHostLatencyMs: best.latencyMs,
      autoTencentRumHostSelectedAt: new Date().toISOString(),
    });
  } else {
    selectedTencentRumHost = {
      url: normalizeTencentRumHostUrl(state.autoTencentRumHostUrl) || DEFAULT_TENCENT_RUM_HOST_URL,
      region: state.autoTencentRumHostRegion || "fallback",
      source: state.autoTencentRumHostUrl ? "cached-auto" : "default",
    };
  }

  if (startupOptions.verbose || startupOptions.analyticsDebug || process.env.CODE_PET_ANALYTICS_DEBUG === "1") {
    console.log("[analytics] rum host selection", JSON.stringify({
      selected: selectedTencentRumHost,
      probes: results.map((result) => ({
        url: result.url,
        region: result.region,
        ok: result.ok,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        error: result.error,
      })),
    }));
  }

  return selectedTencentRumHost;
}

function sanitizeAnalyticsProps(props = {}) {
  const out = {};
  if (!props || typeof props !== "object" || Array.isArray(props)) return out;
  for (const [key, value] of Object.entries(props)) {
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

function trackAnalyticsEvent(eventName, props = {}) {
  if (process.env.CODE_PET_DISABLE_ANALYTICS === "1") return;
  if (!eventName || typeof eventName !== "string") return;
  pendingAnalyticsEvents.push({
    timestamp: new Date().toISOString(),
    sessionId: analyticsSessionId,
    eventName: eventName.slice(0, 64),
    props: {
      platform: process.platform,
      arch: process.arch,
      locale: app.getLocale(),
      isDebug: !!startupOptions.watch,
      appVersion: app.getVersion(),
      ...sanitizeAnalyticsProps(props),
    },
  });
  if (pendingAnalyticsEvents.length > 100) pendingAnalyticsEvents = pendingAnalyticsEvents.slice(-100);
}

function trackAppLaunch() {
  const state = analyticsStateWithInstallId();
  if (!state.firstLaunchTracked) {
    trackAnalyticsEvent("app_installed");
    writeAnalyticsState({ ...state, firstLaunchTracked: true, firstLaunchAt: new Date().toISOString() });
  }
  trackAnalyticsEvent("app_started");
}

function consumePendingAnalyticsEvents() {
  const events = pendingAnalyticsEvents;
  pendingAnalyticsEvents = [];
  return events;
}

function analyticsConfig() {
  if (process.env.CODE_PET_DISABLE_ANALYTICS === "1") {
    return { enabled: false, provider: ANALYTICS_PROVIDER, reason: "disabled" };
  }
  const state = analyticsStateWithInstallId();
  const id = configuredTencentRumId(state);
  if (!id) {
    return { enabled: false, provider: ANALYTICS_PROVIDER, reason: "missing_tencent_rum_id" };
  }
  return {
    enabled: true,
    provider: ANALYTICS_PROVIDER,
    id,
    hostUrl: configuredTencentRumHostUrl(state),
    hostSource: configuredTencentRumHostSource(state),
    hostRegion: selectedTencentRumHost.region || state.autoTencentRumHostRegion || "",
    debug: !!startupOptions.analyticsDebug || process.env.CODE_PET_ANALYTICS_DEBUG === "1",
    installId: state.installId,
    sessionId: analyticsSessionId,
    commonProps: {
      platform: process.platform,
      arch: process.arch,
      locale: app.getLocale(),
      isDebug: !!startupOptions.watch,
      appVersion: app.getVersion(),
      rum_host: configuredTencentRumHostUrl(state),
      rum_host_source: configuredTencentRumHostSource(state),
      rum_host_region: selectedTencentRumHost.region || state.autoTencentRumHostRegion || "",
    },
    initialEvents: consumePendingAnalyticsEvents(),
  };
}

function windowChromeOptions(theme = "day") {
  const colors = WINDOW_THEME_COLORS[theme] || WINDOW_THEME_COLORS.day;
  return {
    color: colors.background,
    symbolColor: colors.symbol,
    height: WINDOW_TITLEBAR_HEIGHT,
  };
}

function mainWindowChromeOptions() {
  if (process.platform !== "win32") return {};
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: windowChromeOptions("day"),
  };
}

function applyMainWindowTheme(win, theme = "day") {
  if (!win || win.isDestroyed()) return;
  const colors = WINDOW_THEME_COLORS[theme] || WINDOW_THEME_COLORS.day;
  win.setBackgroundColor(colors.background);
  if (process.platform === "win32" && typeof win.setTitleBarOverlay === "function") {
    win.setTitleBarOverlay(windowChromeOptions(theme));
  }
}

function isAllowedExternalUrl(url) {
  return [PROJECT_REPO_URL, PETDEX_REPO_URL].some((allowedUrl) =>
    url === allowedUrl || url.startsWith(`${allowedUrl}/`)
  );
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "GET",
      timeout: options.timeout || 5000,
      headers: {
        "accept": "application/vnd.github+json",
        "user-agent": "vibe-pet-desktop",
        ...(options.headers || {}),
      },
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub API returned ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("GitHub API timed out")));
    req.on("error", reject);
    req.end();
  });
}

async function getGitHubStars() {
  const now = Date.now();
  if (githubStarsCache.value !== null && now - githubStarsCache.updatedAt < 10 * 60 * 1000) {
    return { stars: githubStarsCache.value };
  }

  const data = await requestJson(PROJECT_REPO_API_URL);
  const stars = Number(data && data.stargazers_count);
  if (!Number.isFinite(stars)) throw new Error("GitHub API did not return stargazers_count");
  githubStarsCache = { value: stars, updatedAt: now };
  return { stars };
}

function firstExistingPath(paths) {
  return paths.find((candidate) => fs.existsSync(candidate));
}

function appWindowIconPath() {
  if (process.platform === "win32") {
    return firstExistingPath([APP_ICON_ICO, APP_ICON_PNG, LOGO_PNG]);
  }
  if (process.platform === "darwin") {
    return firstExistingPath([APP_ICON_ICNS, APP_ICON_PNG, LOGO_PNG]);
  }
  return firstExistingPath([APP_ICON_PNG, LOGO_PNG]);
}

function iconImage(paths, size) {
  const imagePath = firstExistingPath(paths);
  const image = imagePath ? nativeImage.createFromPath(imagePath) : nativeImage.createEmpty();

  if (!size || image.isEmpty()) return image;
  return image.resize({ width: size, height: size, quality: "best" });
}

function appIconImage(size) {
  if (process.platform === "darwin") {
    return iconImage([APP_ICON_ICNS, APP_ICON_PNG, LOGO_PNG], size);
  }
  return iconImage([APP_ICON_PNG, LOGO_PNG], size);
}

function trayIconImage(size) {
  const paths = process.platform === "darwin"
    ? [TRAY_TEMPLATE_ICON_PNG, TRAY_ICON_PNG, APP_ICON_PNG, LOGO_PNG]
    : [TRAY_ICON_PNG, APP_ICON_PNG, LOGO_PNG];
  const image = iconImage(paths, size);
  if (process.platform === "darwin" && !image.isEmpty()) image.setTemplateImage(true);
  return image;
}

function setupAppIcon() {
  if (process.platform !== "darwin" || !app.dock) return;
  const image = appIconImage(512);
  if (!image.isEmpty()) app.dock.setIcon(image);
}

function showMainWindow() {
  syncHooksForPackagedApp(startupOptions);
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (hub) createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return tray;

  const size = process.platform === "darwin" ? 18 : 20;
  const image = trayIconImage(size);
  if (image.isEmpty()) return null;

  tray = new Tray(image);
  tray.setToolTip("Vibe Pet");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Vibe Pet", click: showMainWindow },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]));
  tray.on("click", showMainWindow);
  return tray;
}

function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

function writeFileIfChanged(filePath, content) {
  try {
    if (fs.readFileSync(filePath, "utf8") === content) return;
  } catch {}
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function writePackagedHookRunner() {
  if (process.platform === "win32") {
    const appExe = process.execPath.replace(/%/g, "%%");
    writeFileIfChanged(HOOK_RUNNER_PATH, [
      "@echo off",
      "set \"ELECTRON_RUN_AS_NODE=1\"",
      `"${appExe}" %*`,
      "exit /b %ERRORLEVEL%",
      "",
    ].join("\r\n"));
    return HOOK_RUNNER_PATH;
  }

  writeFileIfChanged(HOOK_RUNNER_PATH, [
    "#!/bin/sh",
    `ELECTRON_RUN_AS_NODE=1 exec ${shQuote(process.execPath)} "$@"`,
    "",
  ].join("\n"));
  try {
    fs.chmodSync(HOOK_RUNNER_PATH, 0o755);
  } catch {}
  return HOOK_RUNNER_PATH;
}

function syncHooksForPackagedApp(options = {}) {
  if (!app.isPackaged || process.env.VIBE_PET_SKIP_HOOKS === "1") return;
  const now = Date.now();
  if (!options.force && now - lastHookSyncAt < HOOK_SYNC_MIN_INTERVAL_MS) return;
  lastHookSyncAt = now;

  const previousRunner = process.env[HOOK_RUNNER_ENV];
  try {
    process.env[HOOK_RUNNER_ENV] = writePackagedHookRunner();
    const results = syncAgentHooks({ silent: true });
    if (options.verbose) {
      const active = results.filter((result) => !result.skipped).map((result) => result.name).join(", ");
      console.log(`[hooks] synced packaged app hooks${active ? `: ${active}` : ""}`);
    }
  } catch (err) {
    console.warn(`[hooks] packaged hook sync failed: ${err && err.message ? err.message : err}`);
  } finally {
    if (previousRunner === undefined) delete process.env[HOOK_RUNNER_ENV];
    else process.env[HOOK_RUNNER_ENV] = previousRunner;
  }
}

function startPackagedHookSync(options = {}) {
  syncHooksForPackagedApp({ ...options, force: true });
  if (!app.isPackaged || hookSyncTimer) return;
  hookSyncTimer = setInterval(() => {
    syncHooksForPackagedApp(options);
  }, HOOK_SYNC_INTERVAL_MS);
  if (typeof hookSyncTimer.unref === "function") hookSyncTimer.unref();
}

function stopPackagedHookSync() {
  if (!hookSyncTimer) return;
  clearInterval(hookSyncTimer);
  hookSyncTimer = null;
}

function parseArgs(argv) {
  const out = {
    host: "127.0.0.1",
    port: Number(process.env.CODE_PET_PORT) || DEFAULT_PORT,
    verbose: false,
    codexLog: true,
    cursorTranscript: true,
    watch: false,
    autoUpdate: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host") out.host = argv[++i] || out.host;
    else if (arg === "--port") out.port = Number(argv[++i]) || out.port;
    else if (arg === "--verbose") out.verbose = true;
    else if (arg === "--no-codex-log") out.codexLog = false;
    else if (arg === "--no-cursor-transcript") out.cursorTranscript = false;
    else if (arg === "--watch") out.watch = true;
    else if (arg === "--no-auto-update") out.autoUpdate = false;
    else if (arg === "--auto-update-debug") out.autoUpdateDebug = true;
    else if (arg === "--analytics-debug") out.analyticsDebug = true;
    else if (arg === "--tencent-rum-id") out.tencentRumId = argv[++i] || "";
    else if (arg === "--tencent-rum-host-url") out.tencentRumHostUrl = argv[++i] || "";
    else if (arg === "--analytics-api-url") out.tencentRumHostUrl = argv[++i] || "";
  }
  return out;
}

function writeRuntime(info) {
  fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true });
  fs.writeFileSync(RUNTIME_PATH, JSON.stringify({
    app: "vibe-pet",
    mode: "desktop",
    host: info.host,
    port: info.port,
    pid: process.pid,
    updatedAt: Date.now(),
  }, null, 2), "utf8");
}

function portCandidates(start) {
  const ports = [];
  const seen = new Set();
  for (const port of [start, DEFAULT_PORT, 17385, 17386, 17387, 17388]) {
    const n = Number(port);
    if (Number.isInteger(n) && n > 0 && n < 65536 && !seen.has(n)) {
      seen.add(n);
      ports.push(n);
    }
  }
  return ports;
}

function listenWithFallback(httpServer, options) {
  const ports = portCandidates(options.port);
  return new Promise((resolve, reject) => {
    const tryAt = (index) => {
      if (index >= ports.length) {
        reject(new Error(`No available Vibe Pet bridge port in ${ports.join(", ")}`));
        return;
      }

      const port = ports[index];
      const onError = (err) => {
        httpServer.off("listening", onListening);
        if (err.code === "EADDRINUSE") {
          tryAt(index + 1);
          return;
        }
        reject(err);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        resolve({ host: options.host, port });
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(port, options.host);
    };

    tryAt(0);
  });
}

function isMainWindow(webContents) {
  return mainWindow && !mainWindow.isDestroyed() && BrowserWindow.fromWebContents(webContents) === mainWindow;
}

function setupDevicePermissions() {
  const allowedOrigin = `file://${INDEX_HTML}`;
  const defaultSession = session.defaultSession;

  if (typeof defaultSession.setPermissionCheckHandler === "function") {
    defaultSession.setPermissionCheckHandler((webContents, permission) => {
      return permission === "bluetooth" && isMainWindow(webContents);
    });
  }

  if (typeof defaultSession.setPermissionRequestHandler === "function") {
    defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(permission === "bluetooth" && isMainWindow(webContents));
    });
  }

  if (typeof defaultSession.setDevicePermissionHandler === "function") {
    defaultSession.setDevicePermissionHandler((details) => {
      return details.deviceType === "bluetooth" && (details.origin === "file://" || details.origin === allowedOrigin);
    });
  }
}

function finishBluetoothSelection(deviceId = "") {
  if (!bluetoothSelection) {
    if (!deviceId) bluetoothSelectionCancelRequested = true;
    return false;
  }
  const current = bluetoothSelection;
  bluetoothSelection = null;
  bluetoothSelectionCancelRequested = false;
  try {
    current.callback(deviceId);
  } catch {}
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("code-pet:bluetooth-devices", []);
  }
  return true;
}

function setupBluetoothPicker(win) {
  win.webContents.on("select-bluetooth-device", (event, deviceList, callback) => {
    event.preventDefault();

    if (bluetoothSelectionCancelRequested) {
      bluetoothSelectionCancelRequested = false;
      try {
        callback("");
      } catch {}
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("code-pet:bluetooth-devices", []);
      }
      return;
    }

    if (!bluetoothSelection) {
      bluetoothSelection = {
        callback,
        devices: new Map(),
      };
    } else {
      bluetoothSelection.callback = callback;
    }

    for (const device of deviceList) {
      const name = device.deviceName || "";
      if (!name.startsWith(BLUETOOTH_SCAN_NAME_PREFIX)) continue;
      bluetoothSelection.devices.set(device.deviceId, {
        id: device.deviceId,
        name: name || `未命名 BLE 设备 ${device.deviceId.slice(-6)}`,
        preferred: true,
      });
    }

    const devices = Array.from(bluetoothSelection.devices.values()).sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    win.webContents.send("code-pet:bluetooth-devices", devices);
  });
}

function broadcastState(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("code-pet:state", payload);
}

function broadcastFirmwareFlash(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("code-pet:firmware-flash", { at: Date.now(), ...payload });
}

function compactDesktopText(value, fallback = "", max = 96) {
  const text = String(value || fallback || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

function normalizeDesktopPetPayload(pet) {
  if (!pet || typeof pet !== "object") return null;
  const id = compactDesktopText(pet.id, "", 120);
  if (!id) return null;

  const persona = pet.persona && typeof pet.persona === "object" ? pet.persona : {};
  const packet = pet.packet && typeof pet.packet === "object" ? pet.packet : {};
  return {
    id,
    title: compactDesktopText(pet.title, "Vibe Pet", 80),
    state: compactDesktopText(pet.state, "idle", 32),
    stateLabel: compactDesktopText(pet.stateLabel, pet.state || "idle", 32),
    agentId: compactDesktopText(pet.agentId, "agent", 48),
    agentName: compactDesktopText(pet.agentName, "agent", 48),
    persona: {
      slug: compactDesktopText(persona.slug, "", 96),
      displayName: compactDesktopText(persona.displayName, "Vibe Pet", 80),
      kind: compactDesktopText(persona.kind, "", 48),
      submittedBy: compactDesktopText(persona.submittedBy, "", 48),
      spritesheetUrl: typeof persona.spritesheetUrl === "string" ? persona.spritesheetUrl : "",
      loading: !!persona.loading,
    },
    packet: {
      v: 1,
      s: compactDesktopText(packet.s || pet.state, "idle", 32),
      a: compactDesktopText(packet.a || pet.agentName, "agent", 32),
      e: compactDesktopText(packet.e, "", 48),
      n: Number.isFinite(Number(packet.n)) ? Number(packet.n) : 0,
      sl: compactDesktopText(packet.sl || pet.stateLabel || pet.state, "", 48),
      l: compactDesktopText(packet.l, "en", 12),
      o: compactDesktopText(packet.o, "", 120),
      m: compactDesktopText(packet.m || pet.title, "", 64),
      p: compactDesktopText(packet.p || persona.slug, "", 48),
      d: compactDesktopText(packet.d || persona.displayName, "", 48),
      k: compactDesktopText(packet.k || persona.kind, "", 24),
      u: typeof packet.u === "string" ? packet.u : "",
      th: packet.th === "night" ? "night" : "day",
      ts: Date.now(),
    },
  };
}

function deviceSnapshot() {
  const pets = Array.from(desktopPetPayloads.values()).map((pet) => ({
    id: pet.id,
    title: pet.title,
    state: pet.state,
    stateLabel: pet.stateLabel,
    agentId: pet.agentId,
    agentName: pet.agentName,
    persona: pet.persona,
    packet: { ...pet.packet, ts: Date.now() },
  }));
  return {
    v: 1,
    at: Date.now(),
    pets,
    aggregate: pets[0] ? pets[0].packet : (hub ? hub.getAggregate().devicePacket : null),
  };
}

function clampDesktopPetBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const width = PET_OVERLAY_WIDTH;
  const height = PET_OVERLAY_HEIGHT;
  return {
    width,
    height,
    x: Math.round(Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)),
  };
}

function initialDesktopPetBounds(index) {
  const area = screen.getPrimaryDisplay().workArea;
  const gap = 18;
  const margin = 24;
  const columns = Math.max(1, Math.floor((area.width - margin * 2 + gap) / (PET_OVERLAY_WIDTH + gap)));
  const col = index % columns;
  const row = Math.floor(index / columns);
  return clampDesktopPetBounds({
    width: PET_OVERLAY_WIDTH,
    height: PET_OVERLAY_HEIGHT,
    x: area.x + margin + col * (PET_OVERLAY_WIDTH + gap),
    y: area.y + area.height - PET_OVERLAY_HEIGHT - margin - row * 48,
  });
}

function desktopPetBounds(id, index) {
  const remembered = desktopPetPositions.get(id);
  if (remembered) {
    return clampDesktopPetBounds({
      width: PET_OVERLAY_WIDTH,
      height: PET_OVERLAY_HEIGHT,
      x: remembered.x,
      y: remembered.y,
    });
  }
  return initialDesktopPetBounds(index);
}

function rememberDesktopPetPosition(id, win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  desktopPetPositions.set(id, { x: bounds.x, y: bounds.y });
}

function sendDesktopPetPayload(win, payload) {
  if (!win || win.isDestroyed()) return;
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send("code-pet:desktop-pet", payload);
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

function createDesktopPetWindow(payload, index) {
  const bounds = desktopPetBounds(payload.id, index);
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    title: `Vibe Pet - ${payload.agentName}`,
    icon: appWindowIconPath(),
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD_JS,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  desktopPetWindows.set(payload.id, win);
  try {
    win.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "normal");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  } catch {}

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("move", () => rememberDesktopPetPosition(payload.id, win));
  win.on("closed", () => {
    desktopPetWindows.delete(payload.id);
  });
  win.webContents.once("did-finish-load", () => {
    sendDesktopPetPayload(win, payload);
    if (!win.isDestroyed()) win.showInactive();
  });
  win.loadFile(PET_OVERLAY_HTML);
  return win;
}

function syncDesktopPets(input) {
  const pets = (Array.isArray(input) ? input : []).map(normalizeDesktopPetPayload).filter(Boolean);
  const activeIds = new Set();

  pets.forEach((payload, index) => {
    activeIds.add(payload.id);
    desktopPetPayloads.set(payload.id, payload);
    const existing = desktopPetWindows.get(payload.id);
    if (existing && !existing.isDestroyed()) {
      existing.setTitle(`Vibe Pet - ${payload.agentName}`);
      sendDesktopPetPayload(existing, payload);
      return;
    }
    createDesktopPetWindow(payload, index);
  });

  for (const [id, win] of desktopPetWindows) {
    if (activeIds.has(id)) continue;
    rememberDesktopPetPosition(id, win);
    desktopPetWindows.delete(id);
    desktopPetPayloads.delete(id);
    if (!win.isDestroyed()) win.destroy();
  }
}

function reloadDesktopPetWindows() {
  for (const [id, win] of desktopPetWindows) {
    if (!win || win.isDestroyed()) continue;
    const payload = desktopPetPayloads.get(id);
    if (payload) win.webContents.once("did-finish-load", () => sendDesktopPetPayload(win, payload));
    win.webContents.reloadIgnoringCache();
  }
}

function closeDesktopPetWindows() {
  for (const [id, win] of desktopPetWindows) {
    rememberDesktopPetPosition(id, win);
    if (!win.isDestroyed()) win.destroy();
  }
  desktopPetWindows = new Map();
  desktopPetPayloads = new Map();
}

function cliEnv() {
  const additions = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const current = process.env.PATH || "";
  return {
    ...process.env,
    PATH: [...additions, current].filter(Boolean).join(path.delimiter),
  };
}

function commandExists(command, env = cliEnv()) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], {
      env,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function arduinoCliCommand() {
  const env = cliEnv();
  if (commandExists("arduino-cli", env)) return "arduino-cli";
  return "";
}

async function listSerialPorts() {
  try {
    const ports = await listEspSerialPorts();
    if (ports.length) return ports.sort((a, b) => a.path.localeCompare(b.path));
  } catch {}

  const ports = [];
  const push = (port, label = "") => {
    if (!port || ports.some((item) => item.path === port)) return;
    ports.push({ path: port, label: label || path.basename(port) });
  };

  if (process.platform === "darwin") {
    try {
      for (const name of fs.readdirSync("/dev")) {
        if (!name.startsWith("cu.")) continue;
        if (/bluetooth|debug-console/i.test(name)) continue;
        push(path.join("/dev", name), name);
      }
    } catch {}
  } else if (process.platform === "linux") {
    for (const prefix of ["ttyACM", "ttyUSB"]) {
      try {
        for (const name of fs.readdirSync("/dev")) {
          if (name.startsWith(prefix)) push(path.join("/dev", name), name);
        }
      } catch {}
    }
  } else if (process.platform === "win32") {
    try {
      const output = execFileSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_SerialPort | ForEach-Object { $_.DeviceID + '|' + $_.Name }",
      ], { encoding: "utf8", windowsHide: true });
      for (const line of output.split(/\r?\n/)) {
        const [port, label] = line.split("|");
        if (port) push(port.trim(), (label || port).trim());
      }
    } catch {}
  }

  ports.sort((a, b) => a.path.localeCompare(b.path));
  return ports;
}

function firmwareBinPath(target) {
  return path.join(target.projectDir, target.firmwareFile || MAIN_BIN_NAME);
}

function firmwareTargetList() {
  return Object.values(FIRMWARE_TARGETS).map((target) => ({
    id: target.id,
    name: target.name,
    flasher: target.flasher,
    firmwareFile: target.firmwareFile || MAIN_BIN_NAME,
    available: fs.existsSync(firmwareBinPath(target)),
  }));
}

function startFirmwareFlash(options = {}) {
  if (firmwareFlashTask) {
    throw new Error("A firmware flash task is already running.");
  }

  const target = FIRMWARE_TARGETS[options.targetId || ""];
  if (!target) throw new Error("Unknown firmware target.");
  const firmwarePath = firmwareBinPath(target);
  if (!fs.existsSync(firmwarePath)) {
    throw new Error(`main.bin not found for ${target.name}: ${firmwarePath}`);
  }
  const port = String(options.port || "").trim();
  if (!port) throw new Error("Serial port is required.");

  if (target.flasher === "esp") {
    return startEspFirmwareFlash(target, port, firmwarePath);
  }
  if (target.flasher === "arduino") {
    return startArduinoFirmwareFlash(target, port, firmwarePath);
  }

  throw new Error(`Unsupported firmware flasher: ${target.flasher || "unknown"}`);
}

function startEspFirmwareFlash(target, port, firmwarePath) {
  let cancelled = false;
  const address = Number.isFinite(target.flashAddress) ? target.flashAddress : 0x0;
  const command = `esptool-js --port ${port} write_flash 0x${address.toString(16)} ${firmwarePath}`;

  broadcastFirmwareFlash({
    type: "start",
    targetId: target.id,
    targetName: target.name,
    port,
    command,
  });

  firmwareFlashCancelled = false;
  firmwareFlashTask = {
    cancel() {
      cancelled = true;
    },
  };

  flashEspMainBin({
    port,
    firmwarePath,
    flashAddress: address,
    onLog(text) {
      if (text) broadcastFirmwareFlash({ type: "log", text });
    },
    shouldCancel() {
      return cancelled || firmwareFlashCancelled;
    },
  }).then(() => {
    broadcastFirmwareFlash({
      type: "done",
      message: "Firmware flashed.",
    });
  }).catch((err) => {
    const message = err && err.message ? err.message : String(err || "");
    if (cancelled || firmwareFlashCancelled || /cancelled/i.test(message)) {
      broadcastFirmwareFlash({
        type: "cancelled",
        message: "Firmware flash cancelled.",
      });
      return;
    }
    broadcastFirmwareFlash({
      type: "error",
      message,
    });
  }).finally(() => {
    firmwareFlashTask = null;
    firmwareFlashCancelled = false;
  });

  return { ok: true };
}

function startArduinoFirmwareFlash(target, port, firmwarePath) {
  const command = arduinoCliCommand();
  if (!command) {
    throw new Error("arduino-cli not found. Install Arduino CLI to flash this non-ESP target.");
  }
  if (!target.fqbn) throw new Error(`Arduino FQBN is not configured for ${target.name}.`);

  const args = ["upload", "-p", port, "-b", target.fqbn, "-i", firmwarePath];

  broadcastFirmwareFlash({
    type: "start",
    targetId: target.id,
    targetName: target.name,
    port,
    command: [command, ...args].join(" "),
  });

  firmwareFlashCancelled = false;
  const child = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: cliEnv(),
    windowsHide: true,
  });
  firmwareFlashTask = {
    cancel() {
      child.kill("SIGTERM");
    },
  };

  const writeLog = (chunk) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
    if (text) broadcastFirmwareFlash({ type: "log", text });
  };

  child.stdout.on("data", writeLog);
  child.stderr.on("data", writeLog);
  child.on("error", (err) => {
    firmwareFlashTask = null;
    broadcastFirmwareFlash({ type: "error", message: err.message });
  });
  child.on("close", (code, signal) => {
    firmwareFlashTask = null;
    if (firmwareFlashCancelled) {
      firmwareFlashCancelled = false;
      broadcastFirmwareFlash({
        type: "cancelled",
        code,
        signal,
        message: "Firmware flash cancelled.",
      });
      return;
    }
    broadcastFirmwareFlash({
      type: code === 0 ? "done" : "error",
      code,
      signal,
      message: code === 0 ? "Firmware flashed." : `Firmware flash failed with code ${code}${signal ? ` (${signal})` : ""}.`,
    });
  });

  return { ok: true };
}

function cancelFirmwareFlash() {
  if (!firmwareFlashTask) return { ok: true, running: false };
  firmwareFlashCancelled = true;
  firmwareFlashTask.cancel();
  return { ok: true, running: true };
}

function isWatchedFile(filePath) {
  return [".css", ".html", ".js", ".json", ".mjs", ".cjs", ".svg"].includes(path.extname(filePath));
}

function reloadMode(filePath) {
  const normalized = path.normalize(filePath);
  if (normalized === path.join(__dirname, "index.html")) return "renderer";
  if (normalized === path.join(__dirname, "renderer.js")) return "renderer";
  if (normalized === path.join(__dirname, "pet-overlay.html")) return "renderer";
  if (normalized === path.join(__dirname, "pet-overlay.css")) return "renderer";
  if (normalized === path.join(__dirname, "pet-overlay.js")) return "renderer";
  if (normalized === path.join(HOST_DIR, "public", "styles.css")) return "renderer";
  if (normalized === path.join(HOST_DIR, "public", "i18n.js")) return "renderer";
  if (normalized === LOGO_PNG) return "renderer";
  return "restart";
}

function setupDevWatch() {
  if (!startupOptions.watch) return;
  const watchTargets = [
    __dirname,
    HOST_DIR,
    path.join(PROJECT_ROOT, "package.json"),
  ];
  let timer = null;
  let pendingMode = "renderer";

  const schedule = (mode, changedPath) => {
    if (!isWatchedFile(changedPath)) return;
    pendingMode = pendingMode === "restart" || mode === "restart" ? "restart" : "renderer";
    clearTimeout(timer);
    timer = setTimeout(() => {
      const modeToRun = pendingMode;
      pendingMode = "renderer";
      if (modeToRun === "renderer" && mainWindow && !mainWindow.isDestroyed()) {
        console.log(`[watch] reload ${path.relative(PROJECT_ROOT, changedPath)}`);
        mainWindow.webContents.reloadIgnoringCache();
        reloadDesktopPetWindows();
        return;
      }
      console.log(`[watch] restart ${path.relative(PROJECT_ROOT, changedPath)}`);
      app.relaunch({ args: process.argv.slice(1) });
      app.exit(0);
    }, 120);
  };

  for (const target of watchTargets) {
    try {
      const stat = fs.statSync(target);
      fs.watch(target, { recursive: stat.isDirectory() }, (_event, fileName) => {
        const changedPath = stat.isDirectory()
          ? path.join(target, fileName ? String(fileName) : "")
          : target;
        schedule(reloadMode(changedPath), changedPath);
      });
    } catch (err) {
      console.warn(`[watch] ${target}: ${err.message}`);
    }
  }
  console.log("[watch] enabled");
}

function hasRealAgentSession(agentId) {
  if (!hub || !hub.sessions) return false;
  for (const session of hub.sessions.values()) {
    if (session.agentId === agentId && session.sessionId !== "app" && session.state !== "sleeping") return true;
  }
  return false;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: "Vibe Pet",
    icon: appWindowIconPath(),
    backgroundColor: WINDOW_THEME_COLORS.day.background,
    autoHideMenuBar: true,
    ...mainWindowChromeOptions(),
    webPreferences: {
      preload: PRELOAD_JS,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = win;
  if (process.platform !== "darwin") win.setMenu(null);
  win.setMenuBarVisibility(false);
  setupBluetoothPicker(win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url === win.webContents.getURL()) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
  });
  if (startupOptions.verbose || startupOptions.analyticsDebug || process.env.CODE_PET_ANALYTICS_DEBUG === "1") {
    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  }

  win.webContents.once("did-finish-load", () => {
    broadcastState({ type: "snapshot", at: Date.now(), ...hub.getSnapshot() });
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    finishBluetoothSelection("");
  });

  win.loadFile(INDEX_HTML);
}

function setupIpc() {
  ipcMain.handle("code-pet:get-snapshot", () => hub.getSnapshot());
  ipcMain.handle("code-pet:get-github-stars", () => getGitHubStars());
  ipcMain.handle("code-pet:get-petdex-pets", (_event, options = {}) => getPetdexPets(options));
  ipcMain.handle("code-pet:get-firmware-targets", () => firmwareTargetList());
  ipcMain.handle("code-pet:list-serial-ports", () => listSerialPorts());
  ipcMain.handle("code-pet:flash-firmware", (_event, options = {}) => startFirmwareFlash(options));
  ipcMain.handle("code-pet:cancel-firmware-flash", () => cancelFirmwareFlash());
  ipcMain.handle("code-pet:get-analytics-config", (event) => {
    if (!isMainWindow(event.sender)) return { enabled: false, provider: ANALYTICS_PROVIDER, reason: "not_main_window" };
    return analyticsConfig();
  });
  ipcMain.handle("code-pet:choose-bluetooth-device", (_event, deviceId) => {
    return finishBluetoothSelection(deviceId || "");
  });
  ipcMain.on("code-pet:analytics-event", (event, payload = {}) => {
    if (!isMainWindow(event.sender)) return;
    if (!payload || typeof payload !== "object") return;
    trackAnalyticsEvent(payload.eventName, payload.props);
  });
  ipcMain.on("code-pet:set-window-theme", (event, theme) => {
    if (!isMainWindow(event.sender)) return;
    applyMainWindowTheme(BrowserWindow.fromWebContents(event.sender), theme);
  });
  ipcMain.on("code-pet:sync-desktop-pets", (event, pets = []) => {
    if (!isMainWindow(event.sender)) return;
    syncDesktopPets(pets);
  });
}

async function startBackend(options) {
  hub = new StateHub();
  server = createServer(hub, { ...options, deviceSnapshotProvider: deviceSnapshot });
  hub.on("change", broadcastState);

  if (options.codexLog) {
    codexMonitor = new CodexLogMonitor((state) => hub.upsert(state), { verbose: options.verbose });
    codexMonitor.start();
  }

  if (options.cursorTranscript) {
    cursorComposerMonitor = new CursorComposerMonitor((state) => hub.upsert(state), { verbose: options.verbose });
    cursorComposerMonitor.start();
    cursorTranscriptMonitor = new CursorTranscriptMonitor((state) => hub.upsert(state), { verbose: options.verbose });
    cursorTranscriptMonitor.start();
  }

  presenceMonitor = new PresenceMonitor((state) => hub.upsert(state), {
    hasSession: hasRealAgentSession,
    verbose: options.verbose,
  });
  presenceMonitor.start();

  bridgeInfo = {
    ...bridgeInfo,
    ...(await listenWithFallback(server, options)),
  };
  writeRuntime(bridgeInfo);
  console.log(`Vibe Pet desktop bridge: ${bridgeInfo.host}:${bridgeInfo.port}`);
  console.log(`BLE service: ${SERVICE_UUID}`);
}

function stopBackend() {
  finishBluetoothSelection("");
  cancelFirmwareFlash();
  closeDesktopPetWindows();
  destroyTray();
  if (codexMonitor) codexMonitor.stop();
  if (cursorComposerMonitor) cursorComposerMonitor.stop();
  if (cursorTranscriptMonitor) cursorTranscriptMonitor.stop();
  if (presenceMonitor) presenceMonitor.stop();
  codexMonitor = null;
  cursorComposerMonitor = null;
  cursorTranscriptMonitor = null;
  presenceMonitor = null;
  if (server && server.closeSseClients) server.closeSseClients();
  if (server) server.close();
  server = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    syncHooksForPackagedApp(startupOptions);
    if (!mainWindow) {
      createMainWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const options = startupOptions;
    if (process.platform !== "darwin") Menu.setApplicationMenu(null);
    startPackagedHookSync(options);
    setupAppIcon();
    setupDevicePermissions();
    await selectTencentRumHostUrl();
    setupIpc();
    trackAppLaunch();
    await startBackend(options);
    createTray();
    createMainWindow();
    setupAutoUpdater({
      disabled: !options.autoUpdate,
      debug: options.verbose || options.autoUpdateDebug,
    });
    setupDevWatch();
  }).catch((err) => {
    console.error(err);
    app.quit();
  });

  app.on("activate", () => {
    syncHooksForPackagedApp(startupOptions);
    if (!mainWindow && hub) createMainWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    stopPackagedHookSync();
    stopBackend();
  });
}
