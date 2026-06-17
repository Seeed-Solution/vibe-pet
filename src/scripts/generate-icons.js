#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const LOGO_SVG = path.join(ROOT, "src", "host", "public", "logo.svg");
const ASSET_DIR = path.join(ROOT, "src", "desktop", "assets");
const ICON_BASE = path.join(ASSET_DIR, "app-icon");
const APP_ICON_PNG = `${ICON_BASE}.png`;
const APP_ICON_ICNS = `${ICON_BASE}.icns`;
const APP_ICON_ICO = `${ICON_BASE}.ico`;
const TRAY_ICON_PNG = path.join(ASSET_DIR, "tray-icon.png");

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
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

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
  run("sips", [
    "-s",
    "format",
    "png",
    "--resampleHeightWidth",
    String(size),
    String(size),
    LOGO_SVG,
    "--out",
    outFile,
  ]);
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
  if (!fs.existsSync(LOGO_SVG)) {
    throw new Error(`Missing logo source: ${path.relative(ROOT, LOGO_SVG)}`);
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
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
