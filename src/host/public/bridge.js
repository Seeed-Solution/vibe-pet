"use strict";

const SERVICE_UUID = "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001";
const STATE_CHAR_UUID = "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002";
const DEVICE_NAME_PREFIXES = [
  "VibePet-Wio",
  "VibePet-ESP-AI",
  "VibePet-ESP-Display",
  "VibePet-M5",
  "VibePet-LILYGO",
  "VibePet-Heltec",
  "VibePet-WEMOS",
  "CodePet-Wio",
  "CodePet-ESP-AI",
  "CodePet-ESP-Display",
  "CodePet-M5",
  "CodePet-LILYGO",
  "CodePet-Heltec",
  "CodePet-WEMOS",
];

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
let connectionMessage = { message: "connection.disconnected", values: {}, connected: false };
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

function stateLabel(state) {
  const key = `state.${state || "idle"}`;
  const label = t(key);
  return label === key ? t("state.unknown") : label;
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
  if (aggregate && aggregate.devicePacket) return aggregate.devicePacket;
  return {
    v: 1,
    s: aggregate.state || "idle",
    a: aggregate.agent || "agent",
    e: aggregate.event || "",
    n: aggregate.activeCount || 0,
    ts: Date.now(),
  };
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
}

async function sendCurrent() {
  if (!stateCharacteristic) return;
  const packet = compactPacket(latestAggregate);
  packet.ts = Date.now();
  const bytes = new TextEncoder().encode(JSON.stringify(packet));
  if (stateCharacteristic.writeValueWithResponse) {
    await stateCharacteristic.writeValueWithResponse(bytes);
  } else {
    await stateCharacteristic.writeValue(bytes);
  }
}

async function connectDevice() {
  if (!navigator.bluetooth) {
    setConnection("connection.noBluetoothWeb", false);
    return;
  }
  setConnection("connection.selecting", false);
  device = await navigator.bluetooth.requestDevice({
    filters: DEVICE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
    optionalServices: [SERVICE_UUID],
  });
  device.addEventListener("gattserverdisconnected", () => {
    stateCharacteristic = null;
    setConnection("connection.deviceDisconnected", false);
  });
  setConnection("connection.connecting", false);
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  stateCharacteristic = await service.getCharacteristic(STATE_CHAR_UUID);
  setConnection(device.name || "connection.connected", true);
  await sendCurrent();
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("message", async (event) => {
    const payload = JSON.parse(event.data);
    if (payload.aggregate) {
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

window.addEventListener("code-pet:language-change", () => {
  renderConnection();
  render(latestAggregate);
});

applyTheme(storedTheme());
fetch("/api/snapshot")
  .then((res) => res.json())
  .then((snapshot) => render(snapshot.aggregate))
  .catch(() => render(latestAggregate));
connectEvents();
