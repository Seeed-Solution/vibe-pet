"use strict";

const { app } = require("electron");

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {}

const UPDATE_FEED = {
  provider: "github",
  owner: "Seeed-Solution",
  repo: "vibe-pet",
  releaseType: "release",
};
const DEFAULT_CHECK_DELAY_MS = 2500;
const DEFAULT_INSTALL_DELAY_MS = 1200;

let started = false;
let installScheduled = false;

function debugEnabled(options = {}) {
  return !!options.debug || process.env.CODE_PET_AUTO_UPDATE_DEBUG === "1";
}

function log(level, message, detail, options = {}) {
  if (level === "debug" && !debugEnabled(options)) return;
  const args = [`[auto-update] ${message}`];
  if (detail !== undefined) args.push(detail);
  const writer = console[level] || console.log;
  writer(...args);
}

function autoUpdateDisabled(options = {}) {
  if (options.disabled) return "disabled_by_option";
  if (process.env.CODE_PET_DISABLE_AUTO_UPDATE === "1") return "disabled_by_env";
  if (!app.isPackaged && process.env.CODE_PET_ENABLE_DEV_AUTO_UPDATE !== "1") return "not_packaged";
  if (process.mas || process.windowsStore) return "unsupported_store_package";
  if (!autoUpdater) return "missing_electron_updater";
  return "";
}

function setupUpdaterLogger(options = {}) {
  autoUpdater.logger = {
    debug: (message) => log("debug", message, undefined, options),
    info: (message) => log("log", message, undefined, options),
    warn: (message) => log("warn", message, undefined, options),
    error: (message) => log("error", message, undefined, options),
  };
}

function versionLabel(info = {}) {
  return info.version || info.releaseName || info.tag || "unknown";
}

function setupAutoUpdater(options = {}) {
  if (started) return;
  started = true;

  const disabledReason = autoUpdateDisabled(options);
  if (disabledReason) {
    log("debug", `skip startup update check: ${disabledReason}`, undefined, options);
    return;
  }

  setupUpdaterLogger(options);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.setFeedURL(UPDATE_FEED);

  autoUpdater.on("checking-for-update", () => {
    log("log", "checking GitHub Releases for updates");
  });

  autoUpdater.on("update-available", (info) => {
    log("log", `update available: ${versionLabel(info)}`);
  });

  autoUpdater.on("update-not-available", (info) => {
    log("debug", `already current: ${versionLabel(info)}`, undefined, options);
  });

  autoUpdater.on("download-progress", (progress = {}) => {
    log("debug", `download ${Math.round(Number(progress.percent) || 0)}%`, undefined, options);
  });

  autoUpdater.on("update-downloaded", (info) => {
    if (installScheduled) return;
    installScheduled = true;
    log("log", `update downloaded: ${versionLabel(info)}; installing`);
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (err) {
        log("error", "failed to install downloaded update", err && err.message ? err.message : err, options);
      }
    }, Number(options.installDelayMs) || DEFAULT_INSTALL_DELAY_MS);
  });

  autoUpdater.on("error", (err) => {
    log("warn", "update check failed", err && err.message ? err.message : err, options);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log("warn", "update check failed", err && err.message ? err.message : err, options);
    });
  }, Number(options.delayMs) || DEFAULT_CHECK_DELAY_MS);
}

module.exports = {
  setupAutoUpdater,
};
