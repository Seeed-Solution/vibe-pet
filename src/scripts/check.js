"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const roots = ["src"];
const jsExts = new Set([".js", ".mjs", ".cjs"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && jsExts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

let failed = false;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
    if (result.status !== 0) failed = true;
  }
}

const pythonFiles = ["src/hooks/hermes-plugin/__init__.py"];
for (const file of pythonFiles) {
  if (!fs.existsSync(file)) continue;
  const result = spawnSync("python3", ["-m", "py_compile", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log("Vibe Pet syntax check passed.");
