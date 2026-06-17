#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const MIN_NODE_MAJOR = 18;

function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    start: argv.includes("--start"),
    dev: argv.includes("--dev"),
    noHooks: argv.includes("--no-hooks"),
    check: argv.includes("--check"),
  };
}

function printHelp() {
  console.log(`Usage: node src/scripts/setup.js [options]

Options:
  --start      Launch the desktop app after installation.
  --dev        Launch hot reload development mode after installation.
  --check      Run npm run check after installation.
  --no-hooks   Install dependencies without syncing hooks/plugins.
`);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
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

function assertNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new Error(`Vibe Pet requires Node.js ${MIN_NODE_MAJOR}+; current version is ${process.version}.`);
  }
}

function installDependencies(options) {
  const npm = npmCommand();
  const hasLock = fs.existsSync(path.join(ROOT, "package-lock.json"));
  const args = [hasLock ? "ci" : "install"];
  run(npm, args, {
    env: {
      ...process.env,
      VIBE_PET_SKIP_HOOKS: "1",
    },
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  assertNodeVersion();
  installDependencies(options);
  const npm = npmCommand();
  if (!options.noHooks) run(npm, ["run", "install:hooks"]);
  if (options.check) run(npm, ["run", "check"]);
  if (options.dev) run(npm, ["run", "dev"]);
  else if (options.start) run(npm, ["start"]);
  else {
    console.log("Vibe Pet is installed. Run `npm start` to launch the desktop app.");
  }
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
