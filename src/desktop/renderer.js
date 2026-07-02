"use strict";

const SERVICE_UUID = "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001";
const STATE_CHAR_UUID = "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002";
const BLUETOOTH_SCAN_NAME_PREFIX = "VibePet";
const BLUETOOTH_DEVICE_STORAGE_KEY = "code-pet-bluetooth-device";
const BLUETOOTH_AUTO_CONNECT_RETRY_DELAYS = [600, 1500, 3000, 5000, 8000, 13000, 21000];
const BLUETOOTH_AUTO_CONNECT_SCAN_TIMEOUT_MS = 6500;
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
const PETDEX_REQUIRED_COLS = 9;
const PETDEX_REQUIRED_ROWS = 8;
const PETDEX_REQUIRED_WIDTH = PETDEX_FRAME_WIDTH * PETDEX_REQUIRED_COLS;
const PETDEX_REQUIRED_HEIGHT = PETDEX_FRAME_HEIGHT * PETDEX_REQUIRED_ROWS;
const PETDEX_FRAME_MS = 150;
const PETDEX_PICKER_PAGE_SIZE = 100;
const PETDEX_SOURCE_REPO = "https://github.com/crafter-station/petdex";
const HARDWARE_PERSONA_FRAME_WIDTH = 144;
const HARDWARE_PERSONA_FRAME_HEIGHT = 156;
const HARDWARE_PERSONA_FRAME_BYTES = HARDWARE_PERSONA_FRAME_WIDTH * HARDWARE_PERSONA_FRAME_HEIGHT * 2;
const HARDWARE_PERSONA_MAX_FRAMES = 2;
const HARDWARE_PERSONA_CHUNK_CHARS = 120;
const HARDWARE_PERSONA_CHUNK_DELAY_MS = 8;
const HARDWARE_OUTPUT_MAX_CHARS = 120;
const BLUETOOTH_JSON_MAX_BYTES = 480;
const BLUETOOTH_TITLE_MAX_BYTES = 48;
const BLUETOOTH_DIRECT_WRITE_MAX_BYTES = 20;
const BLUETOOTH_FRAGMENT_DATA_BYTES = 18;
const TENCENT_AEGIS_LOCAL_SDK_URL = "../../node_modules/aegis-web-sdk/lib/aegis.min.js";
const TENCENT_AEGIS_SDK_URL = "https://tam.cdn-go.cn/aegis-sdk/latest/aegis.min.js";
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
const HARDWARE_PERSONA_SEQUENCE_INDEXES_BY_STATE = {
  working: [0, 2],
  typing: [0, 2],
  building: [0, 2],
  juggling: [0, 2],
};
const HARDWARE_PERSONA_STATES = ["idle", "notification", "working", "error", "thinking", "attention"];
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
  '<circle class="pet-avatar-icon-head" cx="12" cy="8.2" r="3.8"/>',
  '<path class="pet-avatar-icon-body" d="M4.8 20.2c.9-4.3 3.6-6.5 7.2-6.5s6.3 2.2 7.2 6.5"/>',
  '<path class="pet-avatar-icon-switch" d="M18.5 5.5c1.2 1 1.9 2.5 1.9 4.1M20.4 5.6v3.1h-3.1"/>',
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
  "codeium-windsurf": "windsurf",
  "windsurf-editor": "windsurf",
  "devin-desktop": "windsurf",
  devin: "windsurf",
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

const IDE_LOGOS = {
  codex: {
    label: "Codex",
    logo: ideLogoSvg("ide-logo-codex", [
      '<path d="M19.503 0H4.496A4.496 4.496 0 0 0 0 4.496v15.007A4.496 4.496 0 0 0 4.496 24h15.007A4.496 4.496 0 0 0 24 19.503V4.496A4.496 4.496 0 0 0 19.503 0z" fill="#fff"/>',
      '<path d="M9.064 3.344a4.578 4.578 0 0 1 2.285-.312c1 .115 1.891.54 2.673 1.275a.09.09 0 0 0 .08.021 4.55 4.55 0 0 1 3.046.275l.047.022.116.057a4.581 4.581 0 0 1 2.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 0 1-.134 1.223.123.123 0 0 0 .03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 0 1-2.201 1.388.123.123 0 0 0-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 0 0-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 0 1-1.945-.466 4.544 4.544 0 0 1-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 0 1-.37-.961 4.582 4.582 0 0 1-.014-2.298.124.124 0 0 0 .006-.056.085.085 0 0 0-.027-.048 4.467 4.467 0 0 1-1.034-1.651 3.896 3.896 0 0 1-.251-1.192 5.189 5.189 0 0 1 .141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 0 0 .065-.066 4.51 4.51 0 0 1 .829-1.615 4.535 4.535 0 0 1 1.837-1.388zm3.482 10.565a.637.637 0 0 0 0 1.272h3.636a.637.637 0 1 0 0-1.272h-3.636zM8.462 9.23a.637.637 0 0 0-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 1 0 1.095.649l1.454-2.455a.636.636 0 0 0 .005-.64L8.462 9.23z" fill="url(#codexLogoMark)"/>',
      '<defs><linearGradient id="codexLogoMark" x1="12" x2="12" y1="3" y2="21" gradientUnits="userSpaceOnUse"><stop stop-color="#B1A7FF"/><stop offset=".5" stop-color="#7A9DFF"/><stop offset="1" stop-color="#3941FF"/></linearGradient></defs>',
    ].join(""), "0 0 24 24"),
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
      '<path d="M23.2312 25.1611L23.2312 25.1651C24.079 24.6758 25.0422 24.4173 26.0173 24.4173L26.089 24.4173L26.1904 24.4193C26.2581 24.4212 26.3238 24.4232 26.3914 24.4292L26.4412 24.4332C27.2452 24.4928 28.0094 24.7196 28.7218 25.1114C28.7934 25.1512 28.8631 25.1909 28.9328 25.2327C28.9865 25.2665 29.0402 25.3003 29.0959 25.3361L29.1477 25.3699C29.5875 25.6663 29.9835 26.0263 30.3338 26.4479C30.3815 26.5056 30.4273 26.5633 30.483 26.6369L30.5109 26.6727C30.5467 26.7204 30.5825 26.7701 30.6163 26.8198L30.678 26.9093C30.7059 26.9511 30.7318 26.9929 30.7576 27.0346C30.7795 27.0704 30.8014 27.1062 30.8233 27.142L30.8611 27.2057C31.3507 28.051 31.6094 29.0176 31.6094 29.9961L31.6074 29.9961C31.6074 30.9766 31.3487 31.9412 30.8591 32.7865L30.7736 32.9317C30.7377 32.9894 30.7019 33.045 30.6661 33.1007L30.6382 33.1425C30.1845 33.8088 29.6074 34.3557 28.9089 34.7774C28.8392 34.8191 28.7696 34.8589 28.6979 34.8987C28.6422 34.9305 28.5845 34.9584 28.5268 34.9882L28.4711 35.016C27.9934 35.2487 27.484 35.4118 26.9447 35.5033C26.871 35.5152 26.7974 35.5252 26.7238 35.5351L26.6621 35.5431C26.6024 35.5491 26.5427 35.555 26.481 35.561C26.4452 35.563 26.4094 35.567 26.3735 35.5689C26.3238 35.5729 26.276 35.5749 26.2263 35.5749C26.1845 35.5749 26.1427 35.5769 26.1009 35.5789L26.0253 35.5789L26.0213 35.5789C25.0442 35.5789 24.081 35.3203 23.2332 34.8311L18.067 31.8517L7.73063 37.8263L7.72664 49.7497L18.063 55.7144L28.4034 49.7477L28.4034 43.783C28.4034 42.8025 28.6621 41.8379 29.1517 40.9926L29.2372 40.8474C29.2731 40.7898 29.3089 40.7341 29.3447 40.6784L29.3726 40.6366C29.8263 39.9703 30.4034 39.4234 31.1019 39.0018C31.1716 38.96 31.2412 38.9202 31.3129 38.8804C31.3686 38.8506 31.4243 38.8208 31.484 38.7909L31.5397 38.7631C32.0173 38.5304 32.5268 38.3673 33.0661 38.2758C33.1397 38.2639 33.2134 38.2539 33.287 38.244L33.3487 38.236C33.4084 38.2301 33.4681 38.2241 33.5318 38.2181L33.6373 38.2102C33.687 38.2062 33.7348 38.2042 33.7845 38.2042C33.8263 38.2042 33.8681 38.2022 33.9099 38.2002L33.9855 38.2002L33.9895 38.2002C34.9666 38.2002 35.9298 38.4588 36.7776 38.9481L41.9458 41.9274L52.2861 35.9608L52.2822 24.0334L41.9478 18.0668L36.7796 21.0541L36.7756 21.0461C35.9258 21.5354 34.9646 21.788 33.9815 21.7939L33.9159 21.7939L33.8124 21.7919C33.7447 21.79 33.6791 21.788 33.6114 21.782L33.5616 21.778C32.7577 21.7184 31.9935 21.4916 31.281 21.0998C31.2094 21.06 31.1397 21.0203 31.0701 20.9785C31.0144 20.9447 30.9606 20.9089 30.9069 20.8751L30.8552 20.8413C30.4154 20.5449 30.0193 20.1849 29.6691 19.7633C29.6213 19.7056 29.5755 19.6479 29.5198 19.5743L29.492 19.5385C29.4561 19.4908 29.4203 19.4411 29.3865 19.3914L29.3248 19.3019C29.2969 19.2601 29.2711 19.2183 29.2452 19.1766C29.2233 19.1408 29.1994 19.105 29.1775 19.0672L29.1417 19.0055C28.6522 18.1602 28.3934 17.1936 28.3934 16.2151L28.3915 16.2151L28.3915 10.2524L18.1048 4.31363L18.0551 4.28578L7.71869 10.2604L7.71471 22.1838L18.0511 28.1484L23.2213 25.1651L23.2312 25.1611Z" fill="currentColor"/>',
    ].join(""), "0 0 60 60"),
  },
  "claude-code": {
    label: "Claude Code",
    logo: [
      '<span class="ide-logo ide-logo-claude">',
      '<img class="ide-logo-image" src="assets/claude-logo.png" alt="">',
      "</span>",
    ].join(""),
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

const petGrid = document.getElementById("petGrid");
const githubStarsCount = document.getElementById("githubStarsCount");
const connectBtn = document.getElementById("connectBtn");
const connectBtnLabel = document.getElementById("connectBtnLabel");
const flashBtn = document.getElementById("flashBtn");
const themeOptions = Array.from(document.querySelectorAll("[data-theme-option]"));
const languageSelect = document.getElementById("languageSelect");
const devicePickerModal = document.getElementById("devicePickerModal");
const devicePicker = document.getElementById("devicePicker");
const deviceList = document.getElementById("deviceList");
const cancelDeviceBtn = document.getElementById("cancelDeviceBtn");
const disconnectConfirmModal = document.getElementById("disconnectConfirmModal");
const disconnectConfirmMessage = document.getElementById("disconnectConfirmMessage");
const disconnectConfirmDevice = document.getElementById("disconnectConfirmDevice");
const disconnectConfirmCancelBtn = document.getElementById("disconnectConfirmCancelBtn");
const disconnectConfirmConfirmBtn = document.getElementById("disconnectConfirmConfirmBtn");
const petPickerModal = document.getElementById("petPickerModal");
const petPickerSearch = document.getElementById("petPickerSearch");
const petPickerKind = document.getElementById("petPickerKind");
const petPickerRefreshBtn = document.getElementById("petPickerRefreshBtn");
const petPickerCloseBtn = document.getElementById("petPickerCloseBtn");
const petPickerStatus = document.getElementById("petPickerStatus");
const petPickerPagination = document.getElementById("petPickerPagination");
const petPickerPrevPageBtn = document.getElementById("petPickerPrevPageBtn");
const petPickerPageInfo = document.getElementById("petPickerPageInfo");
const petPickerPageInput = document.getElementById("petPickerPageInput");
const petPickerPageMeta = document.getElementById("petPickerPageMeta");
const petPickerNextPageBtn = document.getElementById("petPickerNextPageBtn");
const petChoiceGrid = document.getElementById("petChoiceGrid");
const petPickerTabs = Array.from(document.querySelectorAll("[data-pet-picker-tab]"));
const petPickerPanels = Array.from(document.querySelectorAll("[data-pet-picker-panel]"));
const localPetName = document.getElementById("localPetName");
const localPetSlug = document.getElementById("localPetSlug");
const localPetSpritesheet = document.getElementById("localPetSpritesheet");
const localPetFileMeta = document.getElementById("localPetFileMeta");
const localPetApplyBtn = document.getElementById("localPetApplyBtn");
const localPetStatus = document.getElementById("localPetStatus");
const aiPetFrontView = document.getElementById("aiPetFrontView");
const aiPetLeftView = document.getElementById("aiPetLeftView");
const aiPetRightView = document.getElementById("aiPetRightView");
const aiPetGenerateBtn = document.getElementById("aiPetGenerateBtn");
const aiPetStatus = document.getElementById("aiPetStatus");
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
let deviceSelectionCancelled = false;
let autoConnectInFlight = false;
let autoConnectTimer = null;
let autoConnectAttempts = 0;
let autoConnectPaused = false;
let autoSelectingBluetoothDevice = false;
let autoSelectBluetoothDeviceTarget = null;
let autoSelectBluetoothDeviceTimer = null;
let autoSelectBluetoothDeviceChoiceSent = false;
let manualDisconnectInFlight = false;
let pendingDisconnectConfirm = null;
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
let activePetPickerTab = "petdex";
let petPickerQuery = "";
let petPickerKindFilter = "";
let petPickerPage = 0;
let localPetImageInfo = null;
let localPetSlugTouched = false;
let petViewOrder = [];
let petSelectionAliasesByViewId = new Map();
let lastBluetoothDevices = [];
let bluetoothWriteQueue = Promise.resolve();
let bluetoothFragmentSequence = 0;
let hardwarePersonaImageCache = new Map();
let lastHardwarePersonaImageKey = "";
let lastHardwarePersonaLoadingSignature = "";
let latestHardwarePersonaRequestSignature = "";
let hardwarePersonaTransferRevision = 0;
let hardwareSendSequence = 0;
let hardwarePersonaCacheDeviceKey = "";
let activeHardwarePersonaTransferId = "";
let activeHardwarePersonaTransferSignature = "";
let cancelledHardwarePersonaTransferIds = new Set();
let pendingHardwareStatusPacket = null;
let firmwareTargets = [];
let firmwarePorts = [];
let firmwareModalOpen = false;
let firmwareFlashing = false;
let latestHardwarePets = [];
let connectionMessage = { message: "connection.disconnected", values: {}, connected: false };
let connectedBluetoothDeviceName = "";
let trackedActivePetKeys = new Set();
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
let analyticsClient = null;
let analyticsConfig = null;
let analyticsQueue = [];
let analyticsReady = false;
let aegisSdkPromise = null;

function bluetoothDeviceCacheKey(nextDevice) {
  if (!nextDevice) return "";
  const id = typeof nextDevice.id === "string" ? nextDevice.id : "";
  const name = typeof nextDevice.name === "string" ? nextDevice.name : "";
  return id || name ? `${id}|${name}` : "";
}

function bluetoothDeviceName() {
  return connectedBluetoothDeviceName || (device && typeof device.name === "string" ? device.name : "");
}

function isWioBluetoothDevice() {
  return /^(VibePet|CodePet)-Wio/.test(bluetoothDeviceName());
}

function hardwarePersonaSyncMode() {
  return isWioBluetoothDevice() ? "current-state" : "all-states";
}

function resetHardwarePersonaTransferState(options = {}) {
  if (options.forgetCache) {
    lastHardwarePersonaImageKey = "";
    lastHardwarePersonaLoadingSignature = "";
    latestHardwarePersonaRequestSignature = "";
    hardwarePersonaCacheDeviceKey = "";
  }
  activeHardwarePersonaTransferId = "";
  activeHardwarePersonaTransferSignature = "";
  cancelledHardwarePersonaTransferIds.clear();
  hardwarePersonaTransferRevision++;
  hardwareSendSequence++;
}

function sanitizeAnalyticsEventName(eventName) {
  if (typeof eventName !== "string") return "";
  return eventName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
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

function safeAnalyticsText(value, max = 160) {
  if (value === undefined || value === null) return "";
  return String(value).slice(0, max);
}

function compactAnalyticsJson(value, max = 1024) {
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return "";
  }
}

function analyticsDebugLog(...args) {
  if (!analyticsConfig || !analyticsConfig.debug) return;
  console.info("[analytics]", ...args);
}

function reportAnalyticsEvent(eventName, props = {}) {
  const name = sanitizeAnalyticsEventName(eventName);
  if (!name) return;
  const payload = {
    ...(analyticsConfig && analyticsConfig.commonProps ? analyticsConfig.commonProps : {}),
    ...sanitizeAnalyticsProps(props),
  };
  if (!analyticsReady || !analyticsClient || typeof analyticsClient.reportEvent !== "function") {
    analyticsDebugLog("queue", name, payload);
    analyticsQueue.push({ eventName: name, props: payload });
    if (analyticsQueue.length > 100) analyticsQueue = analyticsQueue.slice(-100);
    return;
  }
  const eventPayload = {
    name,
    ext1: safeAnalyticsText(payload.pet_slug || payload.platform || ""),
    ext2: safeAnalyticsText(payload.pet_source || payload.pet_kind || payload.appVersion || ""),
    ext3: compactAnalyticsJson(payload),
  };
  analyticsDebugLog("reportEvent", eventPayload);
  analyticsClient.reportEvent(eventPayload);
}

function flushAnalyticsQueue() {
  const events = analyticsQueue;
  analyticsQueue = [];
  for (const event of events) reportAnalyticsEvent(event.eventName, event.props);
}

function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => resolve(false), 5000);
    script.src = src;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      resolve(typeof window.Aegis === "function");
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

async function loadTencentAegisSdk() {
  if (typeof window.Aegis === "function") return true;
  if (aegisSdkPromise) return aegisSdkPromise;
  aegisSdkPromise = (async () => {
    if (await loadScript(TENCENT_AEGIS_LOCAL_SDK_URL)) {
      analyticsDebugLog("sdk-loaded", TENCENT_AEGIS_LOCAL_SDK_URL);
      return true;
    }
    analyticsDebugLog("sdk-local-load-failed", TENCENT_AEGIS_LOCAL_SDK_URL);
    if (await loadScript(TENCENT_AEGIS_SDK_URL)) {
      analyticsDebugLog("sdk-loaded", TENCENT_AEGIS_SDK_URL);
      return true;
    }
    return false;
  })();
  return aegisSdkPromise;
}

async function initializeAnalytics() {
  try {
    if (!window.codePet || typeof window.codePet.getAnalyticsConfig !== "function") return;
    const config = await window.codePet.getAnalyticsConfig();
    analyticsConfig = config && typeof config === "object" ? config : null;
    analyticsDebugLog("config", analyticsConfig);
    if (!analyticsConfig || !analyticsConfig.enabled || !analyticsConfig.id) return;
    if (!(await loadTencentAegisSdk())) {
      analyticsDebugLog("sdk-load-failed", TENCENT_AEGIS_SDK_URL);
      return;
    }
    const aegisOptions = {
      id: analyticsConfig.id,
      uin: analyticsConfig.installId || "",
      hostUrl: analyticsConfig.hostUrl || "https://rumt-zh.com",
      pageUrl: "app://vibe-pet/desktop",
      version: analyticsConfig.commonProps && analyticsConfig.commonProps.appVersion,
      reportApiSpeed: false,
      reportAssetSpeed: false,
      spa: false,
    };
    if (analyticsConfig.debug) {
      aegisOptions.beforeRequest = (data) => {
        analyticsDebugLog("beforeRequest", data);
        return data;
      };
      aegisOptions.afterRequest = (data) => {
        analyticsDebugLog("afterRequest", data);
      };
    }
    analyticsDebugLog("init", {
      id: aegisOptions.id,
      hostUrl: aegisOptions.hostUrl,
      hostSource: analyticsConfig.hostSource,
      hostRegion: analyticsConfig.hostRegion,
      pageUrl: aegisOptions.pageUrl,
      version: aegisOptions.version,
    });
    analyticsClient = new window.Aegis(aegisOptions);
    analyticsReady = true;
    const initialEvents = Array.isArray(analyticsConfig.initialEvents) ? analyticsConfig.initialEvents : [];
    for (const event of initialEvents) {
      reportAnalyticsEvent(event.eventName, {
        ...(event.props || {}),
        session_id: event.sessionId || analyticsConfig.sessionId || "",
        event_timestamp: event.timestamp || "",
      });
    }
    flushAnalyticsQueue();
    if (analyticsConfig.debug) {
      reportAnalyticsEvent("analytics_probe", { probe: true });
    }
  } catch (err) {
    analyticsDebugLog("init-error", err && err.message ? err.message : String(err));
  }
}

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

function petdexStateForHardware(state) {
  const raw = String(state || "idle").trim();
  if (raw === "permission" || raw === "codex-permission") return "notification";
  return PETDEX_ROW_BY_STATE[raw] === undefined ? "idle" : raw;
}

function hardwarePersonaVisualState(state) {
  const normalized = petdexStateForHardware(state);
  if (normalized === "sleeping") return "idle";
  if (normalized === "typing" || normalized === "building" || normalized === "juggling") return "working";
  if (normalized === "sweeping") return "thinking";
  return normalized;
}

function hardwarePersonaSyncScope(packet) {
  if (hardwarePersonaSyncMode() !== "current-state") return "all-states-v1";
  return `state:${hardwarePersonaVisualState(packet && packet.s)}`;
}

function hardwarePersonaTransferStates(packet) {
  if (hardwarePersonaSyncMode() !== "current-state") return HARDWARE_PERSONA_STATES;
  return [hardwarePersonaVisualState(packet && packet.s)];
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

function activeBluetoothConnectionMessage() {
  return connectedBluetoothDeviceName || (device && device.name) || "connection.connected";
}

function setBluetoothSendFailed(err) {
  const message = err && err.message ? err.message : String(err || "");
  if (hasActiveBluetoothConnection()) {
    setConnection("connection.sendFailed", true, { message });
    return;
  }
  setConnection("connection.sendFailed", false, { message });
}

function currentBluetoothDeviceName() {
  return (device && device.name) || t("device.unnamed");
}

function renderDisconnectConfirm() {
  if (!disconnectConfirmModal || disconnectConfirmModal.hidden) return;
  const name = currentBluetoothDeviceName();
  if (disconnectConfirmMessage) {
    disconnectConfirmMessage.textContent = t("device.disconnectMessage", { name });
  }
  if (disconnectConfirmDevice) disconnectConfirmDevice.textContent = name;
}

function closeDisconnectConfirm(result = false) {
  if (disconnectConfirmModal) disconnectConfirmModal.hidden = true;
  const pending = pendingDisconnectConfirm;
  pendingDisconnectConfirm = null;
  if (pending) pending(result);
}

function confirmDisconnectDevice() {
  if (!disconnectConfirmModal) return Promise.resolve(false);
  if (pendingDisconnectConfirm) closeDisconnectConfirm(false);
  renderDisconnectConfirm();
  disconnectConfirmModal.hidden = false;
  renderDisconnectConfirm();
  if (disconnectConfirmCancelBtn) disconnectConfirmCancelBtn.focus();
  return new Promise((resolve) => {
    pendingDisconnectConfirm = resolve;
  });
}

function compactPacket(aggregate) {
  const packet = aggregate && aggregate.devicePacket ? { ...aggregate.devicePacket } : {
    v: 1,
    s: aggregate.state || "idle",
    a: aggregate.agent || "agent",
    e: aggregate.event || "",
    n: aggregate.activeCount || 0,
    ts: Date.now(),
  };
  packet.sl = stateLabel(packet.s);
  packet.l = window.VibePetI18n && typeof window.VibePetI18n.getLocale === "function" ? window.VibePetI18n.getLocale() : "en";
  const output = clampText((aggregate && aggregate.output) || "", HARDWARE_OUTPUT_MAX_CHARS);
  if (output) packet.o = output;
  else delete packet.o;
  return packet;
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

function hardwareSpriteUrl(url) {
  if (typeof url !== "string") return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return "";
  return url;
}

function packetWithPersona(packet, persona) {
  const next = { ...(packet || {}) };
  const compact = compactPersona(persona);
  next.p = compact.slug;
  next.d = compact.displayName;
  if (compact.kind) next.k = compact.kind;
  const spriteUrl = hardwareSpriteUrl(compact.spritesheetUrl);
  if (spriteUrl) next.u = spriteUrl;
  else delete next.u;
  next.th = storedTheme();
  next.sl = stateLabel(next.s);
  next.l = window.VibePetI18n && typeof window.VibePetI18n.getLocale === "function" ? window.VibePetI18n.getLocale() : "en";
  return next;
}

function packetWithTheme(packet) {
  const next = { ...(packet || {}), th: storedTheme() };
  next.sl = stateLabel(next.s);
  next.l = window.VibePetI18n && typeof window.VibePetI18n.getLocale === "function" ? window.VibePetI18n.getLocale() : "en";
  return next;
}

function clampText(value, max) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 3) + "..." : clean;
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

function compactBluetoothImagePayload(payload) {
  const next = { ...(payload || {}) };
  if (next.im !== "s") return next;
  delete next.u;
  if (next.p) next.p = clampUtf8Text(next.p, 48);
  if (next.d) next.d = clampUtf8Text(next.d, 48);
  if (next.k) next.k = clampUtf8Text(next.k, 24);
  return next;
}

function bluetoothPayload(payload) {
  if (payload && payload.im) return compactBluetoothImagePayload(payload);
  return compactBluetoothStatePayload(payload);
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

function trackEvent(eventName, props = {}) {
  reportAnalyticsEvent(eventName, props);
}

function petAnalyticsSource(persona = {}) {
  if (persona.slug === BUILTIN_PET.slug || persona.kind === "builtin") return "builtin";
  if (persona.kind === "local") return "local";
  if (persona.kind === "ai") return "ai";
  if (persona.loading) return "loading";
  return "petdex";
}

function petAnalyticsProps(persona = {}, extra = {}) {
  const source = petAnalyticsSource(persona);
  const publicSlug = source === "local" || source === "ai" ? `custom_${source}` : persona.slug || "unknown";
  return {
    pet_slug: publicSlug,
    pet_kind: persona.kind || source,
    pet_source: source,
    is_builtin: source === "builtin",
    is_custom: source === "local" || source === "ai",
    ...extra,
  };
}

function trackPetEvent(eventName, persona, extra = {}) {
  trackEvent(eventName, petAnalyticsProps(persona, extra));
}

function trackActivePets(views = []) {
  for (const view of views) {
    const persona = petForView(view);
    const props = petAnalyticsProps(persona);
    if (props.pet_source === "loading") continue;
    const key = `${props.pet_source}:${props.pet_slug}`;
    if (trackedActivePetKeys.has(key)) continue;
    trackedActivePetKeys.add(key);
    trackEvent("pet_active", props);
  }
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
    if (stateCharacteristic) {
      sendCurrent({ ensurePersonaSync: true }).catch(setBluetoothSendFailed);
    }
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
  trackPetEvent("pet_selected", persona || petdexPetsBySlug.get(slug) || BUILTIN_PET, { picker_tab: activePetPickerTab });
}

function petdexFrameX(frame, cols = PETDEX_DEFAULT_COLS) {
  const safeCols = Math.max(1, Number(cols) || PETDEX_DEFAULT_COLS);
  const safeFrame = Math.max(0, Math.min(safeCols - 1, Number(frame) || 0));
  if (safeCols === 1) return "0%";
  return `${(safeFrame / (safeCols - 1)) * 100}%`;
}

function petdexRowForState(state, rows = PETDEX_DEFAULT_ROWS) {
  const safeRows = Math.max(1, Number(rows) || PETDEX_DEFAULT_ROWS);
  const normalizedState = petdexStateForHardware(state);
  const row = PETDEX_ROW_BY_STATE[normalizedState] === undefined ? 0 : PETDEX_ROW_BY_STATE[normalizedState];
  const safeRow = Math.max(0, Math.min(safeRows - 1, row));
  if (safeRows === 1) return "0%";
  return `${(safeRow / (safeRows - 1)) * 100}%`;
}

function petdexFrameSequenceForState(state, cols) {
  const normalizedState = petdexStateForHardware(state);
  const sequence = PETDEX_FRAME_SEQUENCE_BY_STATE[normalizedState] || PETDEX_DEFAULT_FRAME_SEQUENCE;
  const safeCols = Math.max(1, Number(cols) || PETDEX_DEFAULT_COLS);
  const frames = sequence.filter((frame) => frame >= 0 && frame < safeCols);
  return frames.length ? frames : [0];
}

function hardwarePersonaSequenceIndexes(sequence, maxFrames, state = "") {
  const safeSequence = Array.isArray(sequence) && sequence.length ? sequence : [0];
  const count = Math.max(1, Math.min(maxFrames, safeSequence.length));
  if (count === 1) return [0];

  const preferred = HARDWARE_PERSONA_SEQUENCE_INDEXES_BY_STATE[petdexStateForHardware(state)];
  if (preferred) {
    const usedFrames = new Set();
    const indexes = [];
    for (const index of preferred) {
      if (indexes.length >= count || index < 0 || index >= safeSequence.length) continue;
      const frame = safeSequence[index];
      if (usedFrames.has(frame)) continue;
      indexes.push(index);
      usedFrames.add(frame);
    }
    if (indexes.length === count) return indexes;
  }

  const indexes = [];
  const usedFrames = new Set();
  for (let slot = 0; slot < count; slot++) {
    const index = Math.min(safeSequence.length - 1, Math.floor((slot * safeSequence.length) / count));
    const frame = safeSequence[index];
    if (!usedFrames.has(frame)) {
      indexes.push(index);
      usedFrames.add(frame);
    }
  }

  for (let index = 0; indexes.length < count && index < safeSequence.length; index++) {
    const frame = safeSequence[index];
    if (usedFrames.has(frame)) continue;
    indexes.push(index);
    usedFrames.add(frame);
  }

  return indexes.length ? indexes : [0];
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

function isEmbeddedHardwarePersona(persona) {
  const slug = String(persona && persona.slug ? persona.slug : "");
  return !slug || slug === "lulu" || slug === BUILTIN_PET.slug || slug.startsWith("lulu-capybara") || LEGACY_BUILTIN_PET_SLUGS.has(slug);
}

function loadHardwarePersonaImage(url) {
  if (!url) return Promise.reject(new Error("Missing persona spritesheet."));
  const cached = hardwarePersonaImageCache.get(url);
  if (cached) return cached;

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load persona spritesheet."));
    if (/^https?:/i.test(url)) image.crossOrigin = "anonymous";
    image.src = url;
  });
  hardwarePersonaImageCache.set(url, promise);
  return promise;
}

function hardwarePersonaMeta(url, image) {
  const cached = petdexImageMeta.get(url);
  if (cached) return cached;
  const meta = {
    cols: Math.max(1, Math.round(image.naturalWidth / PETDEX_FRAME_WIDTH) || PETDEX_DEFAULT_COLS),
    rows: Math.max(1, Math.round(image.naturalHeight / PETDEX_FRAME_HEIGHT) || PETDEX_DEFAULT_ROWS),
  };
  petdexImageMeta.set(url, meta);
  return meta;
}

function hardwarePersonaBackground(theme) {
  return theme === "night" ? "rgb(0, 0, 0)" : "rgb(238, 244, 247)";
}

function rgb565BytesFromImageData(imageData) {
  const rgba = imageData.data;
  const bytes = new Uint8Array(HARDWARE_PERSONA_FRAME_BYTES);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 2) {
    const value = ((rgba[i] & 0xF8) << 8) | ((rgba[i + 1] & 0xFC) << 3) | (rgba[i + 2] >> 3);
    bytes[j] = value & 0xFF;
    bytes[j + 1] = value >> 8;
  }
  return bytes;
}

function encodeRgb565Rle(raw) {
  const out = [];
  for (let i = 0; i < raw.length;) {
    const lo = raw[i];
    const hi = raw[i + 1];
    let count = 1;
    while (count < 255 && i + count * 2 + 1 < raw.length && raw[i + count * 2] === lo && raw[i + count * 2 + 1] === hi) {
      count++;
    }
    out.push(lo, hi, count);
    i += count * 2;
  }
  return Uint8Array.from(out);
}

function bytesToBase64(bytes) {
  let binary = "";
  const blockSize = 0x8000;
  for (let i = 0; i < bytes.length; i += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + blockSize));
  }
  return btoa(binary);
}

function hardwarePersonaTransferId(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function buildHardwarePersonaFrame(persona, state, theme, sequenceIndex = 0) {
  const normalizedState = petdexStateForHardware(state);
  const image = await loadHardwarePersonaImage(persona.spritesheetUrl);
  const meta = hardwarePersonaMeta(persona.spritesheetUrl, image);
  const cols = Math.max(1, Number(meta.cols) || PETDEX_DEFAULT_COLS);
  const rows = Math.max(1, Number(meta.rows) || PETDEX_DEFAULT_ROWS);
  const row = Math.max(0, Math.min(rows - 1, PETDEX_ROW_BY_STATE[normalizedState] === undefined ? 0 : PETDEX_ROW_BY_STATE[normalizedState]));
  const sequence = petdexFrameSequenceForState(normalizedState, cols);
  const frame = sequence[Math.max(0, sequenceIndex) % sequence.length] || 0;
  const sourceW = image.naturalWidth / cols;
  const sourceH = image.naturalHeight / rows;
  const canvas = document.createElement("canvas");
  canvas.width = HARDWARE_PERSONA_FRAME_WIDTH;
  canvas.height = HARDWARE_PERSONA_FRAME_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to prepare persona frame.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = hardwarePersonaBackground(theme);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    image,
    frame * sourceW,
    row * sourceH,
    sourceW,
    sourceH,
    0,
    0,
    HARDWARE_PERSONA_FRAME_WIDTH,
    HARDWARE_PERSONA_FRAME_HEIGHT
  );

  const raw = rgb565BytesFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
  const rle = encodeRgb565Rle(raw);
  const encoded = rle.length < raw.length ? rle : raw;
  const format = encoded === rle ? "rgb565-rle" : "rgb565";
  return {
    bytes: encoded,
    format,
    key: [
      persona.slug || "",
      persona.spritesheetUrl || "",
      normalizedState,
      theme || "day",
      row,
      frame,
      format,
    ].join("|"),
  };
}

async function buildHardwarePersonaFrames(persona, state, theme) {
  const normalizedState = petdexStateForHardware(state);
  const image = await loadHardwarePersonaImage(persona.spritesheetUrl);
  const meta = hardwarePersonaMeta(persona.spritesheetUrl, image);
  const cols = Math.max(1, Number(meta.cols) || PETDEX_DEFAULT_COLS);
  const sequence = petdexFrameSequenceForState(normalizedState, cols);
  const sequenceIndexes = hardwarePersonaSequenceIndexes(sequence, HARDWARE_PERSONA_MAX_FRAMES, normalizedState);
  const frames = [];
  for (const sequenceIndex of sequenceIndexes) {
    frames.push(await buildHardwarePersonaFrame(persona, normalizedState, theme, sequenceIndex));
  }
  return frames;
}

async function buildHardwarePersonaFrameBundle(persona, theme, states = HARDWARE_PERSONA_STATES) {
  const entries = [];
  for (const state of states) {
    entries.push({
      state,
      frames: await buildHardwarePersonaFrames(persona, state, theme),
    });
  }
  return entries;
}

function selectablePetdexPets() {
  return petdexPets.filter((pet) => pet.slug !== BUILTIN_PET.slug);
}

function matchingPetdexPets(query, kind = petPickerKindFilter) {
  const needle = String(query || "").trim().toLowerCase();
  const kindFilter = String(kind || "").trim();
  return selectablePetdexPets().filter((pet) => {
    if (kindFilter && (pet.kind || "") !== kindFilter) return false;
    if (!needle) return true;
    return `${pet.displayName} ${pet.slug} ${pet.kind || ""} ${pet.submittedBy || ""}`.toLowerCase().includes(needle);
  });
}

function petdexPickerPageState(query, kind = petPickerKindFilter) {
  const matches = matchingPetdexPets(query, kind);
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / PETDEX_PICKER_PAGE_SIZE));
  const page = total ? Math.max(0, Math.min(petPickerPage, pageCount - 1)) : 0;
  petPickerPage = page;
  const start = page * PETDEX_PICKER_PAGE_SIZE;
  const end = Math.min(start + PETDEX_PICKER_PAGE_SIZE, total);
  return {
    pets: matches.slice(start, end),
    total,
    page,
    pageCount,
    start,
    end,
  };
}

function renderPetdexPagination(state) {
  if (!petPickerPagination || !petPickerPageInfo || !petPickerPageInput || !petPickerPageMeta || !petPickerPrevPageBtn || !petPickerNextPageBtn) return;
  const total = state && state.total ? state.total : 0;
  const show = total > 0;
  petPickerPagination.hidden = !show;
  petPickerPrevPageBtn.disabled = !show || state.page <= 0;
  petPickerNextPageBtn.disabled = !show || state.page >= state.pageCount - 1;
  petPickerPageInput.disabled = !show;
  petPickerPageInput.max = String(state && state.pageCount ? state.pageCount : 1);
  petPickerPageInput.value = String(state && state.total ? state.page + 1 : 1);
  petPickerPageInfo.textContent = total ? `${state.page + 1} / ${state.pageCount}` : "1 / 1";
  petPickerPageMeta.textContent = `总数量 ${total} · 每页 ${PETDEX_PICKER_PAGE_SIZE}`;
}

function setPetdexPickerPage(page) {
  petPickerPage = Math.max(0, Number(page) || 0);
  renderPetPickerModal();
  if (petChoiceGrid) petChoiceGrid.scrollTop = 0;
}

function jumpPetdexPickerPageFromInput() {
  if (!petPickerPageInput) return;
  const page = Math.max(1, Math.min(Number(petPickerPageInput.max) || 1, Number(petPickerPageInput.value) || 1));
  setPetdexPickerPage(page - 1);
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

function safePetPickerTab(tab) {
  return ["petdex", "local", "ai"].includes(tab) ? tab : "petdex";
}

function renderPetPickerTabs() {
  activePetPickerTab = safePetPickerTab(activePetPickerTab);
  for (const tab of petPickerTabs) {
    const active = tab.dataset.petPickerTab === activePetPickerTab;
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of petPickerPanels) {
    panel.hidden = panel.dataset.petPickerPanel !== activePetPickerTab;
  }
}

function setPetPickerTab(tab) {
  activePetPickerTab = safePetPickerTab(tab);
  renderPetPickerModal();
  if (activePetPickerTab === "petdex") setTimeout(() => petPickerSearch.focus(), 0);
}

function slugifyCustomPet(value, options = {}) {
  const slug = String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || (options.fallback === false ? "" : `pet-${Date.now().toString(36)}`);
}

function selectedFile(input) {
  return input && input.files && input.files[0] ? input.files[0] : null;
}

function isLocalPetSpritesheet(file) {
  if (!file) return false;
  return ["image/png", "image/webp"].includes(file.type) || /\.(png|webp)$/i.test(file.name || "");
}

function setLocalPetMeta(message, state = "") {
  if (!localPetFileMeta) return;
  localPetFileMeta.textContent = message;
  if (state) localPetFileMeta.dataset.state = state;
  else delete localPetFileMeta.dataset.state;
}

function setLocalPetStatus(message) {
  if (localPetStatus) localPetStatus.textContent = message;
}

function inspectImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片尺寸。"));
    };
    image.src = url;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("无法读取本地图片。"));
    reader.readAsDataURL(file);
  });
}

function localPetNameFromFile(file) {
  return String(file && file.name ? file.name : "")
    .replace(/\.(png|webp)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function localPetDimensionStatus(info) {
  if (!info) return { ok: false, message: "尚未选择图片。" };
  const cols = info.width / PETDEX_FRAME_WIDTH;
  const rows = info.height / PETDEX_FRAME_HEIGHT;
  const ok = info.width === PETDEX_REQUIRED_WIDTH && info.height === PETDEX_REQUIRED_HEIGHT;
  const grid = Number.isInteger(cols) && Number.isInteger(rows) ? `${rows} 行 × ${cols} 列` : "无法整除为标准帧";
  return {
    ok,
    message: ok
      ? `尺寸正确：${info.width}×${info.height}px，${grid}。`
      : `尺寸不符合 Petdex 规格：当前 ${info.width}×${info.height}px（${grid}），需要 ${PETDEX_REQUIRED_WIDTH}×${PETDEX_REQUIRED_HEIGHT}px。`,
  };
}

async function inspectLocalPetSpritesheet() {
  const file = selectedFile(localPetSpritesheet);
  localPetImageInfo = null;
  if (!file) {
    setLocalPetMeta("尚未选择图片。");
    return null;
  }

  if (!isLocalPetSpritesheet(file)) {
    setLocalPetMeta("请选择 .webp 或 .png spritesheet。", "error");
    return null;
  }

  const inferredName = localPetNameFromFile(file);
  if (localPetName && !localPetName.value.trim() && inferredName) localPetName.value = inferredName;
  if (localPetSlug && !localPetSlug.value.trim() && inferredName) localPetSlug.value = slugifyCustomPet(inferredName, { fallback: false });

  setLocalPetMeta("正在检查图片尺寸...");
  const info = await inspectImageFile(file);
  if (selectedFile(localPetSpritesheet) !== file) return null;
  localPetImageInfo = info;
  const status = localPetDimensionStatus(info);
  setLocalPetMeta(status.message, status.ok ? "ok" : "error");
  return { ...info, ok: status.ok };
}

async function applyLocalPetUpload() {
  const file = selectedFile(localPetSpritesheet);
  if (!activePetPickerId) return;
  if (!file) {
    setLocalPetStatus("请先选择 spritesheet 图片。");
    return;
  }
  if (!isLocalPetSpritesheet(file)) {
    setLocalPetStatus("只支持 .webp 或 .png spritesheet。");
    return;
  }

  try {
    const info = localPetImageInfo ? { ...localPetImageInfo, ok: localPetDimensionStatus(localPetImageInfo).ok } : await inspectLocalPetSpritesheet();
    if (!info || !info.ok) {
      setLocalPetStatus("图片尺寸还不符合 Petdex 规格，请调整后再上传。");
      return;
    }

    setLocalPetStatus("正在保存本地角色...");
    const displayName = clampText((localPetName && localPetName.value) || localPetNameFromFile(file) || "Local Pet", 48);
    const slug = `local-${slugifyCustomPet((localPetSlug && localPetSlug.value) || displayName)}`;
    const spritesheetUrl = await readFileAsDataUrl(file);
    const persona = {
      slug,
      displayName,
      kind: "local",
      submittedBy: "Local upload",
      spritesheetUrl,
    };
    petdexImageMeta.set(spritesheetUrl, { cols: PETDEX_REQUIRED_COLS, rows: PETDEX_REQUIRED_ROWS });
    setPetForView(activePetPickerId, slug, persona);
    const selectedViewId = activePetPickerId;
    closePetPicker();
    renderSnapshot(latestSnapshot, { send: true, hardwarePetId: selectedViewId, ensurePersonaSync: true });
  } catch (err) {
    setLocalPetStatus(err && err.message ? err.message : "本地角色保存失败。");
  }
}

function updateAiPetStatus() {
  if (!aiPetStatus) return;
  const front = selectedFile(aiPetFrontView);
  const optionalCount = [selectedFile(aiPetLeftView), selectedFile(aiPetRightView)].filter(Boolean).length;
  aiPetStatus.textContent = front
    ? `已选择正视图${optionalCount ? `，以及 ${optionalCount} 张侧视图` : ""}。生成接口预留中。`
    : "请先上传正视图。生成接口已预留，当前版本先支持页面和素材收集。";
  if (aiPetGenerateBtn) aiPetGenerateBtn.disabled = true;
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
  if (id.includes("windsurf") || id.includes("codeium") || id.includes("devin")) return "windsurf";
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
    sl: stateLabel(session.state || "idle"),
    ts: Date.now(),
  };
  if (title) packet.m = title;
  const output = clampText(session.output || "", HARDWARE_OUTPUT_MAX_CHARS);
  if (output) packet.o = output;
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
    renderSnapshot(latestSnapshot, { send: true, hardwarePetId: viewId, ensurePersonaSync: true });
  });
  return button;
}

function renderPetPickerModal() {
  if (!activePetPickerId) {
    petPickerModal.hidden = true;
    return;
  }

  petPickerModal.hidden = false;
  renderPetPickerTabs();
  petPickerSearch.value = petPickerQuery;
  syncPetKindFilter();
  petChoiceGrid.replaceChildren();

  petPickerRefreshBtn.disabled = petdexLoading;
  if (petdexLoading) {
    petPickerStatus.hidden = false;
    petPickerStatus.textContent = t("pet.loadingCharacters");
    renderPetdexPagination(null);
    return;
  }

  if (petdexError) {
    petPickerStatus.hidden = false;
    petPickerStatus.textContent = t("pet.unavailable", { message: petdexError });
  } else {
    petPickerStatus.hidden = true;
    petPickerStatus.textContent = "";
  }

  const pageState = petdexPickerPageState(petPickerQuery, petPickerKindFilter);
  const pets = pageState.pets;
  for (const pet of pets) {
    petChoiceGrid.append(createPetChoice(activePetPickerId, pet, selectedPetSlug(activePetPickerId)));
  }

  renderPetdexPagination(pageState);

  if (!pets.length && !petdexError) {
    const empty = document.createElement("div");
    empty.className = "pet-picker-note";
    empty.textContent = t("pet.noMatches");
    petChoiceGrid.append(empty);
  }
}

function openPetPicker(viewId) {
  activePetPickerId = viewId;
  activePetPickerTab = "petdex";
  petPickerQuery = "";
  petPickerKindFilter = "";
  petPickerPage = 0;
  petPickerKind.value = "";
  setLocalPetStatus("本地角色只保存在这台设备上。");
  updateAiPetStatus();
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
  const pets = views.map(desktopPetPayloadForView);
  latestHardwarePets = [...pets].sort(compareHardwarePets);
  if (!window.codePet || typeof window.codePet.syncDesktopPets !== "function") return;
  try {
    window.codePet.syncDesktopPets(pets);
  } catch {}
}

function renderSnapshot(snapshot, options = {}) {
  latestSnapshot = snapshot || latestSnapshot;
  const views = buildViews(latestSnapshot);
  if (activePetPickerId && !views.some((view) => view.id === activePetPickerId)) activePetPickerId = "";
  trackActivePets(views);
  renderPetGrid(views);
  syncDesktopPets(views);
  renderPetPickerModal();
  if (options.send) {
    sendCurrent({
      hardwarePetId: options.hardwarePetId,
      ensurePersonaSync: !!options.ensurePersonaSync,
    }).catch(setBluetoothSendFailed);
  }
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
  if (window.codePet && typeof window.codePet.setWindowTheme === "function") {
    window.codePet.setWindowTheme(nextTheme);
  }
  const views = buildViews(latestSnapshot);
  syncDesktopPets(views);
  if (stateCharacteristic) {
    sendCurrent().catch(setBluetoothSendFailed);
  }
}

function hideDevicePicker() {
  selectingDevice = false;
  devicePickerModal.hidden = true;
  devicePicker.hidden = true;
  deviceList.replaceChildren();
}

async function cancelDeviceSelection() {
  const wasSelecting = selectingDevice;
  if (!wasSelecting) return;
  deviceSelectionCancelled = true;
  hideDevicePicker();
  setConnection("connection.cancelled", false);
  try {
    await window.codePet.chooseBluetoothDevice("");
  } catch {}
}

function renderDevicePicker(devices = []) {
  lastBluetoothDevices = Array.isArray(devices) ? devices : [];
  if (!selectingDevice) {
    hideDevicePicker();
    return;
  }

  devicePickerModal.hidden = false;
  devicePicker.hidden = false;
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
  const selectedTarget = firmwareTargets.find((target) => target.id === selected && target.available !== false);
  const firstAvailableTarget = firmwareTargets.find((target) => target.available !== false);
  if (selectedTarget) {
    firmwareTarget.value = selected;
  } else if (firstAvailableTarget) {
    firmwareTarget.value = firstAvailableTarget.id;
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
  const selectedTarget = firmwareTargets.find((target) => target.id === firmwareTarget.value);
  const canFlashSelectedTarget = selectedTarget && selectedTarget.available !== false;
  firmwareStartBtn.disabled = running || !firmwarePorts.length || !canFlashSelectedTarget;
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
    const key = /arduino-cli|esptool|serialport/i.test(message) ? "firmware.flasherMissing" : "firmware.failed";
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

function clearAutoSelectBluetoothDevice() {
  if (autoSelectBluetoothDeviceTimer) {
    clearTimeout(autoSelectBluetoothDeviceTimer);
    autoSelectBluetoothDeviceTimer = null;
  }
  autoSelectingBluetoothDevice = false;
  autoSelectBluetoothDeviceTarget = null;
  autoSelectBluetoothDeviceChoiceSent = false;
}

function cancelAutoSelectBluetoothDevice() {
  if (autoSelectingBluetoothDevice) {
    window.codePet.chooseBluetoothDevice("").catch(() => {});
  }
  clearAutoSelectBluetoothDevice();
}

function findAutoSelectBluetoothDevice(devices = []) {
  const target = autoSelectBluetoothDeviceTarget || readRememberedBluetoothDevice();
  if (target && target.id) {
    const exact = devices.find((item) => item && item.id === target.id);
    if (exact) return exact;
  }
  if (target && target.name) {
    const exactName = devices.find((item) => item && item.name === target.name);
    if (exactName) return exactName;
  }
  return null;
}

function autoSelectBluetoothDeviceFromList(devices = []) {
  if (!autoSelectingBluetoothDevice) return false;
  if (autoSelectBluetoothDeviceChoiceSent) return true;
  const match = findAutoSelectBluetoothDevice(devices);
  if (!match || !match.id) return true;
  autoSelectBluetoothDeviceChoiceSent = true;
  window.codePet.chooseBluetoothDevice(match.id).catch(() => {});
  return true;
}

function handleBluetoothDisconnected() {
  stateCharacteristic = null;
  connectedBluetoothDeviceName = "";
  resetHardwarePersonaTransferState();
  if (manualDisconnectInFlight) {
    manualDisconnectInFlight = false;
    setActiveBluetoothDevice(null);
    setConnection("connection.disconnected", false);
    return;
  }
  setConnection("connection.deviceDisconnected", false);
  scheduleAutoConnect(2000);
}

function hasActiveBluetoothConnection() {
  if (!stateCharacteristic) return false;
  if (!device || !device.gatt) return true;
  return device.gatt.connected !== false;
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
  const nextDeviceCacheKey = bluetoothDeviceCacheKey(nextDevice);
  const forgetPersonaCache = !!(hardwarePersonaCacheDeviceKey &&
    nextDeviceCacheKey &&
    hardwarePersonaCacheDeviceKey !== nextDeviceCacheKey);
  stateCharacteristic = null;
  connectedBluetoothDeviceName = "";
  resetHardwarePersonaTransferState({ forgetCache: forgetPersonaCache });
  autoConnectPaused = false;
  autoConnectAttempts = 0;
  clearAutoConnectTimer();
  setActiveBluetoothDevice(nextDevice);
  setConnection("connection.connecting", false);
  const server = await nextDevice.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  stateCharacteristic = await service.getCharacteristic(STATE_CHAR_UUID);
  rememberBluetoothDevice(nextDevice);
  connectedBluetoothDeviceName = nextDevice.name || "";
  setConnection(nextDevice.name || "connection.connected", true);
  try {
    await sendCurrent();
  } catch (err) {
    setBluetoothSendFailed(err);
    if (!hasActiveBluetoothConnection()) throw err;
  }
}

async function autoConnectViaRememberedScan(target) {
  if (!navigator.bluetooth || typeof navigator.bluetooth.requestDevice !== "function") return false;
  if (!target || autoSelectingBluetoothDevice) return false;

  autoSelectingBluetoothDevice = true;
  autoSelectBluetoothDeviceTarget = target;
  autoSelectBluetoothDeviceChoiceSent = false;
  autoSelectBluetoothDeviceTimer = setTimeout(() => {
    if (!autoSelectingBluetoothDevice) return;
    window.codePet.chooseBluetoothDevice("").catch(() => {});
  }, BLUETOOTH_AUTO_CONNECT_SCAN_TIMEOUT_MS);

  try {
    const selectedDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: BLUETOOTH_SCAN_NAME_PREFIX }],
      optionalServices: [SERVICE_UUID],
    });
    await connectBluetoothDevice(selectedDevice);
    return true;
  } catch {
    return false;
  } finally {
    clearAutoSelectBluetoothDevice();
  }
}

async function autoConnectKnownDevice(options = {}) {
  const scanFallback = options.scanFallback !== false;
  const target = readRememberedBluetoothDevice();
  if (autoConnectPaused || autoConnectInFlight || selectingDevice || stateCharacteristic || !target) return false;
  if (!navigator.bluetooth) return false;

  autoConnectInFlight = true;
  try {
    let devices = [];
    if (typeof navigator.bluetooth.getDevices === "function") {
      devices = await navigator.bluetooth.getDevices();
    }
    const knownDevice = findRememberedBluetoothDevice(Array.isArray(devices) ? devices : []);
    if (knownDevice) {
      await connectBluetoothDevice(knownDevice);
      autoConnectAttempts = 0;
      return true;
    }

    if (!scanFallback) return false;
    const connected = await autoConnectViaRememberedScan(target);
    if (connected) autoConnectAttempts = 0;
    return connected;
  } catch {
    stateCharacteristic = null;
    connectedBluetoothDeviceName = "";
    resetHardwarePersonaTransferState();
    setConnection("connection.disconnected", false);
    return false;
  } finally {
    autoConnectInFlight = false;
  }
}

function clearAutoConnectTimer() {
  if (!autoConnectTimer) return;
  clearTimeout(autoConnectTimer);
  autoConnectTimer = null;
}

function nextAutoConnectDelay(fallback = 0) {
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  return BLUETOOTH_AUTO_CONNECT_RETRY_DELAYS[Math.min(autoConnectAttempts, BLUETOOTH_AUTO_CONNECT_RETRY_DELAYS.length - 1)];
}

function scheduleAutoConnect(delay = 0) {
  if (autoConnectPaused || hasActiveBluetoothConnection() || !readRememberedBluetoothDevice()) return;
  clearAutoConnectTimer();
  autoConnectTimer = setTimeout(async () => {
    autoConnectTimer = null;
    autoConnectAttempts++;
    const connected = await autoConnectKnownDevice({ scanFallback: true });
    if (!connected && !autoConnectPaused && !hasActiveBluetoothConnection() && readRememberedBluetoothDevice()) {
      scheduleAutoConnect(nextAutoConnectDelay());
    }
  }, nextAutoConnectDelay(delay));
}

async function disconnectBluetoothDevice() {
  if (!hasActiveBluetoothConnection()) {
    stateCharacteristic = null;
    connectedBluetoothDeviceName = "";
    resetHardwarePersonaTransferState();
    setActiveBluetoothDevice(null);
    setConnection("connection.disconnected", false);
    return;
  }
  if (!(await confirmDisconnectDevice())) return;
  autoConnectPaused = true;
  autoConnectAttempts = 0;
  clearAutoConnectTimer();
  cancelAutoSelectBluetoothDevice();
  manualDisconnectInFlight = true;
  const currentDevice = device;
  stateCharacteristic = null;
  connectedBluetoothDeviceName = "";
  resetHardwarePersonaTransferState();
  try {
    if (currentDevice && currentDevice.gatt && typeof currentDevice.gatt.disconnect === "function") {
      currentDevice.gatt.disconnect();
    }
  } catch {
  } finally {
    manualDisconnectInFlight = false;
    setActiveBluetoothDevice(null);
    setConnection("connection.disconnected", false);
  }
}

function hardwarePetForSend(options = {}) {
  const preferredId = typeof options === "string" ? options : options.hardwarePetId;
  if (preferredId) {
    const preferred = latestHardwarePets.find((pet) => pet && pet.id === preferredId);
    if (preferred) return preferred;
  }
  return latestHardwarePets[0];
}

function enqueueBluetoothWrite(task) {
  const run = bluetoothWriteQueue.catch(() => {}).then(task);
  bluetoothWriteQueue = run;
  return run;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeBluetoothJson(payload) {
  const characteristic = stateCharacteristic;
  if (!characteristic) throw new Error("No Bluetooth connection.");
  const nextPayload = bluetoothPayload(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(nextPayload));
  if (bytes.length > BLUETOOTH_JSON_MAX_BYTES && !(nextPayload && nextPayload.im)) {
    throw new Error(`BLE payload too large (${bytes.length} bytes).`);
  }
  try {
    await writeBluetoothBytes(characteristic, bytes);
  } catch (err) {
    if (bytes.length <= BLUETOOTH_DIRECT_WRITE_MAX_BYTES) throw err;
    await writeBluetoothFragmentedBytes(characteristic, bytes);
    console.warn("[ble] direct write failed; sent fragmented payload", err && err.message ? err.message : err);
  }
}

async function writeBluetoothBytes(characteristic, bytes) {
  if (characteristic.writeValueWithResponse) {
    await characteristic.writeValueWithResponse(bytes);
  } else {
    await characteristic.writeValue(bytes);
  }
}

function nextBluetoothFragmentId() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const id = alphabet[bluetoothFragmentSequence % alphabet.length];
  bluetoothFragmentSequence = (bluetoothFragmentSequence + 1) % alphabet.length;
  return id;
}

async function writeBluetoothFragmentedBytes(characteristic, bytes) {
  const encoder = new TextEncoder();
  const id = nextBluetoothFragmentId();
  await writeBluetoothBytes(characteristic, encoder.encode(`#${id}:${bytes.length}`));
  for (let offset = 0; offset < bytes.length; offset += BLUETOOTH_FRAGMENT_DATA_BYTES) {
    const chunk = bytes.subarray(offset, offset + BLUETOOTH_FRAGMENT_DATA_BYTES);
    const packet = new Uint8Array(2 + chunk.length);
    packet[0] = 43;
    packet[1] = id.charCodeAt(0);
    packet.set(chunk, 2);
    await writeBluetoothBytes(characteristic, packet);
  }
  await writeBluetoothBytes(characteristic, encoder.encode(`!${id}`));
}

function hardwarePersonaTransferTheme(packet) {
  return ((packet && packet.th) || storedTheme()) === "night" ? "night" : "day";
}

function hardwarePersonaLoadingSignature(hardwarePet, packet) {
  if (!hardwarePet || !hardwarePet.persona) return "";
  const persona = desktopPetPersona(hardwarePet.persona);
  if (isEmbeddedHardwarePersona(persona) || !persona.spritesheetUrl) return "";
  return [
    persona.slug || "",
    persona.spritesheetUrl || "",
    hardwarePersonaTransferTheme(packet),
    hardwarePersonaSyncScope(packet),
  ].join("|");
}

function hardwarePersonaTransferSignature(hardwarePet, packet) {
  if (!hardwarePet || !hardwarePet.persona) return "";
  const persona = desktopPetPersona(hardwarePet.persona);
  if (isEmbeddedHardwarePersona(persona) || !persona.spritesheetUrl) return "";
  return [
    persona.slug || "",
    persona.spritesheetUrl || "",
    hardwarePersonaTransferTheme(packet),
    hardwarePersonaSyncScope(packet),
  ].join("|");
}

async function abortHardwarePersonaTransfer(id) {
  if (!id || !stateCharacteristic) return;
  try {
    await writeBluetoothJson({ im: "x", id });
  } catch {}
}

function cancelActiveHardwarePersonaTransfer() {
  const id = activeHardwarePersonaTransferId;
  if (!id) return;
  cancelledHardwarePersonaTransferIds.add(id);
}

function isHardwarePersonaTransferCancelled(id, revision, signature) {
  return cancelledHardwarePersonaTransferIds.has(id) || (!!signature && revision !== hardwarePersonaTransferRevision);
}

async function stopHardwarePersonaTransferIfCancelled(id, revision, signature) {
  if (!isHardwarePersonaTransferCancelled(id, revision, signature)) return false;
  await abortHardwarePersonaTransfer(id);
  return true;
}

async function flushPendingHardwareStatusPacket(revision, signature) {
  if (!pendingHardwareStatusPacket) return;
  if (signature && (revision !== hardwarePersonaTransferRevision || signature !== latestHardwarePersonaRequestSignature)) return;
  const packet = pendingHardwareStatusPacket;
  pendingHardwareStatusPacket = null;
  await writeBluetoothJson(packet);
  setConnection(activeBluetoothConnectionMessage(), true);
}

async function sendHardwarePersonaFrameBundle(hardwarePet, packet, revision, signature, showLoading, loadingSignature) {
  if (!hardwarePet || !hardwarePet.persona) return;
  const persona = desktopPetPersona(hardwarePet.persona);
  if (isEmbeddedHardwarePersona(persona) || !persona.spritesheetUrl) return;
  if (signature && revision !== hardwarePersonaTransferRevision) return;
  activeHardwarePersonaTransferSignature = signature || "";

  const theme = hardwarePersonaTransferTheme(packet);
  const states = hardwarePersonaTransferStates(packet);
  let bundle;
  try {
    bundle = await buildHardwarePersonaFrameBundle(persona, theme, states);
  } catch (err) {
    if (activeHardwarePersonaTransferSignature === signature) activeHardwarePersonaTransferSignature = "";
    throw err;
  }
  if (signature && revision !== hardwarePersonaTransferRevision) {
    if (activeHardwarePersonaTransferSignature === signature) activeHardwarePersonaTransferSignature = "";
    return;
  }
  const frameSetKey = bundle.map((entry) => `${entry.state}:${entry.frames.map((frame) => frame.key).join("~")}`).join("||");
  if (frameSetKey === lastHardwarePersonaImageKey) {
    if (activeHardwarePersonaTransferSignature === signature) activeHardwarePersonaTransferSignature = "";
    return;
  }

  const id = hardwarePersonaTransferId(`${frameSetKey}|${revision}`);
  activeHardwarePersonaTransferId = id;
  cancelledHardwarePersonaTransferIds.delete(id);

  try {
    const personaName = clampText(persona.displayName || persona.slug || "", 48);
    const personaKind = clampText(persona.kind || "", 24);
    const spriteUrl = hardwareSpriteUrl(persona.spritesheetUrl);
    for (const entry of bundle) {
      const frames = entry.frames;
      for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
        const frame = frames[frameIndex];
        const startPayload = {
          im: "s",
          id,
          p: clampText(persona.slug, 48),
          d: personaName,
          st: entry.state,
          w: HARDWARE_PERSONA_FRAME_WIDTH,
          h: HARDWARE_PERSONA_FRAME_HEIGHT,
          f: frame.format,
          z: HARDWARE_PERSONA_FRAME_BYTES,
          ld: showLoading ? 1 : 0,
          fc: frames.length,
          fr: frameIndex,
          th: theme,
        };
        if (personaKind) startPayload.k = personaKind;
        if (spriteUrl) startPayload.u = spriteUrl;
        await writeBluetoothJson(startPayload);

        if (await stopHardwarePersonaTransferIfCancelled(id, revision, signature)) return;
        await flushPendingHardwareStatusPacket(revision, signature);

        const base64 = bytesToBase64(frame.bytes);
        let seq = 0;
        for (let offset = 0; offset < base64.length; offset += HARDWARE_PERSONA_CHUNK_CHARS) {
          if (await stopHardwarePersonaTransferIfCancelled(id, revision, signature)) return;
          await writeBluetoothJson({
            im: "c",
            id,
            q: seq++,
            d: base64.slice(offset, offset + HARDWARE_PERSONA_CHUNK_CHARS),
          });
          if (await stopHardwarePersonaTransferIfCancelled(id, revision, signature)) return;
          await flushPendingHardwareStatusPacket(revision, signature);
          await sleep(HARDWARE_PERSONA_CHUNK_DELAY_MS);
        }

        if (await stopHardwarePersonaTransferIfCancelled(id, revision, signature)) return;
        await writeBluetoothJson({ im: "e", id });
        await flushPendingHardwareStatusPacket(revision, signature);
      }
    }

    if (isHardwarePersonaTransferCancelled(id, revision, signature)) return;
    lastHardwarePersonaImageKey = frameSetKey;
    lastHardwarePersonaLoadingSignature = loadingSignature || "";
    hardwarePersonaCacheDeviceKey = bluetoothDeviceCacheKey(device);
  } finally {
    if (activeHardwarePersonaTransferId === id) activeHardwarePersonaTransferId = "";
    if (activeHardwarePersonaTransferSignature === signature) activeHardwarePersonaTransferSignature = "";
    cancelledHardwarePersonaTransferIds.delete(id);
  }
}

async function sendCurrent(options = {}) {
  if (!stateCharacteristic) return;
  const ensurePersonaSync = !!options.ensurePersonaSync;
  const hardwarePet = hardwarePetForSend(options);
  const packet = packetWithTheme(hardwarePet && hardwarePet.packet ? hardwarePet.packet : compactPacket(latestSnapshot.aggregate));
  packet.ts = Date.now();
  const sendSequence = ++hardwareSendSequence;
  const transferSignature = hardwarePersonaTransferSignature(hardwarePet, packet);
  const loadingSignature = hardwarePersonaLoadingSignature(hardwarePet, packet);
  let transferRevision = hardwarePersonaTransferRevision;
  let shouldSendPersonaFrame = !!transferSignature && !lastHardwarePersonaImageKey;
  let shouldShowPersonaLoading = !!transferSignature && loadingSignature !== lastHardwarePersonaLoadingSignature;
  if (transferSignature !== latestHardwarePersonaRequestSignature) {
    cancelActiveHardwarePersonaTransfer();
    latestHardwarePersonaRequestSignature = transferSignature;
    transferRevision = ++hardwarePersonaTransferRevision;
    lastHardwarePersonaImageKey = "";
    shouldSendPersonaFrame = !!transferSignature;
    shouldShowPersonaLoading = !!transferSignature && loadingSignature !== lastHardwarePersonaLoadingSignature;
  }
  const sameActivePersonaTransfer = transferSignature &&
    transferSignature === latestHardwarePersonaRequestSignature &&
    transferSignature === activeHardwarePersonaTransferSignature;
  if (!ensurePersonaSync && sameActivePersonaTransfer) {
    pendingHardwareStatusPacket = packet;
    return;
  }
  return enqueueBluetoothWrite(async () => {
    let personaFrameStillCurrent = shouldSendPersonaFrame && !!transferSignature &&
      transferSignature === latestHardwarePersonaRequestSignature &&
      transferRevision === hardwarePersonaTransferRevision;
    if (!ensurePersonaSync && sendSequence !== hardwareSendSequence && !personaFrameStillCurrent) return;
    if (ensurePersonaSync && transferSignature && transferRevision !== hardwarePersonaTransferRevision) return;
    await writeBluetoothJson(packet);
    setConnection(activeBluetoothConnectionMessage(), true);
    personaFrameStillCurrent = shouldSendPersonaFrame && !!transferSignature &&
      transferSignature === latestHardwarePersonaRequestSignature &&
      transferRevision === hardwarePersonaTransferRevision;
    if (!ensurePersonaSync && sendSequence !== hardwareSendSequence && !personaFrameStillCurrent) return;
    if (transferSignature && transferRevision !== hardwarePersonaTransferRevision) return;
    try {
      if (shouldSendPersonaFrame) {
        await sendHardwarePersonaFrameBundle(
          hardwarePet,
          packet,
          transferRevision,
          transferSignature,
          shouldShowPersonaLoading,
          loadingSignature
        );
      }
    } catch (err) {
      setBluetoothSendFailed(err);
    }
  });
}

async function connectDevice() {
  if (!navigator.bluetooth) {
    setConnection("connection.noBluetoothDesktop", false);
    return;
  }

  if (hasActiveBluetoothConnection()) {
    await disconnectBluetoothDevice();
    return;
  }

  autoConnectPaused = false;
  autoConnectAttempts = 0;
  clearAutoConnectTimer();
  cancelAutoSelectBluetoothDevice();
  stateCharacteristic = null;

  if (await autoConnectKnownDevice({ scanFallback: false })) return;

  deviceSelectionCancelled = false;
  selectingDevice = true;
  renderDevicePicker([]);
  setConnection("connection.scanning", false);

  const selectedDevice = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: BLUETOOTH_SCAN_NAME_PREFIX }],
    optionalServices: [SERVICE_UUID],
  });

  hideDevicePicker();
  deviceSelectionCancelled = false;
  await connectBluetoothDevice(selectedDevice);
}

connectBtn.addEventListener("click", () => {
  connectDevice().catch((err) => {
    const cancelled = deviceSelectionCancelled;
    hideDevicePicker();
    if (hasActiveBluetoothConnection()) {
      setConnection(activeBluetoothConnectionMessage(), true);
    } else {
      setConnection(cancelled ? "connection.cancelled" : connectionErrorMessage(err), false);
    }
    deviceSelectionCancelled = false;
  });
});

flashBtn.addEventListener("click", () => {
  openFirmwareModal();
});

document.addEventListener("click", (event) => {
  if (disconnectConfirmModal && !disconnectConfirmModal.hidden) {
    if (event.target === disconnectConfirmModal) closeDisconnectConfirm(false);
    return;
  }
  if (devicePickerModal && !devicePickerModal.hidden) {
    if (event.target === devicePickerModal) cancelDeviceSelection();
    return;
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (disconnectConfirmModal && !disconnectConfirmModal.hidden) {
    closeDisconnectConfirm(false);
    return;
  }
  if (devicePickerModal && !devicePickerModal.hidden) {
    cancelDeviceSelection();
    return;
  }
});

cancelDeviceBtn.addEventListener("click", cancelDeviceSelection);
disconnectConfirmCancelBtn.addEventListener("click", () => closeDisconnectConfirm(false));
disconnectConfirmConfirmBtn.addEventListener("click", () => closeDisconnectConfirm(true));

for (const option of themeOptions) {
  option.addEventListener("click", () => applyTheme(option.dataset.themeOption));
}

languageSelect.addEventListener("change", () => {
  if (window.VibePetI18n) window.VibePetI18n.setLocale(languageSelect.value);
});

window.addEventListener("code-pet:language-change", () => {
  renderConnection();
  renderDevicePicker(lastBluetoothDevices);
  renderDisconnectConfirm();
  if (firmwareModalOpen) {
    renderFirmwareTargets();
    renderFirmwarePorts();
  }
  if (activePetPickerId) renderPetPickerModal();
  renderSnapshot(latestSnapshot);
  if (stateCharacteristic) {
    sendCurrent().catch(setBluetoothSendFailed);
  }
});

for (const tab of petPickerTabs) {
  tab.addEventListener("click", () => setPetPickerTab(tab.dataset.petPickerTab));
}

petPickerSearch.addEventListener("input", () => {
  petPickerQuery = petPickerSearch.value;
  petPickerPage = 0;
  renderPetPickerModal();
});

petPickerKind.addEventListener("change", () => {
  petPickerKindFilter = petPickerKind.value;
  petPickerPage = 0;
  renderPetPickerModal();
});

petPickerPrevPageBtn.addEventListener("click", () => {
  setPetdexPickerPage(petPickerPage - 1);
});

petPickerNextPageBtn.addEventListener("click", () => {
  setPetdexPickerPage(petPickerPage + 1);
});

petPickerPageInput.addEventListener("change", jumpPetdexPickerPageFromInput);

petPickerPageInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  jumpPetdexPickerPageFromInput();
});

petPickerRefreshBtn.addEventListener("click", () => {
  ensurePetdexPets({ force: true });
});

localPetName.addEventListener("input", () => {
  if (!localPetSlugTouched) localPetSlug.value = slugifyCustomPet(localPetName.value, { fallback: false });
});

localPetSlug.addEventListener("input", () => {
  localPetSlugTouched = true;
  localPetSlug.value = slugifyCustomPet(localPetSlug.value, { fallback: false });
});

localPetSpritesheet.addEventListener("change", () => {
  inspectLocalPetSpritesheet().catch((err) => {
    setLocalPetMeta(err && err.message ? err.message : "无法读取图片。", "error");
  });
});

localPetApplyBtn.addEventListener("click", () => {
  applyLocalPetUpload();
});

[aiPetFrontView, aiPetLeftView, aiPetRightView].forEach((input) => {
  input.addEventListener("change", updateAiPetStatus);
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

firmwareTarget.addEventListener("change", () => {
  setFirmwareBusy(firmwareFlashing);
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
    setBluetoothSendFailed(err);
  }
});

window.codePet.onBluetoothDevices((devices) => {
  const list = Array.isArray(devices) ? devices : [];
  if (autoSelectBluetoothDeviceFromList(list)) return;
  renderDevicePicker(list);
});

window.codePet.onFirmwareFlash(handleFirmwareFlashEvent);

setInterval(() => {
  petdexFrame = (petdexFrame + 1) % 10000;
  updatePetdexSpriteFrames();
}, PETDEX_FRAME_MS);

initializeAnalytics();
applyTheme(storedTheme());
refreshGitHubStars();
ensurePetdexPets();
window.codePet.getSnapshot()
  .then((snapshot) => renderSnapshot(snapshot))
  .catch(() => renderSnapshot(latestSnapshot));
scheduleAutoConnect(600);
