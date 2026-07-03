# Contributing to Vibe Pet

Thanks for helping improve Vibe Pet. This project connects desktop AI coding
agent activity to animated desktop pets and BLE/Wi-Fi hardware displays, so
clear changes, careful testing, and good protocol notes all matter.

## Ways to Contribute

- Report bugs with reproduction steps, logs, platform details, and device model.
- Improve agent integrations, hooks, plugin support, or session monitoring.
- Add or improve hardware firmware profiles.
- Improve desktop UI, overlay behavior, translations, or documentation.
- Fix packaging, installer, or setup issues across macOS, Windows, and Linux.

For larger changes, please open an issue or discussion first so the design and
scope can be agreed before implementation.

## Download an Installer

If you only want to install a release build or compare your changes with a
packaged version, download an installer from the
[Releases page](https://github.com/Seeed-Solution/vibe-pet/releases).

- macOS: download the `.dmg` or `.zip` build.
- Windows: download the `.exe` installer.
- Linux: download the `.AppImage` or `.deb` package.

After installation, launch Vibe Pet and connect your device from the desktop
app. Hardware is optional if you only want to use the desktop pets.

## Development Setup

Requirements:

- Node.js 18 or newer.
- npm.
- PlatformIO, only if you are building firmware from source.
- Supported BLE/Wi-Fi hardware, only if you are testing hardware sync.

Install dependencies:

```bash
npm install
```

Start the desktop app:

```bash
npm start
```

Run in development mode:

```bash
npm run dev
```

Run the local web bridge directly:

```bash
npm run bridge:web:dev
```

Run project checks:

```bash
npm run check
```

`npm install`, `npm start`, and `npm run dev` automatically sync supported
hooks and plugins. To manage hooks manually:

```bash
npm run install:hooks
npm run uninstall:hooks
```

## Packaging and Installers

The packaging scripts support macOS, Linux, and Windows. App bundle output goes
to `dist/`.

```bash
npm run package:current
npm run package:mac
npm run package:linux
npm run package:win
npm run package:all
```

Installer output goes to `dist/installers/`. To build an installer for the
current platform:

```bash
npm run build
```

Platform-specific and all-target installer commands are also available:

```bash
npm run build:current
npm run build:mac
npm run build:linux
npm run build:win
npm run build:all
```

The equivalent installer aliases are:

```bash
npm run installer:current
npm run installer:mac
npm run installer:linux
npm run installer:win
npm run installer:all
```

Pass an architecture or target when needed:

```bash
npm run package:mac -- --arch arm64
npm run package:linux -- --arch x64
npm run build:win -- --arch x64
npm run build:linux -- --target AppImage
```

Installer defaults are DMG plus zip for macOS, NSIS for Windows, and AppImage
plus deb for Linux. Installers are unsigned; release distribution may still
require platform-specific signing or notarization. macOS installers must be
built on macOS.

## Firmware Build and App Flashing

The desktop app does not run PlatformIO when users flash firmware. For app
flashing, put a flashable `main.bin` in the matching hardware folder, for
example `src/firmware/esp-ai-mini-ext-tft-code-pet/main.bin`. ESP targets are flashed
with the bundled JavaScript esptool path. Non-ESP targets such as Wio Terminal
use Arduino CLI when available.

The commands below are for contributors who are building or directly uploading
firmware while developing.

App-supported display targets have direct projects, while lower-level shared
display profiles still live in `src/firmware/esp-display-code-pet`:

```bash
pio run -d src/firmware/esp-ai-mini-ext-tft-code-pet -t upload
pio run -d src/firmware/esp-ai-v3-tft-code-pet -t upload
pio run -d src/firmware/esp-display-code-pet -e lilygo_t_display_s3 -t upload
```

For ESP8266 OLED boards, set `CODE_PET_WIFI_SSID`,
`CODE_PET_WIFI_PASSWORD`, and `CODE_PET_BRIDGE_URL` in
`src/firmware/esp-display-code-pet/platformio.ini` so the device can poll
`/api/device-snapshot`.

## Project Areas

- `src/desktop/` contains the Electron desktop app, overlay, preload code, and
  desktop assets.
- `src/host/` contains the local bridge service, public web UI, agent state
  aggregation, and protocol handling.
- `src/hooks/` contains integrations for supported AI coding agents.
- `src/firmware/` contains firmware profiles for supported devices.
- `docs/` contains protocol and integration documentation.

## Coding Guidelines

- Follow the existing CommonJS style and nearby file conventions.
- Keep changes focused. Avoid unrelated formatting or large refactors in the
  same pull request.
- Preserve backwards compatibility for agent state payloads and hardware
  protocols unless the change is explicitly a breaking change.
- Update protocol docs when changing BLE, Wi-Fi, hook, or agent state formats.
- Update translations when changing user-facing text.
- Do not commit `node_modules`, local secrets, generated build outputs, or
  machine-specific files.

## Testing

Before opening a pull request, run:

```bash
npm run check
```

Also test the area you changed:

- Desktop changes: run `npm start` or `npm run dev` and verify the main window,
  overlay, and relevant pet states.
- Hook or agent changes: verify the target agent reports expected state changes.
- Protocol changes: verify the bridge still accepts old and new expected payloads
  where compatibility is intended.
- Firmware changes: build with PlatformIO for the changed environment, place the
  generated app-flashable image as `main.bin` for app testing, and flash a real
  device when possible.
- Packaging changes: run the relevant `npm run package:*`, `npm run build:*`, or
  `npm run installer:*` command for the target platform when feasible.

## Pull Request Checklist

- The change is focused and explained clearly.
- `npm run check` passes, or the reason it could not be run is documented.
- UI changes include screenshots or a short visual description.
- Hardware, firmware, or agent integration changes list the tested devices,
  platforms, or agent versions.
- Documentation and translations are updated when behavior or user-facing text
  changes.
- No secrets, local paths, or generated dependency folders are included.

## License

By contributing to this project, you agree that your contributions are licensed
under the MIT License.
