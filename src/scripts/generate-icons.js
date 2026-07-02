#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const ASSET_DIR = path.join(ROOT, "src", "desktop", "assets");
const ICON_SOURCE = path.join(ASSET_DIR, "app-icon-source.png");
const ICON_BASE = path.join(ASSET_DIR, "app-icon");
const APP_ICON_PNG = `${ICON_BASE}.png`;
const APP_ICON_ICNS = `${ICON_BASE}.icns`;
const APP_ICON_ICO = `${ICON_BASE}.ico`;
const TRAY_ICON_PNG = path.join(ASSET_DIR, "tray-icon.png");
const TRAY_TEMPLATE_ICON_PNG = path.join(ASSET_DIR, "tray-iconTemplate.png");
const ROUND_ICON_SWIFT = path.join(__dirname, "round-icon.swift");
// The source icon is already framed for small OS surfaces such as taskbars.
const ICON_CONTENT_SCALE = 1;

const ICONSET_ENTRIES = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${details ? `\n${details}` : ""}`);
  }
  return result.stdout;
}

function commandExists(command) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, [command], {
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
    windowsHide: true,
  });
  return result.status === 0;
}

function renderPng(size, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const flatFile = path.join(path.dirname(outFile), `.flat-${size}-${path.basename(outFile)}`);
  run("sips", [
    "-s",
    "format",
    "png",
    "--resampleHeightWidth",
    String(size),
    String(size),
    ICON_SOURCE,
    "--out",
    flatFile,
  ]);

  if (process.platform === "darwin" && commandExists("swift") && fs.existsSync(ROUND_ICON_SWIFT)) {
    run("swift", [
      ROUND_ICON_SWIFT,
      flatFile,
      outFile,
      String(size),
      String(ICON_CONTENT_SCALE),
    ]);
  } else {
    fs.copyFileSync(flatFile, outFile);
  }
  fs.rmSync(flatFile, { force: true });
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function writePng(outFile, width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  header.writeUInt8(0, 10);
  header.writeUInt8(0, 11);
  header.writeUInt8(0, 12);

  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    const rawOffset = y * (rowSize + 1);
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, y * rowSize, (y + 1) * rowSize);
  }

  fs.writeFileSync(outFile, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND"),
  ]));
}

function roundedRectContains(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const nearestX = Math.max(left + radius, Math.min(right - radius, x));
  const nearestY = Math.max(top + radius, Math.min(bottom - radius, y));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function triangleContains(x, y, ax, ay, bx, by, cx, cy) {
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
  const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
  const c = 1 - a - b;
  return a >= 0 && b >= 0 && c >= 0;
}

function ellipseContains(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(x - ax, y - ay);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function lineContains(x, y, ax, ay, bx, by, width) {
  return distanceToSegment(x, y, ax, ay, bx, by) <= width / 2;
}

function quadraticPoint(ax, ay, cx, cy, bx, by, t) {
  const mt = 1 - t;
  return [
    mt * mt * ax + 2 * mt * t * cx + t * t * bx,
    mt * mt * ay + 2 * mt * t * cy + t * t * by,
  ];
}

function addQuadratic(points, cx, cy, bx, by, segments = 10) {
  const [ax, ay] = points[points.length - 1];
  for (let i = 1; i <= segments; i++) {
    points.push(quadraticPoint(ax, ay, cx, cy, bx, by, i / segments));
  }
}

function pathStrokeContains(x, y, points, width) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    if (lineContains(x, y, ax, ay, bx, by, width)) return true;
  }
  return false;
}

function createCatHeadPath() {
  const points = [[0.24, 0.46]];
  addQuadratic(points, 0.23, 0.32, 0.30, 0.15, 8);
  addQuadratic(points, 0.33, 0.08, 0.39, 0.26, 8);
  addQuadratic(points, 0.50, 0.20, 0.61, 0.26, 10);
  addQuadratic(points, 0.67, 0.08, 0.70, 0.15, 8);
  addQuadratic(points, 0.77, 0.32, 0.76, 0.46, 8);
  addQuadratic(points, 0.86, 0.56, 0.80, 0.72, 12);
  addQuadratic(points, 0.76, 0.87, 0.61, 0.92, 12);
  addQuadratic(points, 0.50, 0.96, 0.39, 0.92, 12);
  addQuadratic(points, 0.24, 0.87, 0.20, 0.72, 12);
  addQuadratic(points, 0.14, 0.56, 0.24, 0.46, 12);
  return points;
}

function createCurve(ax, ay, cx, cy, bx, by, segments = 8) {
  const points = [[ax, ay]];
  addQuadratic(points, cx, cy, bx, by, segments);
  return points;
}

const CAT_HEAD_PATH = createCatHeadPath();
const LEFT_MOUTH_PATH = createCurve(0.50, 0.67, 0.45, 0.75, 0.39, 0.69);
const RIGHT_MOUTH_PATH = createCurve(0.50, 0.67, 0.55, 0.75, 0.61, 0.69);
const LEFT_TOP_WHISKER_PATH = createCurve(0.24, 0.59, 0.31, 0.57, 0.39, 0.58);
const LEFT_BOTTOM_WHISKER_PATH = createCurve(0.24, 0.69, 0.31, 0.66, 0.39, 0.66);
const RIGHT_TOP_WHISKER_PATH = createCurve(0.61, 0.58, 0.69, 0.57, 0.76, 0.59);
const RIGHT_BOTTOM_WHISKER_PATH = createCurve(0.61, 0.66, 0.69, 0.66, 0.76, 0.69);

function trayTemplateSampleAlpha(x, y) {
  const outlineStroke = 0.06;
  const detailStroke = 0.032;
  const shape = [
    pathStrokeContains(x, y, CAT_HEAD_PATH, outlineStroke),
    ellipseContains(x, y, 0.36, 0.55, 0.035, 0.048),
    ellipseContains(x, y, 0.64, 0.55, 0.035, 0.048),
    ellipseContains(x, y, 0.50, 0.64, 0.034, 0.024),
    pathStrokeContains(x, y, LEFT_MOUTH_PATH, detailStroke),
    pathStrokeContains(x, y, RIGHT_MOUTH_PATH, detailStroke),
    pathStrokeContains(x, y, LEFT_TOP_WHISKER_PATH, detailStroke),
    pathStrokeContains(x, y, LEFT_BOTTOM_WHISKER_PATH, detailStroke),
    pathStrokeContains(x, y, RIGHT_TOP_WHISKER_PATH, detailStroke),
    pathStrokeContains(x, y, RIGHT_BOTTOM_WHISKER_PATH, detailStroke),
  ].some(Boolean);

  return shape ? 255 : 0;
}

function renderTrayTemplatePng(size, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const samples = 4;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let alpha = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const nx = (x + (sx + 0.5) / samples) / size;
          const ny = (y + (sy + 0.5) / samples) / size;
          alpha += trayTemplateSampleAlpha(nx, ny);
        }
      }

      const offset = (y * size + x) * 4;
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
      rgba[offset + 3] = Math.round(alpha / (samples * samples));
    }
  }

  writePng(outFile, size, size, rgba);
}

function writeIco(entries, outFile) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;
  entries.forEach((entry, index) => {
    const buffer = fs.readFileSync(entry.file);
    const start = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, start);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, start + 1);
    directory.writeUInt8(0, start + 2);
    directory.writeUInt8(0, start + 3);
    directory.writeUInt16LE(1, start + 4);
    directory.writeUInt16LE(32, start + 6);
    directory.writeUInt32LE(buffer.length, start + 8);
    directory.writeUInt32LE(offset, start + 12);
    offset += buffer.length;
  });

  fs.writeFileSync(outFile, Buffer.concat([
    header,
    directory,
    ...entries.map((entry) => fs.readFileSync(entry.file)),
  ]));
}

function main() {
  if (!fs.existsSync(ICON_SOURCE)) {
    throw new Error(`Missing icon source: ${path.relative(ROOT, ICON_SOURCE)}`);
  }
  if (!commandExists("sips") || !commandExists("iconutil")) {
    throw new Error("Icon generation requires macOS tools `sips` and `iconutil`. Existing generated icons can still be used on Linux and Windows.");
  }

  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-pet-icons-"));
  const iconsetDir = path.join(tempDir, "VibePet.iconset");
  const icoDir = path.join(tempDir, "ico");

  try {
    fs.mkdirSync(iconsetDir, { recursive: true });
    fs.mkdirSync(icoDir, { recursive: true });

    renderPng(512, APP_ICON_PNG);
    renderPng(64, TRAY_ICON_PNG);
    renderTrayTemplatePng(64, TRAY_TEMPLATE_ICON_PNG);

    for (const [fileName, size] of ICONSET_ENTRIES) {
      renderPng(size, path.join(iconsetDir, fileName));
    }
    run("iconutil", ["-c", "icns", iconsetDir, "-o", APP_ICON_ICNS]);

    const icoEntries = ICO_SIZES.map((size) => {
      const file = path.join(icoDir, `icon-${size}.png`);
      renderPng(size, file);
      return { size, file };
    });
    writeIco(icoEntries, APP_ICON_ICO);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log("Generated app icons:");
  console.log(`- ${path.relative(ROOT, APP_ICON_PNG)}`);
  console.log(`- ${path.relative(ROOT, APP_ICON_ICNS)}`);
  console.log(`- ${path.relative(ROOT, APP_ICON_ICO)}`);
  console.log(`- ${path.relative(ROOT, TRAY_ICON_PNG)}`);
  console.log(`- ${path.relative(ROOT, TRAY_TEMPLATE_ICON_PNG)}`);
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
