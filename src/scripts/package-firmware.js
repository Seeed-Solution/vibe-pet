#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const FIRMWARE_ROOT = path.join(ROOT, "src", "firmware");
const MAIN_BIN_NAME = "main.bin";
const PIO_COMMAND = process.platform === "win32" ? "pio.exe" : "pio";

const TARGETS = [
  {
    id: "wio_terminal",
    aliases: ["wio", "wio-terminal-code-pet"],
    name: "Wio Terminal",
    dir: "wio-terminal-code-pet",
    env: "wio_terminal",
    packer: "copy",
  },
  {
    id: "esp_ai_mini_ext_tft",
    aliases: ["esp-ai-mini-ext-tft-code-pet"],
    name: "ESP-AI-MINI AI Dev Kit",
    dir: "esp-ai-mini-ext-tft-code-pet",
    env: "code_pet",
    packer: "esp",
  },
  {
    id: "esp_ai_v3_v4_tft",
    aliases: ["esp_ai_common_3_tft", "esp_ai_common_4_tft", "esp-ai-v3-tft-code-pet"],
    name: "ESP-AI v3/v4 Dev Board",
    dir: "esp-ai-v3-tft-code-pet",
    env: "code_pet",
    packer: "esp",
  },
  {
    id: "sensecap_indicator",
    aliases: ["sensecap", "sensecap-indicator-code-pet"],
    name: "SenseCAP Indicator",
    dir: "sensecap-indicator-code-pet",
    env: "code_pet",
    packer: "esp",
  },
  {
    id: "m5stack_cores3",
    aliases: ["m5stack-cores3-code-pet"],
    name: "M5Stack CoreS3",
    dir: "m5stack-cores3-code-pet",
    env: "code_pet",
    packer: "esp",
  },
];

function takeValue(argv, index) {
  const value = argv[index];
  const eq = value.indexOf("=");
  if (eq >= 0) return { value: value.slice(eq + 1), consumed: 0 };
  return { value: argv[index + 1], consumed: 1 };
}

function parseArgs(argv) {
  const options = {
    targets: [],
    build: true,
    outName: MAIN_BIN_NAME,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--skip-build") {
      options.build = false;
    } else if (arg === "--target" || arg.startsWith("--target=")) {
      const result = takeValue(argv, i);
      if (!result.value) throw new Error("--target requires a value.");
      options.targets.push(...splitList(result.value));
      i += result.consumed;
    } else if (arg === "--out-name" || arg.startsWith("--out-name=")) {
      const result = takeValue(argv, i);
      if (!result.value) throw new Error("--out-name requires a value.");
      options.outName = result.value;
      i += result.consumed;
    } else if (!arg.startsWith("-")) {
      options.targets.push(...splitList(arg));
    } else {
      throw new Error(`Unknown argument "${arg}".`);
    }
  }

  if (path.basename(options.outName) !== options.outName) {
    throw new Error("--out-name must be a file name, not a path.");
  }

  return options;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`Usage: node src/scripts/package-firmware.js [options]

Build PlatformIO firmware projects and write app-flashable main.bin files.

Options:
  --target <id|dir>   Package one target. Can be repeated or comma-separated.
  --skip-build        Reuse existing .pio build outputs.
  --out-name <file>   Output file name inside each firmware directory. Default: main.bin.
  --list              Print supported targets.

Examples:
  npm run firmware:package
  npm run firmware:package -- --target esp_ai_mini_ext_tft
  npm run firmware:package -- --target wio_terminal,m5stack_cores3 --skip-build
`);
}

function printTargets() {
  console.log("Supported firmware targets:");
  for (const target of TARGETS) {
    const aliases = target.aliases.length ? ` aliases=${target.aliases.join(",")}` : "";
    console.log(`  ${target.id}  ${target.name}  dir=${target.dir} env=${target.env}${aliases}`);
  }
}

function normalizeTargetName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/");
}

function targetKeys(target) {
  return [target.id, target.dir, target.name, target.env, ...(target.aliases || [])].map(normalizeTargetName);
}

function resolveTargets(values) {
  if (!values.length || values.some((value) => normalizeTargetName(value) === "all")) {
    return TARGETS.map(prepareTarget);
  }

  const selected = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeTargetName(value);
    const target = TARGETS.find((item) => targetKeys(item).includes(normalized));
    if (!target) {
      throw new Error(`Unknown firmware target "${value}". Run with --list to see valid targets.`);
    }
    if (!seen.has(target.id)) {
      selected.push(prepareTarget(target));
      seen.add(target.id);
    }
  }
  return selected;
}

function prepareTarget(target) {
  return {
    ...target,
    projectDir: path.join(FIRMWARE_ROOT, target.dir),
    outputPath: path.join(FIRMWARE_ROOT, target.dir, MAIN_BIN_NAME),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("PlatformIO CLI was not found. Install PlatformIO and make sure pio is on PATH.");
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result;
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("PlatformIO CLI was not found. Install PlatformIO and make sure pio is on PATH.");
    }
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}${stderr}`);
  }
  return result.stdout;
}

function buildTarget(target) {
  run(PIO_COMMAND, ["run", "-d", target.projectDir, "-e", target.env]);
}

function readMetadata(target) {
  const stdout = capture(PIO_COMMAND, [
    "project",
    "metadata",
    "-d",
    target.projectDir,
    "-e",
    target.env,
    "--json-output",
  ]);
  const parsed = JSON.parse(stdout);
  const metadata = parsed[target.env];
  if (!metadata) throw new Error(`PlatformIO metadata did not include environment "${target.env}".`);
  return metadata;
}

function parseAddress(value, label) {
  if (typeof value === "number") return value;
  const raw = String(value || "").trim();
  const parsed = raw.toLowerCase().startsWith("0x") ? Number.parseInt(raw, 16) : Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid flash address for ${label}: ${value}`);
  }
  return parsed;
}

function formatAddress(value) {
  return `0x${value.toString(16)}`;
}

function appBinPath(target, metadata) {
  if (typeof metadata.prog_path === "string" && metadata.prog_path) {
    const fromProg = metadata.prog_path.replace(/\.(elf|axf)$/i, ".bin");
    if (fs.existsSync(fromProg)) return fromProg;
  }

  const fallback = path.join(target.projectDir, ".pio", "build", target.env, "firmware.bin");
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(`Could not find firmware.bin for ${target.name}.`);
}

function outputPathFor(target, options) {
  return path.join(target.projectDir, options.outName);
}

function writeFileAtomically(filePath, data) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, filePath);
}

function copyMainBin(target, metadata, options) {
  const source = appBinPath(target, metadata);
  const outputPath = outputPathFor(target, options);
  writeFileAtomically(outputPath, fs.readFileSync(source));
  return {
    outputPath,
    size: fs.statSync(outputPath).size,
    segments: [{ address: 0, path: source }],
  };
}

function espSegments(target, metadata) {
  const extra = metadata.extra || {};
  const flashImages = Array.isArray(extra.flash_images) ? extra.flash_images : [];
  const segments = flashImages.map((item, index) => {
    if (!item || !item.path) throw new Error(`Invalid flash image metadata for ${target.name}.`);
    const segmentPath = path.isAbsolute(item.path) ? item.path : path.resolve(target.projectDir, item.path);
    return {
      address: parseAddress(item.offset, item.path || `flash image ${index + 1}`),
      path: segmentPath,
    };
  });

  segments.push({
    address: parseAddress(extra.application_offset || "0x10000", "application"),
    path: appBinPath(target, metadata),
  });

  return segments;
}

function mergeEspMainBin(target, metadata, options) {
  const segments = espSegments(target, metadata).sort((a, b) => a.address - b.address);
  const chunks = [];
  let cursor = 0;

  for (const segment of segments) {
    if (!fs.existsSync(segment.path)) {
      throw new Error(`Missing firmware segment for ${target.name}: ${segment.path}`);
    }
    const data = fs.readFileSync(segment.path);
    if (segment.address < cursor) {
      throw new Error(
        `Firmware segment overlaps previous data at ${formatAddress(segment.address)}: ${segment.path}`
      );
    }
    if (segment.address > cursor) {
      chunks.push(Buffer.alloc(segment.address - cursor, 0xff));
      cursor = segment.address;
    }
    chunks.push(data);
    cursor += data.length;
  }

  const outputPath = outputPathFor(target, options);
  writeFileAtomically(outputPath, Buffer.concat(chunks));
  return {
    outputPath,
    size: fs.statSync(outputPath).size,
    segments,
  };
}

function packageTarget(target, options) {
  if (!fs.existsSync(path.join(target.projectDir, "platformio.ini"))) {
    throw new Error(`Missing PlatformIO project: ${target.projectDir}`);
  }

  console.log(`\n== ${target.name} ==`);
  console.log(`Project: ${path.relative(ROOT, target.projectDir)}  env=${target.env}`);
  if (options.build) buildTarget(target);
  else console.log("Skipping PlatformIO build; using existing .pio outputs.");

  const metadata = readMetadata(target);
  const result = target.packer === "esp" ? mergeEspMainBin(target, metadata, options) : copyMainBin(target, metadata, options);
  const relativeOutput = path.relative(ROOT, result.outputPath);
  console.log(`Wrote ${relativeOutput} (${result.size} bytes)`);
  if (target.packer === "esp") {
    const layout = result.segments
      .map((segment) => `${formatAddress(segment.address)}:${path.basename(segment.path)}`)
      .join(", ");
    console.log(`Merged ESP image layout: ${layout}`);
  }
  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.list) {
    printTargets();
    return;
  }

  const targets = resolveTargets(options.targets);
  const results = targets.map((target) => packageTarget(target, options));
  console.log(`\nPackaged ${results.length} firmware image${results.length === 1 ? "" : "s"}.`);
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
