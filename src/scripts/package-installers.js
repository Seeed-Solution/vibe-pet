#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const APP_NAME = "Vibe Pet";
const DEFAULT_OUT = "dist/installers";
const CONFIG_FILE = path.join(ROOT, "electron-builder.json");
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
  all: "all",
  current: process.arch,
  x64: "x64",
  arm64: "arm64",
  ia32: "ia32",
  armv7: "armv7l",
  armv7l: "armv7l",
  universal: "universal",
};

const PLATFORM_FLAGS = {
  darwin: "--mac",
  linux: "--linux",
  win32: "--win",
};

const DEFAULT_TARGETS = {
  darwin: ["dmg", "zip"],
  linux: ["AppImage", "deb"],
  win32: ["nsis"],
};

const SUPPORTED_ARCHES = {
  darwin: ["x64", "arm64", "universal"],
  linux: ["x64", "arm64", "armv7l"],
  win32: ["x64", "arm64", "ia32"],
};

function takeValue(argv, index) {
  const arg = argv[index];
  const eq = arg.indexOf("=");
  if (eq >= 0) return { value: arg.slice(eq + 1), consumed: 0 };
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
    throw new Error(`Unsupported arch "${value}". Use current, all, x64, arm64, ia32, armv7l, or universal.`);
  }
  return arch;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    platform: "current",
    arch: "current",
    out: DEFAULT_OUT,
    check: true,
    publish: "never",
    targets: [],
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
    } else if (arg === "--publish" || arg.startsWith("--publish=")) {
      const result = takeValue(argv, i);
      options.publish = result.value || "never";
      i += result.consumed;
    } else if (arg === "--target" || arg.startsWith("--target=")) {
      const result = takeValue(argv, i);
      options.targets.push(...splitCsv(result.value));
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
  console.log(`Usage: node src/scripts/package-installers.js [options]

Options:
  --platform <current|all|darwin|linux|win32>  Target platform. Default: current.
  --arch <current|all|x64|arm64|ia32|armv7l>  Target architecture. Default: current.
  --target <target[,target]>                   Override installer target, such as nsis, dmg, AppImage, deb.
  --out <dir>                                  Output directory. Default: dist/installers.
  --publish <never|always|onTag|onTagOrDraft>  electron-builder publish mode. Default: never.
  --skip-check                                 Skip syntax checks before packaging.

Default installer targets:
  darwin: dmg, zip
  linux: AppImage, deb
  win32: nsis

Examples:
  npm run build
  npm run build:all
  npm run build:win -- --arch x64
  npm run build:mac -- --arch arm64
  npm run build:linux -- --target AppImage
  npm run build:current
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

function builderScript() {
  return path.join(ROOT, "node_modules", "electron-builder", "cli.js");
}

function ensureDependencies() {
  const command = builderScript();
  if (fs.existsSync(command)) return command;
  throw new Error("electron-builder was not found. Run npm install before building installers.");
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

function targetPlatforms(platform) {
  if (platform === "all") return ["darwin", "linux", "win32"];
  return [platform];
}

function targetsForPlatform(options, platform) {
  return options.targets.length ? options.targets : DEFAULT_TARGETS[platform];
}

function archFlagsForPlatform(arch, platform) {
  const supported = SUPPORTED_ARCHES[platform];
  const arches = arch === "all" ? supported : [arch];
  const unsupported = arches.filter((item) => !supported.includes(item));
  if (unsupported.length) {
    throw new Error(`${platform} does not support arch: ${unsupported.join(", ")}.`);
  }
  return arches.map((item) => `--${item}`);
}

function assertHostCanBuild(platform) {
  if (platform === "darwin" && process.platform !== "darwin") {
    throw new Error("macOS DMG installers must be built on macOS. Run this script on a macOS machine or CI runner for --platform darwin.");
  }
}

function outputPathForConfig(out) {
  const relative = path.relative(ROOT, out);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return out;
}

function materializeBuilderConfig(options) {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  config.directories = {
    ...(config.directories || {}),
    output: outputPathForConfig(options.out),
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-pet-builder-"));
  const configFile = path.join(tempDir, "electron-builder.json");
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  return {
    file: configFile,
    dispose: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

function buildArgs(options, platform, configFile) {
  return [
    PLATFORM_FLAGS[platform],
    ...targetsForPlatform(options, platform),
    ...archFlagsForPlatform(options.arch, platform),
    "--publish",
    options.publish,
    "--config",
    configFile,
  ];
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const platforms = targetPlatforms(options.platform);
  for (const platform of platforms) {
    assertHostCanBuild(platform);
    archFlagsForPlatform(options.arch, platform);
  }

  ensureIconAssets(options);
  if (options.check) run(process.execPath, [CHECK_SCRIPT]);

  const builder = ensureDependencies();
  const builderConfig = materializeBuilderConfig(options);
  try {
    for (const platform of platforms) {
      const targets = targetsForPlatform(options, platform).join(", ");
      const arches = options.arch === "all" ? SUPPORTED_ARCHES[platform].join(", ") : options.arch;
      console.log(`Building ${APP_NAME} installer for platform=${platform}, arch=${arches}, target=${targets}`);
      run(process.execPath, [builder, ...buildArgs(options, platform, builderConfig.file)]);
    }
  } finally {
    builderConfig.dispose();
  }

  console.log(`Installer output: ${options.out}`);
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
