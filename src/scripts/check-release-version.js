#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readJson(relativePath) {
  const file = path.join(ROOT, relativePath);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    throw new Error(`Failed to read ${relativePath}: ${message}`);
  }
}

function releaseTag() {
  const raw =
    process.argv[2] ||
    process.env.RELEASE_TAG ||
    process.env.GITHUB_REF_NAME ||
    process.env.GITHUB_REF ||
    "";
  const value = String(raw).trim();
  if (value.startsWith("refs/tags/")) return value.slice("refs/tags/".length);
  return value;
}

function fail(message) {
  console.error(`[release-version] ${message}`);
  process.exit(1);
}

function main() {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const version = String(pkg.version || "").trim();
  const tag = releaseTag();

  if (!version) fail("package.json version is missing.");
  if (!tag) fail("Release tag is missing. Pass a tag argument or set RELEASE_TAG/GITHUB_REF_NAME.");

  const expectedTag = `v${version}`;
  if (tag !== expectedTag) {
    fail(`Release tag "${tag}" does not match package.json version "${version}". Expected "${expectedTag}".`);
  }

  const lockVersion = String(lock.version || "").trim();
  const rootLockVersion = String(lock.packages && lock.packages[""] && lock.packages[""].version || "").trim();
  if (lockVersion !== version) {
    fail(`package-lock.json version "${lockVersion}" does not match package.json version "${version}".`);
  }
  if (rootLockVersion !== version) {
    fail(`package-lock.json packages[""].version "${rootLockVersion}" does not match package.json version "${version}".`);
  }

  console.log(`[release-version] ${tag} matches package.json and package-lock.json version ${version}.`);
}

try {
  main();
} catch (err) {
  fail(err && err.message ? err.message : err);
}
