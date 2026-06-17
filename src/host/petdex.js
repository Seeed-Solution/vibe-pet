"use strict";

const MANIFEST_URL = "https://petdex.dev/api/manifest";
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

let cache = null;
let cacheAt = 0;
let pending = null;

function cleanString(value, max = 120) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function isAllowedAssetUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "assets.petdex.dev";
  } catch {
    return false;
  }
}

function normalizePet(entry) {
  if (!entry || typeof entry !== "object") return null;
  const slug = cleanString(entry.slug, 80);
  const displayName = cleanString(entry.displayName || entry.name || slug, 100);
  const spritesheetUrl = cleanString(entry.spritesheetUrl || entry.spriteUrl || "", 300);
  if (!slug || !displayName || !isAllowedAssetUrl(spritesheetUrl)) return null;
  return {
    slug,
    displayName,
    kind: cleanString(entry.kind, 48),
    submittedBy: cleanString(entry.submittedBy, 80),
    spritesheetUrl,
    petJsonUrl: isAllowedAssetUrl(entry.petJsonUrl) ? cleanString(entry.petJsonUrl, 300) : "",
    zipUrl: isAllowedAssetUrl(entry.zipUrl) ? cleanString(entry.zipUrl, 300) : "",
  };
}

async function fetchManifest() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(MANIFEST_URL, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Petdex manifest ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getPetdexPets(options = {}) {
  const now = Date.now();
  if (!options.force && cache && now - cacheAt < CACHE_TTL_MS) return cache;
  if (!pending) {
    pending = fetchManifest()
      .then((manifest) => {
        const pets = Array.isArray(manifest && manifest.pets)
          ? manifest.pets.map(normalizePet).filter(Boolean)
          : [];
        cache = {
          generatedAt: manifest && manifest.generatedAt ? String(manifest.generatedAt) : "",
          total: Number(manifest && manifest.total) || pets.length,
          pets,
        };
        cacheAt = Date.now();
        return cache;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

module.exports = {
  getPetdexPets,
};
