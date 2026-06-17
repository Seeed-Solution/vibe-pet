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

const VALID_STATES = new Set([
  "idle",
  "thinking",
  "working",
  "typing",
  "building",
  "juggling",
  "attention",
  "notification",
  "permission",
  "error",
  "sweeping",
  "sleeping",
]);

function clampText(value, max) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 3) + "..." : clean;
}

function normalizeState(state) {
  const raw = typeof state === "string" ? state.trim() : "";
  if (raw === "codex-permission") return "notification";
  if (raw === "permission") return "notification";
  return VALID_STATES.has(raw) ? raw : "idle";
}

function toDevicePacket(snapshot) {
  const data = snapshot || {};
  const state = normalizeState(data.state);
  const packet = {
    v: 1,
    s: state,
    a: clampText(data.agent || data.agentId || "agent", 14),
    e: clampText(data.event || "", 24),
    n: Number.isFinite(data.activeCount) ? data.activeCount : 0,
    ts: Date.now(),
  };

  const title = clampText(data.title || data.cwdBasename || "", 32);
  if (title) packet.m = title;

  return packet;
}

function encodeDevicePacket(snapshot) {
  return JSON.stringify(toDevicePacket(snapshot));
}

module.exports = {
  DEVICE_NAME_PREFIXES,
  SERVICE_UUID,
  STATE_CHAR_UUID,
  VALID_STATES,
  encodeDevicePacket,
  normalizeState,
  toDevicePacket,
};
