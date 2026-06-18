"use strict";

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, shell, Tray } = require("electron");
const { CodexLogMonitor } = require("../host/agent/codex-log-monitor");
const { CursorComposerMonitor } = require("../host/agent/cursor-composer-monitor");
const { CursorTranscriptMonitor } = require("../host/agent/cursor-transcript-monitor");
const { PresenceMonitor } = require("../host/agent/presence-monitor");
const { createServer } = require("../host");
const { getPetdexPets } = require("../host/petdex");
const { StateHub } = require("../host/state-hub");
const { DEVICE_NAME_PREFIXES, SERVICE_UUID } = require("../host/protocol");

const DEFAULT_PORT = 17384;
const PROJECT_REPO_URL = "https://github.com/wangzongming/vibe-pet";
const PROJECT_REPO_API_URL = "https://api.github.com/repos/wangzongming/vibe-pet";
const PETDEX_REPO_URL = "https://github.com/crafter-station/petdex";
const RUNTIME_PATH = path.join(os.homedir(), ".code-pet", "runtime.json");
const INDEX_HTML = path.join(__dirname, "index.html");
const PET_OVERLAY_HTML = path.join(__dirname, "pet-overlay.html");
const PRELOAD_JS = path.join(__dirname, "preload.js");
const DESKTOP_ASSET_DIR = path.join(__dirname, "assets");
const APP_ICON_BASE = path.join(DESKTOP_ASSET_DIR, "app-icon");
const APP_ICON_PNG = `${APP_ICON_BASE}.png`;
const APP_ICON_ICNS = `${APP_ICON_BASE}.icns`;
const APP_ICON_ICO = `${APP_ICON_BASE}.ico`;
const TRAY_ICON_PNG = path.join(DESKTOP_ASSET_DIR, "tray-icon.png");
const LOGO_PNG = path.join(__dirname, "..", "host", "public", "logo.png");
const HOST_DIR = path.join(__dirname, "..", "host");
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PET_OVERLAY_WIDTH = 172;
const PET_OVERLAY_HEIGHT = 202;
const FIRMWARE_ROOT = path.join(PROJECT_ROOT, "src", "firmware");
const FIRMWARE_TARGETS = {
  wio_terminal: {
    id: "wio_terminal",
    name: "Wio Terminal",
    projectDir: path.join(FIRMWARE_ROOT, "wio-terminal-code-pet"),
    env: "wio_terminal",
  },
  esp32s3: {
    id: "esp32s3",
    name: "ESP32-S3",
    projectDir: path.join(FIRMWARE_ROOT, "esp-ai-mini-ext-status"),
    env: "esp_ai_mini_ext_status",
  },
  esp_ai_common_3_tft: {
    id: "esp_ai_common_3_tft",
    name: "ESP-AI Common 3.0.0 TFT",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "esp_ai_common_3_tft",
  },
  esp_ai_diy_esp32s3_oled: {
    id: "esp_ai_diy_esp32s3_oled",
    name: "ESP-AI DIY ESP32S3 OLED",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "esp_ai_diy_esp32s3_oled",
  },
  m5stack_core2: {
    id: "m5stack_core2",
    name: "M5Stack Core2",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "m5stack_core2",
  },
  m5stack_cores3: {
    id: "m5stack_cores3",
    name: "M5Stack CoreS3",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "m5stack_cores3",
  },
  m5stickc_plus2: {
    id: "m5stickc_plus2",
    name: "M5StickC Plus2",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "m5stickc_plus2",
  },
  m5stack_cardputer: {
    id: "m5stack_cardputer",
    name: "M5Stack Cardputer",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "m5stack_cardputer",
  },
  m5stack_atoms3: {
    id: "m5stack_atoms3",
    name: "M5Stack AtomS3",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "m5stack_atoms3",
  },
  lilygo_t_display: {
    id: "lilygo_t_display",
    name: "LILYGO T-Display ESP32",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "lilygo_t_display",
  },
  lilygo_t_display_s3: {
    id: "lilygo_t_display_s3",
    name: "LILYGO T-Display S3",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "lilygo_t_display_s3",
  },
  heltec_wifi_kit_32: {
    id: "heltec_wifi_kit_32",
    name: "Heltec WiFi Kit 32",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "heltec_wifi_kit_32",
  },
  heltec_wifi_kit_8: {
    id: "heltec_wifi_kit_8",
    name: "Heltec WiFi Kit 8",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "heltec_wifi_kit_8",
  },
  wemos_d1_mini_oled: {
    id: "wemos_d1_mini_oled",
    name: "WEMOS D1 mini + OLED Shield",
    projectDir: path.join(FIRMWARE_ROOT, "esp-display-code-pet"),
    env: "wemos_d1_mini_oled",
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
let firmwareFlashProcess = null;
let firmwareFlashCancelled = false;
let desktopPetWindows = new Map();
let desktopPetPayloads = new Map();
let desktopPetPositions = new Map();
let tray = null;
let githubStarsCache = {
  value: null,
  updatedAt: 0,
};

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
  return iconImage([TRAY_ICON_PNG, APP_ICON_PNG, LOGO_PNG], size);
}

function setupAppIcon() {
  if (process.platform !== "darwin" || !app.dock) return;
  const image = appIconImage(512);
  if (!image.isEmpty()) app.dock.setIcon(image);
}

function showMainWindow() {
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

function parseArgs(argv) {
  const out = {
    host: "127.0.0.1",
    port: Number(process.env.CODE_PET_PORT) || DEFAULT_PORT,
    verbose: false,
    codexLog: true,
    cursorTranscript: true,
    watch: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host") out.host = argv[++i] || out.host;
    else if (arg === "--port") out.port = Number(argv[++i]) || out.port;
    else if (arg === "--verbose") out.verbose = true;
    else if (arg === "--no-codex-log") out.codexLog = false;
    else if (arg === "--no-cursor-transcript") out.cursorTranscript = false;
    else if (arg === "--watch") out.watch = true;
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

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === "bluetooth" && isMainWindow(webContents);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "bluetooth" && isMainWindow(webContents));
  });

  session.defaultSession.setDevicePermissionHandler((details) => {
    return details.deviceType === "bluetooth" && (details.origin === "file://" || details.origin === allowedOrigin);
  });
}

function finishBluetoothSelection(deviceId = "") {
  if (!bluetoothSelection) return false;
  const current = bluetoothSelection;
  bluetoothSelection = null;
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
      const preferred = DEVICE_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
      bluetoothSelection.devices.set(device.deviceId, {
        id: device.deviceId,
        name: name || `未命名 BLE 设备 ${device.deviceId.slice(-6)}`,
        preferred,
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
      m: compactDesktopText(packet.m || pet.title, "", 64),
      p: compactDesktopText(packet.p || persona.slug, "", 48),
      d: compactDesktopText(packet.d || persona.displayName, "", 48),
      k: compactDesktopText(packet.k || persona.kind, "", 24),
      u: typeof packet.u === "string" ? packet.u : "",
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
  const home = os.homedir();
  const additions = [
    path.join(home, ".platformio", "penv", "bin"),
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

function platformioCommand() {
  const env = cliEnv();
  if (commandExists("pio", env)) return "pio";
  if (commandExists("platformio", env)) return "platformio";
  const bundled = path.join(os.homedir(), ".platformio", "penv", "bin", process.platform === "win32" ? "pio.exe" : "pio");
  if (fs.existsSync(bundled)) return bundled;
  return "";
}

function listSerialPorts() {
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

function firmwareTargetList() {
  return Object.values(FIRMWARE_TARGETS).map((target) => ({
    id: target.id,
    name: target.name,
    env: target.env,
    available: fs.existsSync(path.join(target.projectDir, "platformio.ini")),
  }));
}

function startFirmwareFlash(options = {}) {
  if (firmwareFlashProcess) {
    throw new Error("A firmware flash task is already running.");
  }

  const target = FIRMWARE_TARGETS[options.targetId || ""];
  if (!target) throw new Error("Unknown firmware target.");
  if (!fs.existsSync(path.join(target.projectDir, "platformio.ini"))) {
    throw new Error(`Firmware project not found: ${target.projectDir}`);
  }

  const command = platformioCommand();
  if (!command) {
    throw new Error("PlatformIO CLI not found. Install PlatformIO and make sure pio is available.");
  }

  const port = String(options.port || "").trim();
  const args = ["run", "-d", target.projectDir, "-e", target.env, "-t", "upload"];
  if (port) args.push("--upload-port", port);

  broadcastFirmwareFlash({
    type: "start",
    targetId: target.id,
    targetName: target.name,
    port,
    command: [command, ...args].join(" "),
  });

  firmwareFlashCancelled = false;
  firmwareFlashProcess = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: cliEnv(),
    windowsHide: true,
  });

  const writeLog = (chunk) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
    if (text) broadcastFirmwareFlash({ type: "log", text });
  };

  firmwareFlashProcess.stdout.on("data", writeLog);
  firmwareFlashProcess.stderr.on("data", writeLog);
  firmwareFlashProcess.on("error", (err) => {
    firmwareFlashProcess = null;
    broadcastFirmwareFlash({ type: "error", message: err.message });
  });
  firmwareFlashProcess.on("close", (code, signal) => {
    firmwareFlashProcess = null;
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
  if (!firmwareFlashProcess) return { ok: true, running: false };
  firmwareFlashCancelled = true;
  firmwareFlashProcess.kill("SIGTERM");
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
  if (normalized === path.join(HOST_DIR, "public", "logo.png")) return "renderer";
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
    backgroundColor: "#eef4f7",
    webPreferences: {
      preload: PRELOAD_JS,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = win;
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

  win.webContents.once("did-finish-load", () => {
    broadcastState({ type: "snapshot", at: Date.now(), ...hub.getSnapshot() });
    win.webContents.send("code-pet:bridge-info", bridgeInfo);
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    finishBluetoothSelection("");
  });

  win.loadFile(INDEX_HTML);
}

function setupIpc() {
  ipcMain.handle("code-pet:get-snapshot", () => hub.getSnapshot());
  ipcMain.handle("code-pet:get-bridge-info", () => bridgeInfo);
  ipcMain.handle("code-pet:get-github-stars", () => getGitHubStars());
  ipcMain.handle("code-pet:get-petdex-pets", (_event, options = {}) => getPetdexPets(options));
  ipcMain.handle("code-pet:get-firmware-targets", () => firmwareTargetList());
  ipcMain.handle("code-pet:list-serial-ports", () => listSerialPorts());
  ipcMain.handle("code-pet:flash-firmware", (_event, options = {}) => startFirmwareFlash(options));
  ipcMain.handle("code-pet:cancel-firmware-flash", () => cancelFirmwareFlash());
  ipcMain.handle("code-pet:test-state", (_event, state) => {
    hub.upsert({
      agentId: "test",
      agentName: "Test",
      sessionId: "manual",
      state: state || "thinking",
      event: "ManualTest",
      title: "manual test",
    });
    return hub.getSnapshot();
  });
  ipcMain.handle("code-pet:choose-bluetooth-device", (_event, deviceId) => {
    return finishBluetoothSelection(deviceId || "");
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
    if (!mainWindow) {
      createMainWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const options = startupOptions;
    setupAppIcon();
    setupDevicePermissions();
    setupIpc();
    await startBackend(options);
    createTray();
    createMainWindow();
    setupDevWatch();
  }).catch((err) => {
    console.error(err);
    app.quit();
  });

  app.on("activate", () => {
    if (!mainWindow && hub) createMainWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopBackend);
}
