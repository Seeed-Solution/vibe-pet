"use strict";

const SERVICE_UUID = "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001";
const STATE_CHAR_UUID = "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002";
const BLUETOOTH_SCAN_NAME_PREFIX = "VibePet";
const BLUETOOTH_DEVICE_STORAGE_KEY = "code-pet-bluetooth-device";
const DEVICE_OUTPUT_MAX_CHARS = 120;
const BLUETOOTH_JSON_MAX_BYTES = 480;
const BLUETOOTH_TITLE_MAX_BYTES = 48;
const BLUETOOTH_DIRECT_WRITE_MAX_BYTES = 20;
const BLUETOOTH_FRAGMENT_DATA_BYTES = 18;

const stateName = document.getElementById("stateName");
const agentName = document.getElementById("agentName");
const eventName = document.getElementById("eventName");
const activeCount = document.getElementById("activeCount");
const connectionState = document.getElementById("connectionState");
const packetPreview = document.getElementById("packetPreview");
const petPreview = document.getElementById("petPreview");
const connectBtn = document.getElementById("connectBtn");
const testBtn = document.getElementById("testBtn");
const testState = document.getElementById("testState");
const themeOptions = Array.from(document.querySelectorAll("[data-theme-option]"));
const languageSelect = document.getElementById("languageSelect");
const statusPanelBtn = document.getElementById("statusPanelBtn");
const statusPanelModal = document.getElementById("statusPanelModal");
const statusPanelCloseBtn = document.getElementById("statusPanelCloseBtn");
const statusActions = document.querySelector(".status-actions");

let device = null;
let stateCharacteristic = null;
let autoConnectInFlight = false;
let autoConnectTimer = null;
let connectionMessage = { message: "connection.disconnected", values: {}, connected: false };
let latestDeviceSnapshot = null;
let bluetoothFragmentSequence = 0;
let latestAggregate = {
  state: "idle",
  agent: "agent",
  event: "",
  activeCount: 0,
  devicePacket: { v: 1, s: "idle", a: "agent", e: "", n: 0, ts: Date.now() },
};

function t(key, values) {
  return window.VibePetI18n ? window.VibePetI18n.t(key, values) : key;
}

function localizedMessage(message, values = {}) {
  if (typeof message === "string" && /^[a-z]+\./.test(message)) return t(message, values);
  return String(message || "");
}

function clampUtf8Text(value, maxBytes) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || maxBytes <= 0) return "";
  const encoder = new TextEncoder();
  if (encoder.encode(clean).length <= maxBytes) return clean;
  const suffix = maxBytes > 3 ? "..." : "";
  const suffixBytes = encoder.encode(suffix).length;
  let out = "";
  let bytes = 0;
  for (const char of clean) {
    const charBytes = encoder.encode(char).length;
    if (bytes + charBytes + suffixBytes > maxBytes) break;
    out += char;
    bytes += charBytes;
  }
  return out ? `${out.trimEnd()}${suffix}` : "";
}

function bluetoothJsonByteLength(payload) {
  return new TextEncoder().encode(JSON.stringify(payload || {})).length;
}

function compactBluetoothStatePayload(payload) {
  const next = { ...(payload || {}) };
  delete next.o;
  delete next.u;
  if (next.m) next.m = clampUtf8Text(next.m, BLUETOOTH_TITLE_MAX_BYTES);
  if (next.e) next.e = clampUtf8Text(next.e, 32);
  if (next.a) next.a = clampUtf8Text(next.a, 24);
  if (next.sl) next.sl = clampUtf8Text(next.sl, 24);
  if (next.p) next.p = clampUtf8Text(next.p, 48);
  if (next.d) next.d = clampUtf8Text(next.d, 48);
  if (next.k) next.k = clampUtf8Text(next.k, 24);

  if (bluetoothJsonByteLength(next) <= BLUETOOTH_JSON_MAX_BYTES) return next;
  delete next.m;
  if (bluetoothJsonByteLength(next) <= BLUETOOTH_JSON_MAX_BYTES) return next;
  delete next.sl;
  if (bluetoothJsonByteLength(next) <= BLUETOOTH_JSON_MAX_BYTES) return next;
  delete next.e;
  return next;
}

function stateLabel(state) {
  const key = `state.${state || "idle"}`;
  const label = t(key);
  return label === key ? t("state.unknown") : label;
}

function packetFromDeviceEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const packet = entry.packet && typeof entry.packet === "object" ? entry.packet : entry;
  return packet && typeof packet === "object" ? { ...packet } : null;
}

function stateFromDeviceEntry(entry) {
  const packet = packetFromDeviceEntry(entry);
  return String((entry && entry.state) || (packet && (packet.s || packet.state)) || "idle");
}

function packetFromDeviceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const pets = Array.isArray(snapshot.pets) ? snapshot.pets : [];
  let selected = null;
  for (const pet of pets) {
    const state = stateFromDeviceEntry(pet);
    if (state !== "idle" && state !== "sleeping") {
      selected = pet;
      break;
    }
    if (!selected) selected = pet;
  }
  return packetFromDeviceEntry(selected) || packetFromDeviceEntry(snapshot.aggregate);
}

async function refreshDeviceSnapshot() {
  try {
    const response = await fetch("/api/device-snapshot", { cache: "no-store" });
    if (response.ok) latestDeviceSnapshot = await response.json();
  } catch {}
  return latestDeviceSnapshot;
}

function renderConnection() {
  connectionState.textContent = localizedMessage(connectionMessage.message, connectionMessage.values);
  connectionState.dataset.connected = connectionMessage.connected ? "true" : "false";
  connectBtn.textContent = t(connectionMessage.connected ? "connection.reconnect" : "connection.connectDevice");
}

function setConnection(message, connected, values = {}) {
  connectionMessage = { message, values, connected };
  renderConnection();
}

function setStatusPanelOpen(open) {
  if (!statusPanelModal) return;
  statusPanelModal.hidden = !open;
  if (statusPanelBtn) statusPanelBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeStatusPanel() {
  setStatusPanelOpen(false);
}

function compactPacket(aggregate) {
  const devicePacket = packetFromDeviceSnapshot(latestDeviceSnapshot);
  const packet = devicePacket || (aggregate && aggregate.devicePacket ? { ...aggregate.devicePacket } : {
    v: 1,
    s: aggregate.state || "idle",
    a: aggregate.agent || "agent",
    e: aggregate.event || "",
    n: aggregate.activeCount || 0,
    ts: Date.now(),
  });
  packet.th = storedTheme();
  packet.sl = stateLabel(packet.s);
  packet.l = window.VibePetI18n && typeof window.VibePetI18n.getLocale === "function" ? window.VibePetI18n.getLocale() : "en";
  const output = String(packet.o || (aggregate && aggregate.output) || "").replace(/\s+/g, " ").trim();
  if (output) packet.o = output.length > DEVICE_OUTPUT_MAX_CHARS ? output.slice(0, DEVICE_OUTPUT_MAX_CHARS - 3) + "..." : output;
  else delete packet.o;
  return packet;
}

function render(aggregate) {
  latestAggregate = aggregate || latestAggregate;
  const packet = compactPacket(latestAggregate);
  stateName.textContent = stateLabel(packet.s);
  stateName.title = packet.s || "idle";
  agentName.textContent = packet.a || "agent";
  eventName.textContent = packet.e || "-";
  activeCount.textContent = String(packet.n || 0);
  packetPreview.textContent = JSON.stringify(packet, null, 2);
  petPreview.dataset.state = packet.s || "idle";
}

function storedTheme() {
  try {
    return localStorage.getItem("code-pet-theme") === "night" ? "night" : "day";
  } catch {
    return "day";
  }
}

function applyTheme(theme) {
  const nextTheme = theme === "night" ? "night" : "day";
  document.documentElement.dataset.theme = nextTheme;
  for (const option of themeOptions) {
    const active = option.dataset.themeOption === nextTheme;
    option.setAttribute("aria-pressed", active ? "true" : "false");
  }
  try {
    localStorage.setItem("code-pet-theme", nextTheme);
  } catch {}
  render(latestAggregate);
  if (stateCharacteristic) {
    sendCurrent().catch((err) => setConnection("connection.sendFailed", false, { message: err.message }));
  }
}

function readRememberedBluetoothDevice() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BLUETOOTH_DEVICE_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return null;
    const id = typeof parsed.id === "string" ? parsed.id : "";
    const name = typeof parsed.name === "string" ? parsed.name : "";
    return id || name ? { id, name } : null;
  } catch {
    return null;
  }
}

function rememberBluetoothDevice(nextDevice) {
  if (!nextDevice) return;
  const id = typeof nextDevice.id === "string" ? nextDevice.id : "";
  const name = typeof nextDevice.name === "string" ? nextDevice.name : "";
  if (!id && !name) return;
  if (name && !name.startsWith(BLUETOOTH_SCAN_NAME_PREFIX)) return;
  try {
    localStorage.setItem(BLUETOOTH_DEVICE_STORAGE_KEY, JSON.stringify({ id, name, updatedAt: Date.now() }));
  } catch {}
}

function isVibePetBluetoothDevice(nextDevice) {
  return !!(nextDevice && typeof nextDevice.name === "string" && nextDevice.name.startsWith(BLUETOOTH_SCAN_NAME_PREFIX));
}

function findRememberedBluetoothDevice(devices = []) {
  const remembered = readRememberedBluetoothDevice();
  if (remembered && remembered.id) {
    const exact = devices.find((item) => item && item.id === remembered.id);
    if (exact) return exact;
  }
  if (remembered && remembered.name) {
    const exactName = devices.find((item) => item && item.name === remembered.name);
    if (exactName) return exactName;
  }
  if (remembered) return null;
  const vibePetDevices = devices.filter(isVibePetBluetoothDevice);
  return vibePetDevices.length === 1 ? vibePetDevices[0] : null;
}

function handleBluetoothDisconnected() {
  stateCharacteristic = null;
  setConnection("connection.deviceDisconnected", false);
  scheduleAutoConnect(2000);
}

function setActiveBluetoothDevice(nextDevice) {
  if (device && device !== nextDevice && typeof device.removeEventListener === "function") {
    device.removeEventListener("gattserverdisconnected", handleBluetoothDisconnected);
  }
  device = nextDevice;
  if (device && typeof device.removeEventListener === "function") {
    device.removeEventListener("gattserverdisconnected", handleBluetoothDisconnected);
  }
  if (device && typeof device.addEventListener === "function") {
    device.addEventListener("gattserverdisconnected", handleBluetoothDisconnected);
  }
}

async function connectBluetoothDevice(nextDevice) {
  if (!nextDevice || !nextDevice.gatt) throw new Error("No Bluetooth device selected.");
  stateCharacteristic = null;
  setActiveBluetoothDevice(nextDevice);
  setConnection("connection.connecting", false);
  const server = await nextDevice.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  stateCharacteristic = await service.getCharacteristic(STATE_CHAR_UUID);
  rememberBluetoothDevice(nextDevice);
  setConnection(nextDevice.name || "connection.connected", true);
  await sendCurrent();
}

async function autoConnectKnownDevice() {
  if (autoConnectInFlight || stateCharacteristic) return false;
  if (!navigator.bluetooth || typeof navigator.bluetooth.getDevices !== "function") return false;
  autoConnectInFlight = true;
  try {
    const devices = await navigator.bluetooth.getDevices();
    const knownDevice = findRememberedBluetoothDevice(Array.isArray(devices) ? devices : []);
    if (!knownDevice) return false;
    await connectBluetoothDevice(knownDevice);
    return true;
  } catch {
    stateCharacteristic = null;
    setConnection("connection.disconnected", false);
    return false;
  } finally {
    autoConnectInFlight = false;
  }
}

function scheduleAutoConnect(delay = 0) {
  if (autoConnectTimer) clearTimeout(autoConnectTimer);
  autoConnectTimer = setTimeout(() => {
    autoConnectTimer = null;
    autoConnectKnownDevice();
  }, delay);
}

async function sendCurrent() {
  if (!stateCharacteristic) return;
  const packet = compactBluetoothStatePayload(compactPacket(latestAggregate));
  packet.ts = Date.now();
  const bytes = new TextEncoder().encode(JSON.stringify(packet));
  if (bytes.length > BLUETOOTH_JSON_MAX_BYTES) throw new Error(`BLE payload too large (${bytes.length} bytes).`);
  try {
    await writeBluetoothBytes(bytes);
  } catch (err) {
    if (bytes.length <= BLUETOOTH_DIRECT_WRITE_MAX_BYTES) throw err;
    await writeBluetoothFragmentedBytes(bytes);
    console.warn("[ble] direct write failed; sent fragmented payload", err && err.message ? err.message : err);
  }
  setConnection((device && device.name) || "connection.connected", true);
}

async function writeBluetoothBytes(bytes) {
  if (!stateCharacteristic) throw new Error("No Bluetooth connection.");
  if (stateCharacteristic.writeValueWithResponse) {
    await stateCharacteristic.writeValueWithResponse(bytes);
  } else {
    await stateCharacteristic.writeValue(bytes);
  }
}

function nextBluetoothFragmentId() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const id = alphabet[bluetoothFragmentSequence % alphabet.length];
  bluetoothFragmentSequence = (bluetoothFragmentSequence + 1) % alphabet.length;
  return id;
}

async function writeBluetoothFragmentedBytes(bytes) {
  const encoder = new TextEncoder();
  const id = nextBluetoothFragmentId();
  await writeBluetoothBytes(encoder.encode(`#${id}:${bytes.length}`));
  for (let offset = 0; offset < bytes.length; offset += BLUETOOTH_FRAGMENT_DATA_BYTES) {
    const chunk = bytes.subarray(offset, offset + BLUETOOTH_FRAGMENT_DATA_BYTES);
    const packet = new Uint8Array(2 + chunk.length);
    packet[0] = 43;
    packet[1] = id.charCodeAt(0);
    packet.set(chunk, 2);
    await writeBluetoothBytes(packet);
  }
  await writeBluetoothBytes(encoder.encode(`!${id}`));
}

async function connectDevice() {
  if (!navigator.bluetooth) {
    setConnection("connection.noBluetoothWeb", false);
    return;
  }
  if (await autoConnectKnownDevice()) return;
  setConnection("connection.selecting", false);
  const selectedDevice = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: BLUETOOTH_SCAN_NAME_PREFIX }],
    optionalServices: [SERVICE_UUID],
  });
  await connectBluetoothDevice(selectedDevice);
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("message", async (event) => {
    const payload = JSON.parse(event.data);
    if (payload.aggregate) {
      await refreshDeviceSnapshot();
      render(payload.aggregate);
      try {
        await sendCurrent();
      } catch (err) {
        setConnection("connection.sendFailed", false, { message: err.message });
      }
    }
  });
}

connectBtn.addEventListener("click", () => {
  connectDevice().catch((err) => setConnection("connection.failed", false, { message: err.message }));
});

statusPanelBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  setStatusPanelOpen(statusPanelModal.hidden);
});

statusPanelCloseBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  closeStatusPanel();
});

document.addEventListener("click", (event) => {
  if (!statusPanelModal || statusPanelModal.hidden) return;
  if (statusPanelModal.contains(event.target)) return;
  if (statusActions && statusActions.contains(event.target)) return;
  closeStatusPanel();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && statusPanelModal && !statusPanelModal.hidden) closeStatusPanel();
});

testBtn.addEventListener("click", async () => {
  await fetch(`/api/test-state?state=${encodeURIComponent(testState.value)}`);
});

for (const option of themeOptions) {
  option.addEventListener("click", () => applyTheme(option.dataset.themeOption));
}

languageSelect.addEventListener("change", () => {
  if (window.VibePetI18n) window.VibePetI18n.setLocale(languageSelect.value);
});

window.addEventListener("code-pet:language-change", async () => {
  renderConnection();
  await refreshDeviceSnapshot();
  render(latestAggregate);
  if (stateCharacteristic) {
    sendCurrent().catch((err) => setConnection("connection.sendFailed", false, { message: err.message }));
  }
});

applyTheme(storedTheme());
Promise.all([
  fetch("/api/snapshot").then((res) => res.json()),
  refreshDeviceSnapshot(),
])
  .then(([snapshot]) => render(snapshot.aggregate))
  .catch(() => render(latestAggregate));
connectEvents();
scheduleAutoConnect(600);
