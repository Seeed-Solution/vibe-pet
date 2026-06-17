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
const PET_SELECTION_STORAGE_KEY = "code-pet-personas";
const PET_CACHE_STORAGE_KEY = "code-pet-persona-cache";
const LEGACY_BUILTIN_PET_SLUGS = new Set(["code-pet"]);
const BUILTIN_PET = {
  slug: "lulu-capybara-2",
  displayName: "噜噜",
  kind: "builtin",
  submittedBy: "gitcjp",
  spritesheetUrl: "assets/lulu-capybara.webp",
};
const PETDEX_FRAME_WIDTH = 192;
const PETDEX_FRAME_HEIGHT = 208;
const PETDEX_DEFAULT_COLS = 8;
const PETDEX_DEFAULT_ROWS = 9;
const PETDEX_FRAME_MS = 150;
const PETDEX_PICKER_LIMIT = 240;
const PETDEX_SOURCE_REPO = "https://github.com/crafter-station/petdex";
const PETDEX_ROW_BY_STATE = {
  idle: 0,
  sleeping: 0,
  notification: 1,
  working: 2,
  typing: 2,
  building: 2,
  juggling: 2,
  error: 3,
  thinking: 4,
  sweeping: 4,
  attention: 5,
};
const PETDEX_DEFAULT_FRAME_SEQUENCE = [0, 1, 2, 3, 2, 1];
const PETDEX_FRAME_SEQUENCE_BY_STATE = {
  idle: [0, 1, 2, 3, 4, 3, 2, 1],
  sleeping: [0, 1, 2, 1],
  thinking: [0, 1, 2, 1],
  notification: [0, 1, 2, 3, 4, 3, 2, 1],
  working: [0, 1, 2, 3, 4, 5, 6, 7],
  typing: [0, 1, 2, 3, 4, 5, 6, 7],
  building: [0, 1, 2, 3, 4, 5, 6, 7],
  juggling: [0, 1, 2, 3, 4, 5, 6, 7],
  error: [0, 1, 2, 1],
  attention: [0, 1, 2, 3, 2, 1],
  sweeping: [0, 1, 2, 1],
};
const VIEW_STATE_PRIORITY = {
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
const EDITOR_GROUP_RECENT_MS = 15000;
const PET_AVATAR_SWITCH_ICON = [
  '<svg class="pet-avatar-icon" viewBox="0 0 24 24" aria-hidden="true">',
  '<path class="pet-avatar-icon-card pet-avatar-icon-card-back" d="M7.8 4.8h8.8c1 0 1.8.8 1.8 1.8v8.8c0 1-.8 1.8-1.8 1.8H7.8c-1 0-1.8-.8-1.8-1.8V6.6c0-1 .8-1.8 1.8-1.8Z"/>',
  '<path class="pet-avatar-icon-card" d="M5.6 7.1h9.3c1 0 1.8.8 1.8 1.8v9.3c0 1-.8 1.8-1.8 1.8H5.6c-1 0-1.8-.8-1.8-1.8V8.9c0-1 .8-1.8 1.8-1.8Z"/>',
  '<path class="pet-avatar-icon-face" d="M7.2 13.4h.1M13.1 13.4h.1M8 16.2c1.3 1 3.2 1 4.5 0"/>',
  '<path class="pet-avatar-icon-sparkle" d="M18.3 3.6 19.1 6l2.1.8-2.1.8-.8 2.4-.8-2.4-2.1-.8 2.1-.8.8-2.4Z"/>',
  '<path class="pet-avatar-icon-orbit" d="M19.3 13.4c.9 1.8.5 4-1 5.4M18.5 18.9h-2.7l1.1 1.2"/>',
  "</svg>",
].join("");
const IDE_ALIASES = {
  "claude-cli": "claude-code",
  claude: "claude-code",
  gemini: "gemini-cli",
  copilot: "copilot-cli",
  kimi: "kimi-cli",
  qwen: "qwen-code",
  codeium: "windsurf",
};

function ideLogoSvg(className, body, viewBox = "0 0 32 32") {
  return [
    `<span class="ide-logo ${className}">`,
    `<svg viewBox="${viewBox}" aria-hidden="true">`,
    body,
    "</svg>",
    "</span>",
  ].join("");
}

const OPENAI_ICON_PATH = "M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z";

const IDE_LOGOS = {
  codex: {
    label: "Codex",
    logo: ideLogoSvg("ide-logo-codex", [
      '<defs><linearGradient id="codexLogoBg" x1="1" y1="1" x2="15" y2="15"><stop stop-color="#10A37F"/><stop offset=".52" stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs>',
      '<rect width="16" height="16" rx="4.2" fill="url(#codexLogoBg)"/>',
      `<path d="${OPENAI_ICON_PATH}" fill="#fff"/>`,
    ].join(""), "0 0 16 16"),
  },
  cursor: {
    label: "Cursor",
    logo: [
      '<span class="ide-logo ide-logo-cursor">',
      '<img class="ide-logo-image" src="assets/cursor-logo.png" alt="">',
      "</span>",
    ].join(""),
  },
  windsurf: {
    label: "Windsurf",
    logo: ideLogoSvg("ide-logo-windsurf", [
      '<defs><linearGradient id="windsurfLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#08111F"/><stop offset=".48" stop-color="#0C4A6E"/><stop offset="1" stop-color="#14B8A6"/></linearGradient><linearGradient id="windsurfWave" x1="5" y1="9" x2="27" y2="23"><stop stop-color="#A7F3D0"/><stop offset=".48" stop-color="#38BDF8"/><stop offset="1" stop-color="#FDE68A"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#windsurfLogoBg)"/>',
      '<path d="M5.2 18.8c4.2-6.7 9.3-9.7 15.5-9 3.2.4 5.4 1.8 6.8 4.3-4-1.9-7.9-1.7-11.7.6-2.5 1.5-4.4 3.7-5.7 6.5 4.5-3.7 9-4.8 13.6-3.2 1.4.5 2.7 1.3 3.7 2.4-3.5-.5-6.6.1-9.2 1.9-2.2 1.4-3.9 3.5-5.2 6.3L5.2 18.8Z" fill="url(#windsurfWave)"/>',
      '<path d="M7.3 18.8c3.5-4.3 7.5-6.1 12-5.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".86"/>',
    ].join("")),
  },
  "claude-code": {
    label: "Claude Code",
    logo: ideLogoSvg("ide-logo-claude", [
      '<defs><linearGradient id="claudeLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#FFF7ED"/><stop offset=".46" stop-color="#FDBA74"/><stop offset="1" stop-color="#C2410C"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#claudeLogoBg)"/>',
      '<path d="M16 4.4 19.4 12.6 28.1 16 19.4 19.4 16 27.6 12.6 19.4 3.9 16 12.6 12.6 16 4.4Z" fill="#8A3A16"/>',
      '<circle cx="16" cy="16" r="3.1" fill="#FFF7ED"/>',
      '<path d="M16 9.7v12.6M9.7 16h12.6" stroke="#FED7AA" stroke-width="1.4" stroke-linecap="round"/>',
    ].join("")),
  },
  "gemini-cli": {
    label: "Gemini CLI",
    logo: ideLogoSvg("ide-logo-gemini", [
      '<defs><linearGradient id="geminiLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#1D4ED8"/><stop offset=".46" stop-color="#7C3AED"/><stop offset="1" stop-color="#EC4899"/></linearGradient><linearGradient id="geminiStar" x1="6" y1="4" x2="26" y2="28"><stop stop-color="#DBEAFE"/><stop offset=".45" stop-color="#A5B4FC"/><stop offset="1" stop-color="#F9A8D4"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#geminiLogoBg)"/>',
      '<path d="M16 4.1c1.6 6.8 5.1 10.3 11.9 11.9C21.1 17.6 17.6 21.1 16 27.9 14.4 21.1 10.9 17.6 4.1 16 10.9 14.4 14.4 10.9 16 4.1Z" fill="url(#geminiStar)"/>',
      '<circle cx="23.8" cy="8.2" r="2" fill="#FDE68A"/>',
    ].join("")),
  },
  "copilot-cli": {
    label: "Copilot CLI",
    logo: ideLogoSvg("ide-logo-copilot", [
      '<defs><linearGradient id="copilotLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#111827"/><stop offset=".54" stop-color="#14532D"/><stop offset="1" stop-color="#22C55E"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#copilotLogoBg)"/>',
      '<path d="M6.8 14.2c0-5 3.7-8.8 9.2-8.8s9.2 3.8 9.2 8.8v6.1c0 3.6-2.4 5.8-6.1 5.8h-6.2c-3.7 0-6.1-2.2-6.1-5.8v-6.1Z" fill="#F0FDF4"/>',
      '<path d="M10.1 15.1c1.5-1 3.4-1 4.9 0M17 15.1c1.5-1 3.4-1 4.9 0" fill="none" stroke="#166534" stroke-width="2.1" stroke-linecap="round"/>',
      '<path d="M13.3 21.9h5.4" fill="none" stroke="#166534" stroke-width="1.9" stroke-linecap="round"/>',
      '<path d="M8.6 10.7 5.2 8.4M23.4 10.7l3.4-2.3" stroke="#86EFAC" stroke-width="2" stroke-linecap="round"/>',
    ].join("")),
  },
  codebuddy: {
    label: "CodeBuddy",
    logo: ideLogoSvg("ide-logo-codebuddy", [
      '<defs><linearGradient id="codebuddyLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#0EA5E9"/><stop offset=".5" stop-color="#2563EB"/><stop offset="1" stop-color="#22C55E"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#codebuddyLogoBg)"/>',
      '<path d="M9 11.2h9.2c3 0 5.1 2 5.1 4.8s-2.1 4.8-5.1 4.8h-3.9L9 25v-3.9c-2.4-.5-4-2.4-4-5.1 0-2.8 1.7-4.8 4-4.8Z" fill="#E0F2FE"/>',
      '<path d="M11 16h.1M16 16h.1M20.8 16h.1" stroke="#1D4ED8" stroke-width="2.4" stroke-linecap="round"/>',
      '<path d="m10.4 8.3 2.3-2.3M21.6 8.3 19.3 6" stroke="#BBF7D0" stroke-width="2" stroke-linecap="round"/>',
    ].join("")),
  },
  "kimi-cli": {
    label: "Kimi Code CLI",
    logo: ideLogoSvg("ide-logo-kimi", [
      '<defs><linearGradient id="kimiLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#020617"/><stop offset=".48" stop-color="#1D4ED8"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#kimiLogoBg)"/>',
      '<path d="M22.8 8.7a9.2 9.2 0 1 0 .5 13.5A7.3 7.3 0 0 1 14 12.9a9 9 0 0 0 8.8-4.2Z" fill="#E0F2FE"/>',
      '<path d="M9.2 21.7 15.8 16l-6.2-5.5M16.8 22.2l5.8-12.4" fill="none" stroke="#67E8F9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    ].join("")),
  },
  "qwen-code": {
    label: "Qwen Code",
    logo: ideLogoSvg("ide-logo-qwen", [
      '<defs><linearGradient id="qwenLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#312E81"/><stop offset=".5" stop-color="#7C3AED"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#qwenLogoBg)"/>',
      '<circle cx="16" cy="15.2" r="8" fill="#EEF2FF"/>',
      '<path d="M20.5 20.8 25 25.2" stroke="#A855F7" stroke-width="2.5" stroke-linecap="round"/>',
      '<path d="M11.4 15.2a4.6 4.6 0 1 1 9.2 0 4.6 4.6 0 0 1-9.2 0Z" fill="#7C3AED"/>',
      '<path d="M13.4 15.2a2.6 2.6 0 1 1 5.2 0 2.6 2.6 0 0 1-5.2 0Z" fill="#67E8F9"/>',
    ].join("")),
  },
  openclaw: {
    label: "OpenClaw",
    logo: ideLogoSvg("ide-logo-openclaw", [
      '<defs><linearGradient id="openclawLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#F97316"/><stop offset=".5" stop-color="#DC2626"/><stop offset="1" stop-color="#7F1D1D"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#openclawLogoBg)"/>',
      '<path d="M16 24.8c-4.5 0-7.5-2.1-7.5-5.2 0-2.9 2.7-5.1 7.5-5.1s7.5 2.2 7.5 5.1c0 3.1-3 5.2-7.5 5.2Z" fill="#FFF7ED"/>',
      '<path d="M8.8 13.5 6.2 7.3l5.2 4.1M14.3 12.2 13 5.2l4 6.1M19.7 12.2 25.8 7l-2.6 6.6" fill="none" stroke="#FED7AA" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
      '<circle cx="13" cy="19.2" r="1.2" fill="#991B1B"/><circle cx="19" cy="19.2" r="1.2" fill="#991B1B"/>',
    ].join("")),
  },
  opencode: {
    label: "opencode",
    logo: ideLogoSvg("ide-logo-opencode", [
      '<defs><linearGradient id="opencodeLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#064E3B"/><stop offset=".52" stop-color="#059669"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#opencodeLogoBg)"/>',
      '<path d="M12.1 9.2 6.4 16l5.7 6.8M19.9 9.2 25.6 16l-5.7 6.8" fill="none" stroke="#ECFDF5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="m17.9 8.5-3.8 15" stroke="#FDE68A" stroke-width="2.4" stroke-linecap="round"/>',
    ].join("")),
  },
  qoder: {
    label: "Qoder",
    logo: ideLogoSvg("ide-logo-qoder", [
      '<defs><linearGradient id="qoderLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#1E40AF"/><stop offset=".5" stop-color="#2563EB"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#qoderLogoBg)"/>',
      '<path d="M16 5.8 25 11v10l-9 5.2L7 21V11l9-5.2Z" fill="#DBEAFE"/>',
      '<path d="M16 10.4 21.2 13.4v5.8L16 22.2l-5.2-3v-5.8L16 10.4Z" fill="#2563EB"/>',
      '<path d="M16 10.4v11.8M10.8 13.4l10.4 5.8M21.2 13.4l-10.4 5.8" stroke="#93C5FD" stroke-width="1.5" stroke-linecap="round"/>',
    ].join("")),
  },
  hermes: {
    label: "Hermes Agent",
    logo: ideLogoSvg("ide-logo-hermes", [
      '<defs><linearGradient id="hermesLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#7C2D12"/><stop offset=".5" stop-color="#D97706"/><stop offset="1" stop-color="#FDE047"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#hermesLogoBg)"/>',
      '<path d="M7 19.8c4.1-.4 7.3-2.2 9.2-5.1C18.3 18 21.4 19.6 25 19.8c-2.2 2.2-5.1 3.5-8.8 3.5-3.8 0-6.8-1.3-9.2-3.5Z" fill="#FFFBEB"/>',
      '<path d="M16 7.2v16.2M11.3 11.5h9.4M10.2 15h11.6" stroke="#92400E" stroke-width="2" stroke-linecap="round"/>',
      '<path d="M8.4 12.2 4.8 8.4M23.6 12.2l3.6-3.8" stroke="#FEF3C7" stroke-width="2.2" stroke-linecap="round"/>',
    ].join("")),
  },
  reasonix: {
    label: "Reasonix CLI",
    logo: ideLogoSvg("ide-logo-reasonix", [
      '<defs><linearGradient id="reasonixLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#581C87"/><stop offset=".48" stop-color="#7C3AED"/><stop offset="1" stop-color="#F43F5E"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#reasonixLogoBg)"/>',
      '<path d="M10.2 19.8a5.9 5.9 0 0 1 2.7-11.1 5.3 5.3 0 0 1 6.2 0 5.9 5.9 0 0 1 2.7 11.1 5.2 5.2 0 0 1-5.8 4.5 5.2 5.2 0 0 1-5.8-4.5Z" fill="#F5F3FF"/>',
      '<path d="M11.2 17.8h9.6M13.6 13.3h4.8M16 10.8v10.4" stroke="#7C3AED" stroke-width="1.8" stroke-linecap="round"/>',
      '<circle cx="11.2" cy="17.8" r="1.6" fill="#F43F5E"/><circle cx="20.8" cy="17.8" r="1.6" fill="#06B6D4"/><circle cx="16" cy="10.8" r="1.5" fill="#FACC15"/>',
    ].join("")),
  },
  test: {
    label: "Test",
    logo: ideLogoSvg("ide-logo-test", [
      '<defs><linearGradient id="testLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#475569"/><stop offset=".5" stop-color="#0891B2"/><stop offset="1" stop-color="#A3E635"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#testLogoBg)"/>',
      '<path d="M12.2 6.8h7.6M16 7v7.4l5.3 7.7c1 1.5-.1 3.5-1.9 3.5h-6.8c-1.8 0-2.9-2-1.9-3.5l5.3-7.7" fill="none" stroke="#ECFEFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M12.3 21.2h7.4" stroke="#BEF264" stroke-width="2" stroke-linecap="round"/>',
    ].join("")),
  },
  agent: {
    label: "Agent",
    logo: ideLogoSvg("ide-logo-agent", [
      '<defs><linearGradient id="agentLogoBg" x1="4" y1="3" x2="28" y2="29"><stop stop-color="#334155"/><stop offset=".52" stop-color="#0F766E"/><stop offset="1" stop-color="#84CC16"/></linearGradient></defs>',
      '<rect width="32" height="32" rx="8" fill="url(#agentLogoBg)"/>',
      '<path d="M9.2 10.4 4.8 16l4.4 5.6M22.8 10.4l4.4 5.6-4.4 5.6M18.8 7.6l-5.6 16.8" fill="none" stroke="#F8FAFC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
      '<circle cx="16" cy="16" r="2.1" fill="#BEF264"/>',
    ].join("")),
  },
};

const stateName = document.getElementById("stateName");
const agentName = document.getElementById("agentName");
const eventName = document.getElementById("eventName");
const agentOutput = document.getElementById("agentOutput");
const activeCount = document.getElementById("activeCount");
const bridgePort = document.getElementById("bridgePort");
const packetPreview = document.getElementById("packetPreview");
const petGrid = document.getElementById("petGrid");
const githubStarsCount = document.getElementById("githubStarsCount");
const connectBtn = document.getElementById("connectBtn");
const connectBtnLabel = document.getElementById("connectBtnLabel");
const flashBtn = document.getElementById("flashBtn");
const testBtn = document.getElementById("testBtn");
const testState = document.getElementById("testState");
const themeOptions = Array.from(document.querySelectorAll("[data-theme-option]"));
const languageSelect = document.getElementById("languageSelect");
const statusPanelBtn = document.getElementById("statusPanelBtn");
const statusPanelModal = document.getElementById("statusPanelModal");
const statusPanelCloseBtn = document.getElementById("statusPanelCloseBtn");
const statusActions = document.querySelector(".status-actions");
const devicePicker = document.getElementById("devicePicker");
const deviceList = document.getElementById("deviceList");
const cancelDeviceBtn = document.getElementById("cancelDeviceBtn");
const petPickerModal = document.getElementById("petPickerModal");
const petPickerSearch = document.getElementById("petPickerSearch");
const petPickerKind = document.getElementById("petPickerKind");
const petPickerRefreshBtn = document.getElementById("petPickerRefreshBtn");
const petPickerCloseBtn = document.getElementById("petPickerCloseBtn");
const petPickerStatus = document.getElementById("petPickerStatus");
const petChoiceGrid = document.getElementById("petChoiceGrid");
const petPickerSource = document.getElementById("petPickerSource");
const firmwareModal = document.getElementById("firmwareModal");
const firmwareTarget = document.getElementById("firmwareTarget");
const firmwarePort = document.getElementById("firmwarePort");
const firmwareRefreshPortsBtn = document.getElementById("firmwareRefreshPortsBtn");
const firmwareStartBtn = document.getElementById("firmwareStartBtn");
const firmwareCancelBtn = document.getElementById("firmwareCancelBtn");
const firmwareCloseBtn = document.getElementById("firmwareCloseBtn");
const firmwareStatus = document.getElementById("firmwareStatus");
const firmwareLog = document.getElementById("firmwareLog");

let device = null;
let stateCharacteristic = null;
let selectingDevice = false;
let petSelections = loadPetSelections();
let cachedPetdexPetsBySlug = loadCachedPetdexPets();
let petdexPets = [];
let petdexPetsBySlug = new Map();
let petdexLoaded = false;
let petdexLoading = false;
let petdexError = "";
let petdexFrame = 0;
let petdexImageMeta = new Map();
let petdexImageLoading = new Map();
let activePetPickerId = "";
let petPickerQuery = "";
let petPickerKindFilter = "";
let petViewOrder = [];
let petSelectionAliasesByViewId = new Map();
let lastBluetoothDevices = [];
let firmwareTargets = [];
let firmwarePorts = [];
let firmwareModalOpen = false;
let firmwareFlashing = false;
let latestHardwarePets = [];
let connectionMessage = { message: "connection.disconnected", values: {}, connected: false };
let latestSnapshot = {
  aggregate: {
    state: "idle",
    agent: "agent",
    event: "",
    activeCount: 0,
    devicePacket: { v: 1, s: "idle", a: "agent", e: "", n: 0, ts: Date.now() },
  },
  sessions: [],
};

function t(key, values) {
  return window.VibePetI18n ? window.VibePetI18n.t(key, values) : key;
}

function localizedMessage(message, values = {}) {
  if (message && typeof message === "object") return localizedMessage(message.message, message.values || {});
  if (typeof message === "string" && /^[a-z]+\./.test(message)) return t(message, values);
  return String(message || "");
}

function stateLabel(state) {
  const key = `state.${state || "idle"}`;
  const label = t(key);
  return label === key ? t("state.unknown") : label;
}

function formatStarCount(value) {
  const stars = Number(value);
  if (!Number.isFinite(stars) || stars < 0) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      notation: stars >= 1000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(stars);
  } catch {
    return String(Math.round(stars));
  }
}

async function refreshGitHubStars() {
  if (!githubStarsCount || !window.codePet || typeof window.codePet.getGitHubStars !== "function") return;
  try {
    const result = await window.codePet.getGitHubStars();
    const count = formatStarCount(result && result.stars);
    if (count) githubStarsCount.textContent = `${count} Stars`;
  } catch {}
}

function renderConnection() {
  const message = localizedMessage(connectionMessage.message, connectionMessage.values);
  const connected = !!connectionMessage.connected;
  const transient = ["connection.scanning", "connection.connecting"].includes(connectionMessage.message);
  const label = connected || transient ? message : t("connection.connectDevice");
  if (connectBtnLabel) connectBtnLabel.textContent = label || t("connection.connectDevice");
  connectBtn.dataset.connected = connected ? "true" : "false";
  connectBtn.title = message || t("connection.connectDevice");
  connectBtn.setAttribute("aria-label", connectBtn.title);
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

function openStatusPanel() {
  setStatusPanelOpen(true);
}

function closeStatusPanel() {
  setStatusPanelOpen(false);
}

function compactPacket(aggregate) {
  if (aggregate && aggregate.devicePacket) return { ...aggregate.devicePacket };
  return {
    v: 1,
    s: aggregate.state || "idle",
    a: aggregate.agent || "agent",
    e: aggregate.event || "",
    n: aggregate.activeCount || 0,
    ts: Date.now(),
  };
}

function compactPersona(persona) {
  const normalized = desktopPetPersona(persona);
  return {
    slug: clampText(normalized.slug || BUILTIN_PET.slug, 48) || BUILTIN_PET.slug,
    displayName: clampText(normalized.displayName || BUILTIN_PET.displayName, 48) || BUILTIN_PET.displayName,
    kind: clampText(normalized.kind || "", 24),
    spritesheetUrl: normalized.spritesheetUrl || "",
  };
}

function packetWithPersona(packet, persona) {
  const next = { ...(packet || {}) };
  const compact = compactPersona(persona);
  next.p = compact.slug;
  next.d = compact.displayName;
  if (compact.kind) next.k = compact.kind;
  if (compact.spritesheetUrl) next.u = compact.spritesheetUrl;
  return next;
}

function clampText(value, max) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 3) + "..." : clean;
}

function setAutoScrollingOutput(element, value) {
  if (!element) return;
  const text = String(value || "-");
  element.title = text === "-" ? "" : text;
  element.dataset.overflow = "false";
  element.scrollTop = 0;

  const content = document.createElement("span");
  content.className = "auto-scroll-output-content";
  content.textContent = text;
  element.replaceChildren(content);

  requestAnimationFrame(() => {
    if (!element.isConnected || !content.isConnected) return;
    const style = window.getComputedStyle(element);
    const verticalPadding = parseFloat(style.paddingTop || "0") + parseFloat(style.paddingBottom || "0");
    const availableHeight = Math.max(0, element.clientHeight - verticalPadding);
    const overflowing = content.scrollHeight > availableHeight + 2;
    element.dataset.overflow = overflowing ? "true" : "false";
    if (overflowing) element.scrollTop = element.scrollHeight;
  });
}

function loadPetSelections() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PET_SELECTION_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function savePetSelections() {
  try {
    localStorage.setItem(PET_SELECTION_STORAGE_KEY, JSON.stringify(petSelections));
  } catch {}
}

function normalizePetdexPet(pet) {
  if (
    !pet
    || typeof pet.slug !== "string"
    || typeof pet.displayName !== "string"
    || typeof pet.spritesheetUrl !== "string"
  ) {
    return null;
  }
  return {
    slug: pet.slug,
    displayName: pet.displayName,
    kind: typeof pet.kind === "string" ? pet.kind : "",
    submittedBy: typeof pet.submittedBy === "string" ? pet.submittedBy : "",
    spritesheetUrl: pet.spritesheetUrl,
  };
}

function loadCachedPetdexPets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PET_CACHE_STORAGE_KEY) || "{}");
    const entries = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.values(parsed) : [];
    return new Map(entries.map(normalizePetdexPet).filter(Boolean).map((pet) => [pet.slug, pet]));
  } catch {
    return new Map();
  }
}

function saveCachedPetdexPets() {
  try {
    localStorage.setItem(PET_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(cachedPetdexPetsBySlug)));
  } catch {}
}

function cachePetdexPet(pet) {
  const normalized = normalizePetdexPet(pet);
  if (!normalized || normalized.slug === BUILTIN_PET.slug) return;
  cachedPetdexPetsBySlug.set(normalized.slug, normalized);
}

function normalizePetdexPets(input) {
  const pets = input && Array.isArray(input.pets) ? input.pets : [];
  return pets.map(normalizePetdexPet).filter(Boolean);
}

function setPetdexPets(input) {
  petdexPets = normalizePetdexPets(input);
  const manifestPetsBySlug = new Map(petdexPets.map((pet) => [pet.slug, pet]));
  for (const slug of Object.values(petSelections)) cachePetdexPet(manifestPetsBySlug.get(slug));
  saveCachedPetdexPets();
  petdexPetsBySlug = new Map([...cachedPetdexPetsBySlug, ...manifestPetsBySlug]);
}

async function ensurePetdexPets(options = {}) {
  if (!window.codePet || !window.codePet.getPetdexPets) return;
  if (petdexLoading) return;
  if (!options.force && petdexLoaded) return;
  petdexLoading = true;
  petdexError = "";
  renderPetPickerModal();
  try {
    setPetdexPets(await window.codePet.getPetdexPets({ force: !!options.force }));
    petdexLoaded = true;
  } catch (err) {
    petdexError = err && err.message ? err.message : "Petdex unavailable";
  } finally {
    petdexLoading = false;
    renderPetPickerModal();
    renderSnapshot(latestSnapshot);
  }
}

function selectedPetSlug(viewOrId, options = {}) {
  const viewId = typeof viewOrId === "string" ? viewOrId : viewOrId && viewOrId.id;
  const slug = petSelections[viewId];
  if (slug && slug !== BUILTIN_PET.slug && !LEGACY_BUILTIN_PET_SLUGS.has(slug)) return slug;
  if (!options.skipAliases) {
    const aliases = petSelectionAliasesByViewId.get(viewId) || [];
    for (const alias of aliases) {
      const inherited = selectedPetSlug(alias, { skipAliases: true });
      if (inherited !== BUILTIN_PET.slug) return inherited;
    }
  }
  return BUILTIN_PET.slug;
}

function petForView(view) {
  const slug = selectedPetSlug(view.id);
  if (slug === BUILTIN_PET.slug) return BUILTIN_PET;
  return petdexPetsBySlug.get(slug) || cachedPetdexPetsBySlug.get(slug) || {
    slug,
    displayName: slug,
    kind: "loading",
    spritesheetUrl: "",
    loading: true,
  };
}

function setPetForView(viewId, slug, persona) {
  if (!slug || slug === BUILTIN_PET.slug || LEGACY_BUILTIN_PET_SLUGS.has(slug)) delete petSelections[viewId];
  else {
    petSelections[viewId] = slug;
    cachePetdexPet(persona || petdexPetsBySlug.get(slug));
    saveCachedPetdexPets();
  }
  savePetSelections();
}

function petdexFrameX(frame, cols = PETDEX_DEFAULT_COLS) {
  const safeCols = Math.max(1, Number(cols) || PETDEX_DEFAULT_COLS);
  const safeFrame = Math.max(0, Math.min(safeCols - 1, Number(frame) || 0));
  if (safeCols === 1) return "0%";
  return `${(safeFrame / (safeCols - 1)) * 100}%`;
}

function petdexRowForState(state, rows = PETDEX_DEFAULT_ROWS) {
  const safeRows = Math.max(1, Number(rows) || PETDEX_DEFAULT_ROWS);
  const row = PETDEX_ROW_BY_STATE[state] === undefined ? 0 : PETDEX_ROW_BY_STATE[state];
  const safeRow = Math.max(0, Math.min(safeRows - 1, row));
  if (safeRows === 1) return "0%";
  return `${(safeRow / (safeRows - 1)) * 100}%`;
}

function petdexFrameSequenceForState(state, cols) {
  const sequence = PETDEX_FRAME_SEQUENCE_BY_STATE[state] || PETDEX_DEFAULT_FRAME_SEQUENCE;
  const safeCols = Math.max(1, Number(cols) || PETDEX_DEFAULT_COLS);
  const frames = sequence.filter((frame) => frame >= 0 && frame < safeCols);
  return frames.length ? frames : [0];
}

function petdexFrameForState(state, cols, animated) {
  if (!animated) return 0;
  const frames = petdexFrameSequenceForState(state || "idle", cols);
  return frames[petdexFrame % frames.length];
}

function setPetdexSpriteGrid(element, state, meta, animated) {
  const cols = Math.max(1, meta && meta.cols ? meta.cols : PETDEX_DEFAULT_COLS);
  const rows = Math.max(1, meta && meta.rows ? meta.rows : PETDEX_DEFAULT_ROWS);
  const frame = petdexFrameForState(state || "idle", cols, animated);
  element.dataset.cols = String(cols);
  element.dataset.rows = String(rows);
  element.dataset.state = state || "idle";
  element.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  element.style.setProperty("--petdex-row-y", petdexRowForState(state || "idle", rows));
  element.style.setProperty("--petdex-frame-x", petdexFrameX(frame, cols));
}

function loadPetdexImageMeta(url, onReady) {
  if (!url) return;
  const cached = petdexImageMeta.get(url);
  if (cached) {
    onReady(cached);
    return;
  }

  const waiting = petdexImageLoading.get(url);
  if (waiting) {
    waiting.push(onReady);
    return;
  }

  petdexImageLoading.set(url, [onReady]);
  const image = new Image();
  image.onload = () => {
    const meta = {
      cols: Math.max(1, Math.round(image.naturalWidth / PETDEX_FRAME_WIDTH) || PETDEX_DEFAULT_COLS),
      rows: Math.max(1, Math.round(image.naturalHeight / PETDEX_FRAME_HEIGHT) || PETDEX_DEFAULT_ROWS),
    };
    petdexImageMeta.set(url, meta);
    const callbacks = petdexImageLoading.get(url) || [];
    petdexImageLoading.delete(url);
    for (const callback of callbacks) callback(meta);
  };
  image.onerror = () => {
    petdexImageLoading.delete(url);
  };
  image.src = url;
}

function preparePetdexSprite(element, url, state, animated) {
  element.dataset.state = state || "idle";
  element.style.backgroundImage = `url(${JSON.stringify(url)})`;
  setPetdexSpriteGrid(element, state, petdexImageMeta.get(url), animated);
  loadPetdexImageMeta(url, (meta) => {
    if (!element.isConnected) return;
    setPetdexSpriteGrid(element, element.dataset.state || state || "idle", meta, animated);
  });
}

function updatePetdexSpriteFrames() {
  for (const sprite of document.querySelectorAll(".petdex-pet")) {
    const cols = Math.max(1, Number(sprite.dataset.cols) || PETDEX_DEFAULT_COLS);
    const state = sprite.dataset.state || "idle";
    sprite.style.setProperty("--petdex-frame-x", petdexFrameX(petdexFrameForState(state, cols, true), cols));
  }
}

function selectablePetdexPets() {
  return petdexPets.filter((pet) => pet.slug !== BUILTIN_PET.slug);
}

function filteredPetdexPets(query, kind = petPickerKindFilter) {
  const needle = String(query || "").trim().toLowerCase();
  const kindFilter = String(kind || "").trim();
  const matches = selectablePetdexPets().filter((pet) => {
    if (kindFilter && (pet.kind || "") !== kindFilter) return false;
    if (!needle) return true;
    return `${pet.displayName} ${pet.slug} ${pet.kind || ""} ${pet.submittedBy || ""}`.toLowerCase().includes(needle);
  });
  return matches.slice(0, PETDEX_PICKER_LIMIT);
}

function petdexKindOptions() {
  return Array.from(new Set(selectablePetdexPets().map((pet) => pet.kind).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function syncPetKindFilter() {
  const previous = petPickerKind.value;
  const kindOptions = petdexKindOptions();
  petPickerKind.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = t("pet.allSources");
  petPickerKind.append(all);
  for (const kind of kindOptions) {
    const option = document.createElement("option");
    option.value = kind;
    option.textContent = kind;
    petPickerKind.append(option);
  }
  petPickerKind.value = kindOptions.includes(previous) ? previous : "";
  petPickerKindFilter = petPickerKind.value;
}

function isActiveState(state) {
  return state && state !== "idle" && state !== "sleeping";
}

function sessionLabel(session) {
  return session.agentName || session.agentId || "agent";
}

function sessionSubtitle(session) {
  return session.title || session.cwdBasename || session.sessionId || "";
}

function displayTitleForView(view) {
  const data = view.data || {};
  const title = data.title || "";
  if (title === "等待 hook 事件") return t("session.waitingHooks");
  return title || data.cwdBasename || view.subtitle || t("session.untitled");
}

function normalizeAgentId(value) {
  const raw = String(value || "").trim().toLowerCase();
  const id = IDE_ALIASES[raw] || raw;
  if (IDE_LOGOS[id]) return id;
  if (id.includes("codex")) return "codex";
  if (id.includes("cursor")) return "cursor";
  if (id.includes("windsurf") || id.includes("codeium")) return "windsurf";
  if (id.includes("claude")) return "claude-code";
  if (id.includes("gemini")) return "gemini-cli";
  if (id.includes("copilot")) return "copilot-cli";
  if (id.includes("codebuddy")) return "codebuddy";
  if (id.includes("kimi")) return "kimi-cli";
  if (id.includes("qwen")) return "qwen-code";
  if (id.includes("openclaw")) return "openclaw";
  if (id.includes("opencode")) return "opencode";
  if (id.includes("qoder")) return "qoder";
  if (id.includes("hermes")) return "hermes";
  if (id.includes("reasonix")) return "reasonix";
  return "agent";
}

function resolveAgentId(view, packet) {
  const fromData = view.data && view.data.agentId;
  if (fromData) return normalizeAgentId(fromData);
  const name = String(packet.a || view.label || "").toLowerCase();
  return normalizeAgentId(name);
}

function ideBadgeForView(view, packet) {
  const agentId = resolveAgentId(view, packet);
  return IDE_LOGOS[agentId] || IDE_LOGOS.agent;
}

function createIdeBadge(view, packet) {
  const ide = ideBadgeForView(view, packet);
  const badge = document.createElement("div");
  badge.className = "pet-ide-badge";
  badge.dataset.ide = resolveAgentId(view, packet);
  badge.title = ide.label;
  badge.setAttribute("aria-label", ide.label);
  badge.innerHTML = ide.logo;
  return badge;
}

function numericTimestamp(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function sessionActivityTime(session = {}) {
  return numericTimestamp(
    session.activityUpdatedAt,
    session.outputUpdatedAt,
    session.updatedAt
  );
}

function compareSessionForEditorView(a = {}, b = {}) {
  const priority = (VIEW_STATE_PRIORITY[b.state] || 0) - (VIEW_STATE_PRIORITY[a.state] || 0);
  const activity = sessionActivityTime(b) - sessionActivityTime(a);
  const updated = (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
  return priority || activity || updated;
}

function normalizedWorkspaceIdentity(session = {}) {
  const cwd = String(session.cwd || "").trim();
  if (cwd) return `cwd:${cwd}`;
  const cwdBasename = String(session.cwdBasename || "").trim();
  if (cwdBasename) return `cwd-name:${cwdBasename.toLowerCase()}`;
  return "app";
}

function editorGroupKey(session = {}) {
  const agentId = normalizeAgentId(session.agentId || session.agentName || session.agent || "");
  if (agentId === "codex") return "codex:app";
  if (session.sessionId === "app") return `${agentId}:app`;
  return `${agentId}:${normalizedWorkspaceIdentity(session)}`;
}

function maxSessionTimestamp(sessions, key) {
  return Math.max(0, ...sessions.map((session) => Number(session[key]) || 0));
}

function editorSessionFromGroup(key, sessions) {
  const byActivity = [...sessions].sort((a, b) => {
    const activity = sessionActivityTime(b) - sessionActivityTime(a);
    const updated = (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
    return activity || updated;
  });
  const latest = byActivity[0] || {};
  const latestTime = sessionActivityTime(latest);
  const relevant = isActiveState(latest.state)
    ? sessions.filter((session) => {
      const activity = sessionActivityTime(session);
      if (!latestTime || !activity) return session === latest;
      return latestTime - activity <= EDITOR_GROUP_RECENT_MS;
    })
    : [latest];
  const sorted = [...(relevant.length ? relevant : [latest])].sort(compareSessionForEditorView);
  const chosen = sorted[0] || latest || {};
  const withOutput = (relevant.length ? relevant : sessions)
    .filter((session) => String(session.output || "").trim())
    .sort((a, b) => (Number(b.outputUpdatedAt) || 0) - (Number(a.outputUpdatedAt) || 0))[0];
  const active = (relevant.length ? relevant : [chosen]).filter((session) => isActiveState(session.state));
  const workingCount = active.filter((session) =>
    ["working", "typing", "building", "juggling"].includes(session.state)
  ).length;

  let state = chosen.state || "idle";
  if (workingCount >= 3 && (VIEW_STATE_PRIORITY[state] || 0) <= VIEW_STATE_PRIORITY.building) state = "building";
  else if (workingCount >= 2 && (VIEW_STATE_PRIORITY[state] || 0) <= VIEW_STATE_PRIORITY.juggling) state = "juggling";

  return {
    ...chosen,
    key,
    viewId: `editor:${key}`,
    sessionId: key,
    state,
    output: withOutput ? withOutput.output : chosen.output || "",
    outputUpdatedAt: withOutput ? withOutput.outputUpdatedAt : chosen.outputUpdatedAt,
    activeCount: active.length,
    sessionCount: sessions.length,
    activityUpdatedAt: maxSessionTimestamp(sessions, "activityUpdatedAt") || sessionActivityTime(chosen),
    updatedAt: maxSessionTimestamp(sessions, "updatedAt") || Date.now(),
    selectionIds: sessions.map((session) => `session:${session.key}`).filter(Boolean),
  };
}

function editorSessionsFromSnapshotSessions(sessions = []) {
  const groups = new Map();
  for (const session of sessions) {
    const key = editorGroupKey(session);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }
  return Array.from(groups, ([key, groupSessions]) => editorSessionFromGroup(key, groupSessions));
}

function packetForSession(session) {
  const title = clampText(session.title || session.cwdBasename || "", 32);
  const activeCountValue = Number(session.activeCount);
  const packet = {
    v: 1,
    s: session.state || "idle",
    a: clampText(sessionLabel(session), 14) || "agent",
    e: clampText(session.event || "", 24),
    n: Number.isFinite(activeCountValue) ? activeCountValue : (isActiveState(session.state) ? 1 : 0),
    ts: Date.now(),
  };
  if (title) packet.m = title;
  return packet;
}

function sessionView(session) {
  return {
    id: session.viewId || `session:${session.key}`,
    selectionIds: session.selectionIds || [`session:${session.key}`],
    label: sessionLabel(session),
    subtitle: sessionSubtitle(session),
    data: {
      state: session.state || "idle",
      agent: sessionLabel(session),
      agentId: session.agentId || "agent",
      event: session.event || "",
      activeCount: Number.isFinite(Number(session.activeCount)) ? Number(session.activeCount) : (isActiveState(session.state) ? 1 : 0),
      sessionCount: Number.isFinite(Number(session.sessionCount)) ? Number(session.sessionCount) : 1,
      title: session.title || "",
      cwd: session.cwd || "",
      cwdBasename: session.cwdBasename || "",
      output: session.output || "",
      outputUpdatedAt: session.outputUpdatedAt,
      updatedAt: session.updatedAt,
      devicePacket: packetForSession(session),
    },
  };
}

function buildViews(snapshot) {
  const data = snapshot || latestSnapshot;
  const aggregate = data.aggregate || latestSnapshot.aggregate;
  const sessions = Array.isArray(data.sessions) ? data.sessions.filter((session) => session.state !== "sleeping") : [];
  const views = editorSessionsFromSnapshotSessions(sessions).map(sessionView);
  petSelectionAliasesByViewId = new Map(views.map((view) => [view.id, view.selectionIds || []]));
  if (views.length) return orderViewsStably(views);
  petViewOrder = [];
  petSelectionAliasesByViewId = new Map();
  return [{
    id: "empty",
    label: t("session.waitingEditors"),
    subtitle: "idle",
    data: aggregate,
  }];
}

function orderViewsStably(views) {
  const viewById = new Map(views.map((view) => [view.id, view]));
  petViewOrder = petViewOrder.filter((id) => viewById.has(id));
  for (const view of views) {
    if (!petViewOrder.includes(view.id)) petViewOrder.push(view.id);
  }
  return petViewOrder.map((id) => viewById.get(id)).filter(Boolean);
}

function createPetElement(state, persona = BUILTIN_PET) {
  if (persona && persona.loading) {
    const loading = document.createElement("div");
    loading.className = "petdex-pet petdex-pet-loading";
    loading.title = persona.displayName || t("pet.loadingCharacters");
    loading.setAttribute("aria-label", loading.title);
    return loading;
  }

  if (persona && persona.spritesheetUrl) {
    const sprite = document.createElement("div");
    sprite.className = "petdex-pet";
    sprite.title = persona.displayName || "Petdex";
    preparePetdexSprite(sprite, persona.spritesheetUrl, state || "idle", true);
    return sprite;
  }

  const pet = document.createElement("div");
  pet.className = "pet pet-mini";
  pet.dataset.state = state || "idle";
  pet.innerHTML = [
    '<div class="antenna"></div>',
    '<div class="face">',
    '<span class="eye left"></span>',
    '<span class="eye right"></span>',
    '<span class="mouth"></span>',
    '</div>',
    '<div class="body"></div>',
  ].join("");
  return pet;
}

function createPetThumb(persona) {
  const thumb = document.createElement("span");
  thumb.className = "pet-choice-thumb";
  if (!persona || !persona.spritesheetUrl) {
    thumb.classList.add("builtin-thumb");
    return thumb;
  }
  preparePetdexSprite(thumb, persona.spritesheetUrl, "idle", false);
  return thumb;
}

function createPetChoice(viewId, persona, selectedSlug) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pet-choice";
  button.dataset.active = persona.slug === selectedSlug ? "true" : "false";
  button.title = `${persona.displayName || persona.slug}${persona.submittedBy ? ` - ${persona.submittedBy}` : ""}`;
  button.append(createPetThumb(persona));

  const label = document.createElement("span");
  label.className = "pet-choice-label";
  const name = document.createElement("strong");
  name.textContent = persona.displayName || persona.slug;
  label.append(name);
  const meta = document.createElement("small");
  meta.textContent = persona.kind === "builtin" ? t("pet.builtin") : clampText(persona.submittedBy || persona.kind || "Petdex", 32);
  label.append(meta);
  button.append(label);

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setPetForView(viewId, persona.slug, persona);
    closePetPicker();
    renderSnapshot(latestSnapshot);
  });
  return button;
}

function renderPetPickerModal() {
  if (!activePetPickerId) {
    petPickerModal.hidden = true;
    return;
  }

  petPickerModal.hidden = false;
  petPickerSearch.value = petPickerQuery;
  syncPetKindFilter();
  petChoiceGrid.replaceChildren();
  petChoiceGrid.append(createPetChoice(activePetPickerId, BUILTIN_PET, selectedPetSlug(activePetPickerId)));

  petPickerRefreshBtn.disabled = petdexLoading;
  petPickerSource.href = PETDEX_SOURCE_REPO;
  petPickerSource.textContent = t("pet.source", { source: PETDEX_SOURCE_REPO.replace(/^https?:\/\//, "") });
  if (petdexLoading) {
    petPickerStatus.textContent = t("pet.loadingCharacters");
    return;
  }

  if (petdexError) {
    petPickerStatus.textContent = t("pet.unavailable", { message: petdexError });
  }

  const totalFiltered = selectablePetdexPets().filter((pet) => {
    const kindFilter = String(petPickerKindFilter || "").trim();
    const needle = String(petPickerQuery || "").trim().toLowerCase();
    if (kindFilter && (pet.kind || "") !== kindFilter) return false;
    if (!needle) return true;
    return `${pet.displayName} ${pet.slug} ${pet.kind || ""} ${pet.submittedBy || ""}`.toLowerCase().includes(needle);
  }).length;
  const pets = filteredPetdexPets(petPickerQuery, petPickerKindFilter);
  for (const pet of pets) {
    petChoiceGrid.append(createPetChoice(activePetPickerId, pet, selectedPetSlug(activePetPickerId)));
  }

  const capped = totalFiltered > pets.length;
  if (!petdexError) {
    petPickerStatus.textContent = capped
      ? t("pet.shownCapped", { count: pets.length, total: totalFiltered })
      : t("pet.shown", { count: pets.length });
  }

  if (!pets.length && !petdexError) {
    const empty = document.createElement("div");
    empty.className = "pet-picker-note";
    empty.textContent = t("pet.noMatches");
    petChoiceGrid.append(empty);
  }
}

function openPetPicker(viewId) {
  activePetPickerId = viewId;
  petPickerQuery = "";
  petPickerKindFilter = "";
  petPickerKind.value = "";
  ensurePetdexPets();
  renderPetPickerModal();
  setTimeout(() => petPickerSearch.focus(), 0);
}

function closePetPicker() {
  activePetPickerId = "";
  renderPetPickerModal();
}

function togglePetPicker(viewId) {
  if (activePetPickerId === viewId) closePetPicker();
  else openPetPicker(viewId);
  renderSnapshot(latestSnapshot);
}

function renderPetGrid(views) {
  petGrid.replaceChildren();
  for (const view of views) {
    const packet = compactPacket(view.data);
    const persona = petForView(view);
    const card = document.createElement("article");
    card.className = "pet-card";
    card.dataset.state = packet.s || "idle";
    const outputText = String((view.data && view.data.output) || "").trim();
    card.dataset.hasOutput = outputText ? "true" : "false";

    const ideBadge = createIdeBadge(view, packet);

    const sessionTitle = document.createElement("strong");
    sessionTitle.className = "pet-session-title";
    sessionTitle.textContent = displayTitleForView(view);
    sessionTitle.title = sessionTitle.textContent;

    const switchButton = document.createElement("button");
    switchButton.type = "button";
    switchButton.className = "pet-avatar-button";
    switchButton.title = t("pet.switchTitle", { name: persona.displayName || "Vibe Pet" });
    switchButton.setAttribute("aria-label", t("pet.switchAria", { agent: packet.a || view.label || "agent" }));
    switchButton.innerHTML = PET_AVATAR_SWITCH_ICON;
    switchButton.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePetPicker(view.id);
    });

    const head = document.createElement("div");
    head.className = "pet-card-head";
    head.append(ideBadge, sessionTitle, switchButton);

    const petBox = document.createElement("div");
    petBox.className = "pet-card-stage";
    petBox.append(createPetElement(packet.s, persona));

    const meta = document.createElement("div");
    meta.className = "pet-card-meta";

    const state = document.createElement("span");
    state.className = "pet-card-state";
    state.textContent = stateLabel(packet.s);
    state.title = packet.s || "idle";
    meta.append(state);

    if (outputText) {
      const output = document.createElement("p");
      output.className = "pet-card-output auto-scroll-output";
      setAutoScrollingOutput(output, outputText);
      meta.append(output);
    }

    card.append(head, petBox, meta);
    petGrid.append(card);
  }
}

function desktopPetPersona(persona) {
  const normalized = normalizePetdexPet(persona);
  if (normalized) return { ...normalized, loading: !!(persona && persona.loading) };
  return {
    slug: persona && typeof persona.slug === "string" ? persona.slug : BUILTIN_PET.slug,
    displayName: persona && typeof persona.displayName === "string" ? persona.displayName : BUILTIN_PET.displayName,
    kind: persona && typeof persona.kind === "string" ? persona.kind : BUILTIN_PET.kind,
    submittedBy: persona && typeof persona.submittedBy === "string" ? persona.submittedBy : "",
    spritesheetUrl: persona && typeof persona.spritesheetUrl === "string" ? persona.spritesheetUrl : "",
    loading: !!(persona && persona.loading),
  };
}

function desktopPetPayloadForView(view) {
  const packet = compactPacket(view.data);
  const persona = petForView(view);
  const state = packet.s || "idle";
  const agentId = resolveAgentId(view, packet);
  const normalizedPersona = desktopPetPersona(persona);
  return {
    id: String(view.id || agentId || "agent"),
    title: displayTitleForView(view),
    state,
    stateLabel: stateLabel(state),
    agentId,
    agentName: packet.a || view.label || "agent",
    persona: normalizedPersona,
    packet: packetWithPersona(packet, normalizedPersona),
  };
}

function compareHardwarePets(a = {}, b = {}) {
  const priority = (VIEW_STATE_PRIORITY[b.state] || 0) - (VIEW_STATE_PRIORITY[a.state] || 0);
  return priority || String(a.id || "").localeCompare(String(b.id || ""));
}

function syncDesktopPets(views) {
  if (!window.codePet || typeof window.codePet.syncDesktopPets !== "function") return;
  try {
    const pets = views.map(desktopPetPayloadForView);
    latestHardwarePets = [...pets].sort(compareHardwarePets);
    window.codePet.syncDesktopPets(pets);
  } catch {}
}

function renderOutput(aggregate) {
  const packet = compactPacket(aggregate || latestSnapshot.aggregate);
  stateName.textContent = stateLabel(packet.s);
  stateName.title = packet.s || "idle";
  agentName.textContent = packet.a || "agent";
  eventName.textContent = packet.e || "-";
  if (agentOutput) setAutoScrollingOutput(agentOutput, (aggregate && aggregate.output) || "-");
  activeCount.textContent = String(packet.n || 0);
  packetPreview.textContent = JSON.stringify(packet, null, 2);
}

function renderSnapshot(snapshot, options = {}) {
  latestSnapshot = snapshot || latestSnapshot;
  const views = buildViews(latestSnapshot);
  if (activePetPickerId && !views.some((view) => view.id === activePetPickerId)) activePetPickerId = "";
  renderPetGrid(views);
  syncDesktopPets(views);
  renderPetPickerModal();
  renderOutput(latestSnapshot.aggregate);
  if (options.send) {
    sendCurrent().catch((err) => setConnection("connection.sendFailed", false, { message: err.message }));
  }
}

function renderBridgeInfo(info = {}) {
  bridgePort.textContent = info.port ? `${info.host || "127.0.0.1"}:${info.port}` : "-";
}

function connectionErrorMessage(err) {
  const message = err && err.message ? err.message : String(err || "unknown error");
  if (/cancel/i.test(message)) return { message: "connection.notSelected" };
  if (/service|uuid|not found|not supported/i.test(message)) {
    return { message: "connection.serviceMissing" };
  }
  return { message: "connection.failed", values: { message } };
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

function hideDevicePicker() {
  selectingDevice = false;
  devicePicker.hidden = true;
  deviceList.replaceChildren();
}

function renderDevicePicker(devices = []) {
  lastBluetoothDevices = Array.isArray(devices) ? devices : [];
  if (!selectingDevice) {
    hideDevicePicker();
    return;
  }

  devicePicker.hidden = false;
  openStatusPanel();
  deviceList.replaceChildren();

  if (!devices.length) {
    const row = document.createElement("div");
    row.className = "device-empty";
    row.textContent = t("device.empty");
    deviceList.append(row);
    return;
  }

  for (const item of devices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "device-item";
    button.textContent = item.preferred
      ? t("device.recommended", { name: item.name || t("device.unnamed") })
      : item.name || t("device.unnamed");
    button.addEventListener("click", async () => {
      await window.codePet.chooseBluetoothDevice(item.id);
      hideDevicePicker();
    });
    deviceList.append(button);
  }
}

function setFirmwareStatus(key, values = {}, state = "") {
  firmwareStatus.textContent = t(key, values);
  firmwareStatus.dataset.state = state;
}

function appendFirmwareLog(text) {
  if (!text) return;
  firmwareLog.textContent += text;
  firmwareLog.scrollTop = firmwareLog.scrollHeight;
}

function renderFirmwareTargets() {
  const selected = firmwareTarget.value;
  firmwareTarget.replaceChildren();
  for (const target of firmwareTargets) {
    const option = document.createElement("option");
    option.value = target.id;
    option.textContent = target.name;
    option.disabled = target.available === false;
    firmwareTarget.append(option);
  }
  if (selected && firmwareTargets.some((target) => target.id === selected)) {
    firmwareTarget.value = selected;
  }
}

function renderFirmwarePorts() {
  const selected = firmwarePort.value;
  firmwarePort.replaceChildren();

  if (!firmwarePorts.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("firmware.noPorts");
    firmwarePort.append(option);
    firmwarePort.disabled = true;
    return;
  }

  firmwarePort.disabled = false;
  for (const item of firmwarePorts) {
    const option = document.createElement("option");
    option.value = item.path;
    option.textContent = item.label && item.label !== item.path ? `${item.path} · ${item.label}` : item.path;
    firmwarePort.append(option);
  }

  if (selected && firmwarePorts.some((item) => item.path === selected)) {
    firmwarePort.value = selected;
  }
}

function setFirmwareBusy(running) {
  firmwareFlashing = running;
  firmwareStartBtn.disabled = running || !firmwarePorts.length || !firmwareTargets.some((target) => target.available !== false);
  firmwareCancelBtn.disabled = !running;
  firmwareRefreshPortsBtn.disabled = running;
  firmwareTarget.disabled = running;
  firmwarePort.disabled = running || !firmwarePorts.length;
  flashBtn.disabled = running;
}

async function refreshFirmwareOptions() {
  setFirmwareStatus("firmware.loading");
  const [targets, ports] = await Promise.all([
    window.codePet.getFirmwareTargets(),
    window.codePet.listSerialPorts(),
  ]);
  firmwareTargets = Array.isArray(targets) ? targets : [];
  firmwarePorts = Array.isArray(ports) ? ports : [];
  renderFirmwareTargets();
  renderFirmwarePorts();
  setFirmwareBusy(firmwareFlashing);
  setFirmwareStatus("firmware.ready");
}

async function refreshFirmwarePorts() {
  firmwarePorts = await window.codePet.listSerialPorts();
  if (!Array.isArray(firmwarePorts)) firmwarePorts = [];
  renderFirmwarePorts();
  setFirmwareBusy(firmwareFlashing);
  setFirmwareStatus("firmware.ready");
}

async function openFirmwareModal() {
  firmwareModalOpen = true;
  firmwareModal.hidden = false;
  firmwareLog.textContent = "";
  try {
    await refreshFirmwareOptions();
  } catch (err) {
    setFirmwareStatus("firmware.failed", { message: err.message || String(err) }, "error");
  }
}

function closeFirmwareModal() {
  if (firmwareFlashing) return;
  firmwareModalOpen = false;
  firmwareModal.hidden = true;
}

async function startFirmwareFlash() {
  const targetId = firmwareTarget.value;
  const targetName = firmwareTarget.options[firmwareTarget.selectedIndex]
    ? firmwareTarget.options[firmwareTarget.selectedIndex].textContent
    : targetId;
  const port = firmwarePort.value;
  if (!port) {
    setFirmwareStatus("firmware.portRequired", {}, "error");
    return;
  }

  firmwareLog.textContent = "";
  setFirmwareBusy(true);
  setFirmwareStatus("firmware.flashing", { target: targetName, port }, "running");
  try {
    await window.codePet.flashFirmware({ targetId, port });
  } catch (err) {
    setFirmwareBusy(false);
    const message = err && err.message ? err.message : String(err || "");
    const key = /PlatformIO|pio/i.test(message) ? "firmware.platformioMissing" : "firmware.failed";
    setFirmwareStatus(key, { message }, "error");
    appendFirmwareLog(`${message}\n`);
  }
}

async function cancelFirmwareFlash() {
  await window.codePet.cancelFirmwareFlash();
  setFirmwareStatus("firmware.cancelled", {}, "error");
}

function handleFirmwareFlashEvent(payload = {}) {
  if (payload.type === "start") {
    setFirmwareBusy(true);
    setFirmwareStatus("firmware.flashing", {
      target: payload.targetName || payload.targetId || "",
      port: payload.port || "",
    }, "running");
    appendFirmwareLog(`$ ${payload.command || ""}\n`);
    return;
  }
  if (payload.type === "log") {
    appendFirmwareLog(payload.text || "");
    return;
  }
  if (payload.type === "done") {
    setFirmwareBusy(false);
    setFirmwareStatus("firmware.done", {}, "done");
    if (payload.message) appendFirmwareLog(`\n${payload.message}\n`);
    return;
  }
  if (payload.type === "cancelled") {
    setFirmwareBusy(false);
    setFirmwareStatus("firmware.cancelled", {}, "error");
    if (payload.message) appendFirmwareLog(`\n${payload.message}\n`);
    return;
  }
  if (payload.type === "error") {
    setFirmwareBusy(false);
    const message = payload.message || "unknown error";
    setFirmwareStatus("firmware.failed", { message }, "error");
    appendFirmwareLog(`\n${message}\n`);
  }
}

async function sendCurrent() {
  if (!stateCharacteristic) return;
  const hardwarePet = latestHardwarePets[0];
  const packet = hardwarePet && hardwarePet.packet ? { ...hardwarePet.packet } : compactPacket(latestSnapshot.aggregate);
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
    setConnection("connection.noBluetoothDesktop", false);
    return;
  }

  stateCharacteristic = null;
  selectingDevice = true;
  renderDevicePicker([]);
  setConnection("connection.scanning", false);

  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [SERVICE_UUID],
  });

  hideDevicePicker();
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

connectBtn.addEventListener("click", () => {
  connectDevice().catch((err) => {
    hideDevicePicker();
    setConnection(connectionErrorMessage(err), false);
  });
});

flashBtn.addEventListener("click", () => {
  openFirmwareModal();
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
  await window.codePet.testState(testState.value);
});

cancelDeviceBtn.addEventListener("click", async () => {
  await window.codePet.chooseBluetoothDevice("");
  hideDevicePicker();
  setConnection("connection.cancelled", false);
});

for (const option of themeOptions) {
  option.addEventListener("click", () => applyTheme(option.dataset.themeOption));
}

languageSelect.addEventListener("change", () => {
  if (window.VibePetI18n) window.VibePetI18n.setLocale(languageSelect.value);
});

window.addEventListener("code-pet:language-change", () => {
  renderConnection();
  renderDevicePicker(lastBluetoothDevices);
  if (firmwareModalOpen) {
    renderFirmwareTargets();
    renderFirmwarePorts();
  }
  renderSnapshot(latestSnapshot);
});

petPickerSearch.addEventListener("input", () => {
  petPickerQuery = petPickerSearch.value;
  renderPetPickerModal();
});

petPickerKind.addEventListener("change", () => {
  petPickerKindFilter = petPickerKind.value;
  renderPetPickerModal();
});

petPickerRefreshBtn.addEventListener("click", () => {
  ensurePetdexPets({ force: true });
});

petPickerCloseBtn.addEventListener("click", closePetPicker);

petPickerModal.addEventListener("click", (event) => {
  if (event.target === petPickerModal) closePetPicker();
});

firmwareRefreshPortsBtn.addEventListener("click", () => {
  refreshFirmwarePorts().catch((err) => {
    setFirmwareStatus("firmware.failed", { message: err.message || String(err) }, "error");
  });
});

firmwareStartBtn.addEventListener("click", () => {
  startFirmwareFlash();
});

firmwareCancelBtn.addEventListener("click", () => {
  cancelFirmwareFlash().catch((err) => {
    setFirmwareStatus("firmware.failed", { message: err.message || String(err) }, "error");
  });
});

firmwareCloseBtn.addEventListener("click", closeFirmwareModal);

firmwareModal.addEventListener("click", (event) => {
  if (event.target === firmwareModal) closeFirmwareModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activePetPickerId) closePetPicker();
  else if (event.key === "Escape" && firmwareModalOpen) closeFirmwareModal();
});

window.codePet.onState(async (payload) => {
  if (!payload || !payload.aggregate) return;
  renderSnapshot({ aggregate: payload.aggregate, sessions: payload.sessions || [] });
  try {
    await sendCurrent();
  } catch (err) {
    setConnection("connection.sendFailed", false, { message: err.message });
  }
});

window.codePet.onBluetoothDevices((devices) => {
  renderDevicePicker(Array.isArray(devices) ? devices : []);
});

window.codePet.onFirmwareFlash(handleFirmwareFlashEvent);

window.codePet.onBridgeInfo(renderBridgeInfo);

setInterval(() => {
  petdexFrame = (petdexFrame + 1) % 10000;
  updatePetdexSpriteFrames();
}, PETDEX_FRAME_MS);

applyTheme(storedTheme());
refreshGitHubStars();
ensurePetdexPets();
window.codePet.getSnapshot()
  .then((snapshot) => renderSnapshot(snapshot))
  .catch(() => renderSnapshot(latestSnapshot));
window.codePet.getBridgeInfo()
  .then(renderBridgeInfo)
  .catch(() => renderBridgeInfo());
