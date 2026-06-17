"use strict";

const PETDEX_FRAME_WIDTH = 192;
const PETDEX_FRAME_HEIGHT = 208;
const PETDEX_DEFAULT_COLS = 8;
const PETDEX_DEFAULT_ROWS = 9;
const PETDEX_FRAME_MS = 150;
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

const root = document.getElementById("desktopPetRoot");
const figure = document.getElementById("desktopPetFigure");
const title = document.getElementById("desktopPetTitle");
const stateText = document.getElementById("desktopPetState");

let petdexFrame = 0;
let currentSignature = "";
let petdexImageMeta = new Map();
let petdexImageLoading = new Map();

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
  element.dataset.url = url;
  element.style.backgroundImage = `url(${JSON.stringify(url)})`;
  setPetdexSpriteGrid(element, state, petdexImageMeta.get(url), animated);
  loadPetdexImageMeta(url, (meta) => {
    if (!element.isConnected) return;
    setPetdexSpriteGrid(element, element.dataset.state || state || "idle", meta, animated);
  });
}

function updatePetdexSpriteFrames() {
  for (const sprite of document.querySelectorAll(".overlay-petdex")) {
    const cols = Math.max(1, Number(sprite.dataset.cols) || PETDEX_DEFAULT_COLS);
    const state = sprite.dataset.state || "idle";
    sprite.style.setProperty("--petdex-frame-x", petdexFrameX(petdexFrameForState(state, cols, true), cols));
  }
}

function petSignature(persona) {
  if (!persona || persona.loading) return "loading";
  return [persona.slug || "", persona.spritesheetUrl || ""].join("|");
}

function createPetElement(state, persona) {
  if (persona && persona.loading) {
    const loading = document.createElement("div");
    loading.className = "overlay-loading";
    loading.title = persona.displayName || "Loading";
    return loading;
  }

  if (persona && persona.spritesheetUrl) {
    const sprite = document.createElement("div");
    sprite.className = "overlay-petdex";
    sprite.title = persona.displayName || "Vibe Pet";
    preparePetdexSprite(sprite, persona.spritesheetUrl, state || "idle", true);
    return sprite;
  }

  const fallback = document.createElement("div");
  fallback.className = "overlay-mini-pet";
  fallback.dataset.state = state || "idle";
  fallback.title = persona && persona.displayName ? persona.displayName : "Vibe Pet";
  return fallback;
}

function updateExistingPet(state) {
  const element = figure.firstElementChild;
  if (!element) return;
  if (element.classList.contains("overlay-petdex")) {
    const url = element.dataset.url || "";
    const meta = petdexImageMeta.get(url);
    setPetdexSpriteGrid(element, state || "idle", meta, true);
    return;
  }
  element.dataset.state = state || "idle";
}

function render(payload = {}) {
  const persona = payload.persona || {};
  const state = payload.state || "idle";
  const signature = petSignature(persona);

  root.dataset.state = state;
  title.textContent = payload.title || payload.agentName || "Vibe Pet";
  title.title = title.textContent;
  stateText.textContent = payload.stateLabel || state;
  stateText.title = state;

  if (signature !== currentSignature) {
    currentSignature = signature;
    figure.replaceChildren(createPetElement(state, persona));
    return;
  }

  updateExistingPet(state);
}

document.addEventListener("dragstart", (event) => event.preventDefault());

if (window.codePet && typeof window.codePet.onDesktopPet === "function") {
  window.codePet.onDesktopPet(render);
}

setInterval(() => {
  petdexFrame = (petdexFrame + 1) % 10000;
  updatePetdexSpriteFrames();
}, PETDEX_FRAME_MS);
