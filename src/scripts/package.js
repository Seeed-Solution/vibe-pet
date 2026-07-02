#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const APP_NAME = "Vibe Pet";
const DEFAULT_OUT = "dist";
const ICON_BASE = path.join(ROOT, "src", "desktop", "assets", "app-icon");
const TRAY_TEMPLATE_ICON = path.join(ROOT, "src", "desktop", "assets", "tray-iconTemplate.png");
const ICON_SCRIPT = path.join(ROOT, "src", "scripts", "generate-icons.js");
const CHECK_SCRIPT = path.join(ROOT, "src", "scripts", "check.js");
const PLATFORM_ALIASES = {
  all: "all",
  current: process.platform,
  darwin: "darwin",
  mac: "darwin",
  macos: "darwin",
  osx: "darwin",
  linux: "linux",
  win: "win32",
  win32: "win32",
  windows: "win32",
};
const ARCH_ALIASES = {
  current: process.arch,
  x64: "x64",
  arm64: "arm64",
  ia32: "ia32",
  armv7l: "armv7l",
  all: "all",
};

function takeValue(argv, index) {
  const value = argv[index];
  const eq = value.indexOf("=");
  if (eq >= 0) return { value: value.slice(eq + 1), consumed: 0 };
  return { value: argv[index + 1], consumed: 1 };
}

function normalizePlatform(value) {
  const raw = String(value || "current").trim().toLowerCase();
  const platform = PLATFORM_ALIASES[raw];
  if (!platform) {
    throw new Error(`Unsupported platform "${value}". Use current, all, darwin, linux, or win32.`);
  }
  return platform;
}

function normalizeArch(value) {
  const raw = String(value || "current").trim().toLowerCase();
  const arch = ARCH_ALIASES[raw];
  if (!arch) {
    throw new Error(`Unsupported arch "${value}". Use current, all, x64, arm64, ia32, or armv7l.`);
  }
  return arch;
}

function parseArgs(argv) {
  const options = {
    platform: "current",
    arch: "current",
    out: DEFAULT_OUT,
    check: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--skip-check") {
      options.check = false;
    } else if (arg === "--platform" || arg.startsWith("--platform=")) {
      const result = takeValue(argv, i);
      options.platform = result.value;
      i += result.consumed;
    } else if (arg === "--arch" || arg.startsWith("--arch=")) {
      const result = takeValue(argv, i);
      options.arch = result.value;
      i += result.consumed;
    } else if (arg === "--out" || arg.startsWith("--out=")) {
      const result = takeValue(argv, i);
      options.out = result.value || DEFAULT_OUT;
      i += result.consumed;
    } else if (!arg.startsWith("-") && options.platform === "current") {
      options.platform = arg;
    } else {
      throw new Error(`Unknown argument "${arg}".`);
    }
  }

  options.platform = normalizePlatform(options.platform);
  options.arch = normalizeArch(options.arch);
  options.out = path.resolve(ROOT, options.out);
  return options;
}

function printHelp() {
  console.log(`Usage: node src/scripts/package.js [options]

Options:
  --platform <current|all|darwin|linux|win32>  Target platform. Default: current.
  --arch <current|all|x64|arm64|ia32|armv7l>  Target architecture. Default: current.
  --out <dir>                                 Output directory. Default: dist.
  --skip-check                                Skip syntax checks before packaging.

Examples:
  npm run package:current
  npm run package:mac -- --arch arm64
  npm run package:all
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function packagerScript() {
  return path.join(ROOT, "node_modules", "@electron", "packager", "bin", "electron-packager.mjs");
}

function ensureDependencies() {
  const command = packagerScript();
  if (fs.existsSync(command)) return command;
  throw new Error("electron-packager was not found. Run npm install first, or run the one-click installer.");
}

function requiredIconFiles(platform) {
  const files = [`${ICON_BASE}.png`];
  if (platform === "darwin" || platform === "all") files.push(`${ICON_BASE}.icns`, TRAY_TEMPLATE_ICON);
  if (platform === "win32" || platform === "all") files.push(`${ICON_BASE}.ico`);
  return files;
}

function ensureIconAssets(options) {
  const missing = requiredIconFiles(options.platform).filter((file) => !fs.existsSync(file));
  if (!missing.length) return;

  run(process.execPath, [ICON_SCRIPT]);

  const stillMissing = requiredIconFiles(options.platform).filter((file) => !fs.existsSync(file));
  if (stillMissing.length) {
    throw new Error(`Missing app icon assets: ${stillMissing.map((file) => path.relative(ROOT, file)).join(", ")}`);
  }
}

function buildPackagerArgs(options) {
  return [
    ".",
    APP_NAME,
    `--platform=${options.platform}`,
    `--arch=${options.arch}`,
    `--out=${options.out}`,
    `--icon=${ICON_BASE}`,
    "--overwrite",
    "--prune=true",
    "--ignore=^/dist($|/)",
    "--ignore=^/\\.git($|/)",
    "--ignore=^/node_modules/\\.cache($|/)",
    "--ignore=^/src/firmware/.*/\\.pio($|/)",
    "--ignore=^/src/firmware/.*/build($|/)",
  ];
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  ensureIconAssets(options);
  if (options.check) run(process.execPath, [CHECK_SCRIPT]);
  const packager = ensureDependencies();
  const args = buildPackagerArgs(options);
  console.log(`Packaging ${APP_NAME} for platform=${options.platform}, arch=${options.arch}`);
  run(process.execPath, [packager, ...args]);
  console.log(`Package output: ${options.out}`);
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
