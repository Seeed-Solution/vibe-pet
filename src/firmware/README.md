# Firmware Targets

Each supported hardware target has a direct PlatformIO project in this folder.
The per-board display projects reuse `esp-display-code-pet/src/main.cpp` and keep
board-specific pins, libraries, device names, and transport settings in their own
`platformio.ini`.

For desktop-app flashing, place the ready-to-flash image at `main.bin` inside the
matching hardware folder. ESP targets use the bundled JavaScript esptool path and
write `main.bin` at flash address `0x0`, so `main.bin` should be a merged image
when the board needs bootloader, partition, and app segments.

Build all app-supported `main.bin` images from the repository root:

```bash
npm run firmware:package
```

| Directory | Hardware | Transport |
| --- | --- | --- |
| `wio-terminal-code-pet` | Wio Terminal | BLE |
| `esp-ai-mini-ext-tft-code-pet` | ESP-AI-MINI AI Dev Kit | BLE |
| `sensecap-indicator-code-pet` | SenseCAP Indicator | BLE |

Example contributor build/upload commands:

```bash
pio run -d src/firmware/esp-ai-mini-ext-tft-code-pet -t upload
```

ESP-AI-MINI AI Dev Kit follows the official 2.4-inch profile: `ST7789_2_DRIVER`,
TFT setup `WIDTH=240`, `HEIGHT=320`, logical screen `320x240`, SPI pins
`MOSI=42`, `SCLK=39`, `CS=13`, `DC=7`, and low-active backlight `BL=3`.
