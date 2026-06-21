#include <Arduino.h>
#include <ArduinoJson.h>
#include <string.h>

#if defined(CODE_PET_DISPLAY_M5UNIFIED)
#include <M5Unified.h>
#elif defined(CODE_PET_DISPLAY_TFT_ESPI)
#include <TFT_eSPI.h>
#if defined(CODE_PET_USE_BACKLIGHT_CONTROL)
#include "backlight_control.h"
#endif
#elif defined(CODE_PET_DISPLAY_OLED)
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#endif

#if defined(CODE_PET_STATUS_PIXEL)
#include <Adafruit_NeoPixel.h>
#endif

#if defined(CODE_PET_HAS_BLE)
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#endif

#if defined(CODE_PET_USE_WIFI)
#if defined(ESP8266)
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#else
#include <WiFi.h>
#include <HTTPClient.h>
#endif
#endif

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
#include <lvgl.h>
class TFT_eSPI;
extern TFT_eSPI tft;
#endif

#ifndef CODE_PET_DEVICE_NAME
#define CODE_PET_DEVICE_NAME "VibePet-ESP-Display"
#endif

#define SERVICE_UUID "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001"
#define STATE_CHAR_UUID "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002"

#ifndef CP_OLED_WIDTH
#define CP_OLED_WIDTH 128
#endif
#ifndef CP_OLED_HEIGHT
#define CP_OLED_HEIGHT 64
#endif
#ifndef CP_OLED_RST
#define CP_OLED_RST -1
#endif
#ifndef CP_STATUS_PIXEL_PIN
#define CP_STATUS_PIXEL_PIN 46
#endif
#ifndef CP_STATUS_PIXEL_COUNT
#define CP_STATUS_PIXEL_COUNT 1
#endif
#ifndef CP_STATUS_PIXEL_BRIGHTNESS
#define CP_STATUS_PIXEL_BRIGHTNESS 56
#endif
#ifndef TFT_BACKLIGHT_ON
#define TFT_BACKLIGHT_ON HIGH
#endif

#define CODE_PET_DISCONNECTED_LABEL "Disconnected"
#define CODE_PET_OUTPUT_MAX_CHARS 120

#if defined(CODE_PET_STATUS_PIXEL)
Adafruit_NeoPixel statusPixel(CP_STATUS_PIXEL_COUNT, CP_STATUS_PIXEL_PIN, NEO_GRB + NEO_KHZ800);
#endif

struct VibePetPacket {
  String state = "idle";
  String stateLabel = "";
  String agent = "agent";
  String event = "";
  String title = "";
  String output = "";
  String personaSlug = "lulu";
  String personaName = "Lulu";
  String personaKind = "";
  String spriteUrl = "";
  String theme = "day";
  int activeCount = 0;
  unsigned long receivedAt = 0;
};

VibePetPacket pet;
#ifndef CODE_PET_BLE_PAYLOAD_QUEUE_SIZE
#define CODE_PET_BLE_PAYLOAD_QUEUE_SIZE 24
#endif
String incomingPayloadQueue[CODE_PET_BLE_PAYLOAD_QUEUE_SIZE];
volatile uint8_t incomingPayloadHead = 0;
volatile uint8_t incomingPayloadTail = 0;
bool pendingPayload = false;
bool bleConnected = false;
bool uiDirty = true;
uint8_t frameIndex = 0;
unsigned long lastFrameAt = 0;
unsigned long lastPollAt = 0;
unsigned long lastWifiAttemptAt = 0;

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
static lv_disp_draw_buf_t lvDrawBuffer;
static lv_color_t lvBufferA[320 * 20];
static lv_color_t lvBufferB[320 * 20];
static lv_disp_drv_t lvDisplayDriver;
static lv_obj_t *lvRoot = nullptr;
static lv_obj_t *lvHeader = nullptr;
static lv_obj_t *lvStatus = nullptr;
static lv_obj_t *lvFooterClip = nullptr;
static lv_obj_t *lvFooter = nullptr;
static lv_obj_t *lvImage = nullptr;
static lv_obj_t *lvFallback = nullptr;
static lv_obj_t *lvFallbackAgent = nullptr;
static lv_obj_t *lvFallbackState = nullptr;
static lv_obj_t *lvFallbackPersona = nullptr;
static lv_obj_t *lvLoadPanel = nullptr;
static lv_obj_t *lvLoadTitle = nullptr;
static lv_obj_t *lvLoadPercent = nullptr;
static lv_obj_t *lvLoadTrack = nullptr;
static lv_obj_t *lvLoadFill = nullptr;
static uint32_t lvLastTickAt = 0;
static String lvFooterTickerText = "";
static bool lvFooterTickerDone = false;

#ifndef CODE_PET_DYNAMIC_PERSONA_WIDTH
#define CODE_PET_DYNAMIC_PERSONA_WIDTH 144
#endif
#ifndef CODE_PET_DYNAMIC_PERSONA_HEIGHT
#define CODE_PET_DYNAMIC_PERSONA_HEIGHT 156
#endif
#ifndef CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES
#define CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES 2
#endif
#define CODE_PET_DYNAMIC_PERSONA_BYTES (CODE_PET_DYNAMIC_PERSONA_WIDTH * CODE_PET_DYNAMIC_PERSONA_HEIGHT * 2)

enum DynamicPersonaFormat : uint8_t {
  DYNAMIC_PERSONA_RAW_RGB565,
  DYNAMIC_PERSONA_RLE_RGB565,
};

static uint8_t dynamicPersonaPixels[CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES][CODE_PET_DYNAMIC_PERSONA_BYTES];
static uint8_t dynamicPersonaPendingPixels[CODE_PET_DYNAMIC_PERSONA_BYTES];
static lv_img_dsc_t dynamicPersonaImages[CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES] = {
  {
    .header = {
      .cf = LV_IMG_CF_TRUE_COLOR,
      .w = CODE_PET_DYNAMIC_PERSONA_WIDTH,
      .h = CODE_PET_DYNAMIC_PERSONA_HEIGHT,
    },
    .data_size = CODE_PET_DYNAMIC_PERSONA_BYTES,
    .data = dynamicPersonaPixels[0],
  },
  {
    .header = {
      .cf = LV_IMG_CF_TRUE_COLOR,
      .w = CODE_PET_DYNAMIC_PERSONA_WIDTH,
      .h = CODE_PET_DYNAMIC_PERSONA_HEIGHT,
    },
    .data_size = CODE_PET_DYNAMIC_PERSONA_BYTES,
    .data = dynamicPersonaPixels[1],
  },
};
static String dynamicPersonaId = "";
static String dynamicPersonaSlug = "";
static String dynamicPersonaTransferSlug = "";
static bool dynamicPersonaReady = false;
static bool dynamicPersonaReceiving = false;
static bool dynamicPersonaShowLoading = true;
static DynamicPersonaFormat dynamicPersonaFormat = DYNAMIC_PERSONA_RAW_RGB565;
static uint16_t dynamicPersonaExpectedSeq = 0;
static uint32_t dynamicPersonaReceived = 0;
static uint8_t dynamicPersonaFrameCount = 1;
static uint8_t dynamicPersonaTransferFrameCount = 1;
static uint8_t dynamicPersonaTransferFrameIndex = 0;
static uint8_t dynamicPersonaReceivedFrameMask = 0;
static uint8_t dynamicPersonaLastProgressPercent = 0;
static uint8_t dynamicPersonaRleTriple[3] = {0, 0, 0};
static uint8_t dynamicPersonaRleIndex = 0;
#endif

static void noteDisplayActivity() {
#if defined(CODE_PET_USE_BACKLIGHT_CONTROL)
  resetBacklightTimer();
#endif
}

static void updateDisplayPower() {
#if defined(CODE_PET_USE_BACKLIGHT_CONTROL)
  updateBacklight();
#endif
}

static uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

static uint32_t hashText(const String &text) {
  uint32_t hash = 2166136261u;
  for (size_t i = 0; i < text.length(); i++) {
    hash ^= static_cast<uint8_t>(text[i]);
    hash *= 16777619u;
  }
  return hash;
}

static uint16_t dimColor(uint16_t color, uint8_t percent) {
  uint8_t r = ((color >> 11) & 0x1F) * 255 / 31;
  uint8_t g = ((color >> 5) & 0x3F) * 255 / 63;
  uint8_t b = (color & 0x1F) * 255 / 31;
  return rgb565(r * percent / 100, g * percent / 100, b * percent / 100);
}

static uint8_t utf8CodepointBytes(uint8_t lead) {
  if ((lead & 0x80) == 0) return 1;
  if ((lead & 0xE0) == 0xC0) return 2;
  if ((lead & 0xF0) == 0xE0) return 3;
  if ((lead & 0xF8) == 0xF0) return 4;
  return 0;
}

static bool hasValidUtf8Continuation(const String &text, size_t start, uint8_t byteCount) {
  if (byteCount == 0 || start + byteCount > text.length()) return false;
  for (uint8_t i = 1; i < byteCount; i++) {
    if ((static_cast<uint8_t>(text[start + i]) & 0xC0) != 0x80) return false;
  }
  return true;
}

static bool appendUtf8Codepoints(String &out, const String &text, uint8_t maxChars) {
  size_t i = 0;
  uint8_t chars = 0;
  bool truncated = false;
  while (i < text.length()) {
    uint8_t byteCount = utf8CodepointBytes(static_cast<uint8_t>(text[i]));
    if (!hasValidUtf8Continuation(text, i, byteCount)) {
      truncated = true;
      break;
    }
    if (chars >= maxChars) {
      truncated = true;
      break;
    }
    out += text.substring(i, i + byteCount);
    i += byteCount;
    chars++;
  }
  return truncated;
}

static String cleanText(const String &input, uint8_t maxLen) {
  String out = input;
  out.trim();
  out.replace("\n", " ");
  out.replace("\r", " ");
  while (out.indexOf("  ") >= 0) out.replace("  ", " ");
  String clipped;
  bool truncated = appendUtf8Codepoints(clipped, out, maxLen > 3 ? maxLen - 3 : maxLen);
  if (truncated && maxLen > 3) clipped += "...";
  return clipped;
}

static void stateRgb(const String &state, uint8_t &r, uint8_t &g, uint8_t &b) {
  if (state == "thinking") {
    r = 211; g = 139; b = 31;
  } else if (state == "working" || state == "typing") {
    r = 28; g = 154; b = 115;
  } else if (state == "building") {
    r = 221; g = 104; b = 52;
  } else if (state == "juggling") {
    r = 111; g = 98; b = 201;
  } else if (state == "attention") {
    r = 224; g = 120; b = 56;
  } else if (state == "notification" || state == "permission") {
    r = 214; g = 69; b = 69;
  } else if (state == "error") {
    r = 185; g = 33; b = 44;
  } else if (state == "sweeping") {
    r = 30; g = 132; b = 152;
  } else if (state == "sleeping") {
    r = 64; g = 74; b = 94;
  } else {
    r = 45; g = 125; b = 210;
  }
}

static uint16_t stateColor(const String &state) {
  uint8_t r, g, b;
  stateRgb(state, r, g, b);
  return rgb565(r, g, b);
}

static uint16_t personaColor() {
  if (pet.personaSlug == "lulu" || pet.personaName == "Lulu" || pet.personaName == "噜噜") {
    return rgb565(183, 126, 83);
  }
  uint32_t h = hashText(pet.personaSlug + pet.personaName);
  uint8_t r = 80 + ((h >> 0) & 0x7F);
  uint8_t g = 80 + ((h >> 8) & 0x7F);
  uint8_t b = 80 + ((h >> 16) & 0x7F);
  return rgb565(r, g, b);
}

static bool isNightTheme() {
  return pet.theme == "night" || pet.theme == "dark";
}

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
extern const lv_img_dsc_t *codePetPersonaFrame(const String &slug, const String &state, uint8_t frameIndex);
extern bool codePetPersonaAvailable(const String &slug);

#ifndef CODE_PET_LVGL_TFT_SWAP_BYTES
#define CODE_PET_LVGL_TFT_SWAP_BYTES 0
#endif

#ifndef CODE_PET_LVGL_TFT_SWAP_RB
#define CODE_PET_LVGL_TFT_SWAP_RB 0
#endif

#ifndef CODE_PET_LVGL_FALLBACK_PERSONA_SLUG
#define CODE_PET_LVGL_FALLBACK_PERSONA_SLUG "lulu"
#endif

static lv_color_t lvColor(uint16_t color) {
  lv_color_t value;
  value.full = color;
  return value;
}

#if CODE_PET_LVGL_TFT_SWAP_RB
static uint16_t swapRgb565RedBlue(uint16_t color) {
  return ((color & 0xF800) >> 11) | (color & 0x07E0) | ((color & 0x001F) << 11);
}
#endif

static void lvFlush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *color) {
  uint16_t width = area->x2 - area->x1 + 1;
  uint16_t height = area->y2 - area->y1 + 1;
  uint32_t count = static_cast<uint32_t>(width) * height;
  uint16_t *pixels = reinterpret_cast<uint16_t *>(&color->full);
#if CODE_PET_LVGL_TFT_SWAP_RB
  for (uint32_t i = 0; i < count; i++) {
    pixels[i] = swapRgb565RedBlue(pixels[i]);
  }
#endif
  tft.startWrite();
  tft.setAddrWindow(area->x1, area->y1, width, height);
  tft.pushColors(pixels, count, CODE_PET_LVGL_TFT_SWAP_BYTES);
  tft.endWrite();
  lv_disp_flush_ready(disp);
}

static void ensureLvglUi();
static bool renderPersonaWithLvgl(uint16_t bg, uint16_t header, uint16_t panel, uint16_t ink, uint16_t muted, uint16_t accent);
static const lv_img_dsc_t *dynamicPersonaFrameForSlug(const String &slug);
static void clearDynamicPersonaFrame();
static void applyDynamicPersonaPayload(JsonVariantConst src);
#endif

#if defined(CODE_PET_DISPLAY_M5UNIFIED)
static int16_t screenW() { return M5.Display.width(); }
static int16_t screenH() { return M5.Display.height(); }
static void displayBegin() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.setTextDatum(top_left);
}
static void fillScreen(uint16_t c) { M5.Display.fillScreen(c); }
static void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { M5.Display.fillRect(x, y, w, h, c); }
static void drawRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { M5.Display.drawRect(x, y, w, h, c); }
static void fillRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { M5.Display.fillRoundRect(x, y, w, h, r, c); }
static void drawRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { M5.Display.drawRoundRect(x, y, w, h, r, c); }
static void fillCircle(int16_t x, int16_t y, int16_t r, uint16_t c) { M5.Display.fillCircle(x, y, r, c); }
static void drawLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t c) { M5.Display.drawLine(x0, y0, x1, y1, c); }
static void drawText(const String &text, int16_t x, int16_t y, uint8_t size, uint16_t color, uint16_t bg) {
  M5.Display.setTextSize(size);
  M5.Display.setTextColor(color, bg);
  M5.Display.setCursor(x, y);
  M5.Display.print(text);
}
#elif defined(CODE_PET_DISPLAY_TFT_ESPI)
TFT_eSPI tft;
static int16_t screenW() { return tft.width(); }
static int16_t screenH() { return tft.height(); }
static void displayBegin() {
  tft.init();
  tft.setRotation(CP_TFT_ROTATION);
#if defined(CODE_PET_USE_LVGL)
  lv_init();
  lv_disp_draw_buf_init(&lvDrawBuffer, lvBufferA, lvBufferB, sizeof(lvBufferA) / sizeof(lvBufferA[0]));
  lv_disp_drv_init(&lvDisplayDriver);
  lvDisplayDriver.hor_res = screenW();
  lvDisplayDriver.ver_res = screenH();
  lvDisplayDriver.flush_cb = lvFlush;
  lvDisplayDriver.draw_buf = &lvDrawBuffer;
  lv_disp_drv_register(&lvDisplayDriver);
  lvLastTickAt = millis();
#endif
#if defined(CODE_PET_USE_BACKLIGHT_CONTROL)
  initBacklight();
  setBacklightOn();
#elif defined(TFT_BL) && TFT_BL >= 0
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, TFT_BACKLIGHT_ON);
#endif
}
static void fillScreen(uint16_t c) { tft.fillScreen(c); }
static void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { tft.fillRect(x, y, w, h, c); }
static void drawRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { tft.drawRect(x, y, w, h, c); }
static void fillRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { tft.fillRoundRect(x, y, w, h, r, c); }
static void drawRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { tft.drawRoundRect(x, y, w, h, r, c); }
static void fillCircle(int16_t x, int16_t y, int16_t r, uint16_t c) { tft.fillCircle(x, y, r, c); }
static void drawLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t c) { tft.drawLine(x0, y0, x1, y1, c); }
static void drawText(const String &text, int16_t x, int16_t y, uint8_t size, uint16_t color, uint16_t bg) {
  tft.setTextSize(size);
  tft.setTextColor(color, bg);
  tft.setCursor(x, y);
  tft.print(text);
}
#elif defined(CODE_PET_DISPLAY_OLED)
Adafruit_SSD1306 display(CP_OLED_WIDTH, CP_OLED_HEIGHT, &Wire, CP_OLED_RST);
static int16_t screenW() { return display.width(); }
static int16_t screenH() { return display.height(); }
static uint16_t mono(uint16_t color) { return color == 0 ? SSD1306_BLACK : SSD1306_WHITE; }
static void displayBegin() {
#if CP_OLED_RST >= 0
  pinMode(CP_OLED_RST, OUTPUT);
  digitalWrite(CP_OLED_RST, LOW);
  delay(20);
  digitalWrite(CP_OLED_RST, HIGH);
#endif
  Wire.begin(CP_OLED_SDA, CP_OLED_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.display();
}
static void fillScreen(uint16_t c) { display.clearDisplay(); if (c) display.fillScreen(SSD1306_WHITE); }
static void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { display.fillRect(x, y, w, h, mono(c)); }
static void drawRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { display.drawRect(x, y, w, h, mono(c)); }
static void fillRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { display.fillRoundRect(x, y, w, h, r, mono(c)); }
static void drawRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { display.drawRoundRect(x, y, w, h, r, mono(c)); }
static void fillCircle(int16_t x, int16_t y, int16_t r, uint16_t c) { display.fillCircle(x, y, r, mono(c)); }
static void drawLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t c) { display.drawLine(x0, y0, x1, y1, mono(c)); }
static void drawText(const String &text, int16_t x, int16_t y, uint8_t size, uint16_t color, uint16_t bg) {
  display.setTextSize(size);
  display.setTextColor(mono(color), mono(bg));
  display.setCursor(x, y);
  display.print(text);
}
#endif

static void displayFlush() {
#if defined(CODE_PET_DISPLAY_OLED)
  display.display();
#endif
}

static void updateStatusPixel() {
#if defined(CODE_PET_STATUS_PIXEL)
  uint8_t r, g, b;
  stateRgb(pet.state, r, g, b);
  uint8_t brightness = CP_STATUS_PIXEL_BRIGHTNESS;
  if (!bleConnected) {
    brightness = (frameIndex % 2) ? 20 : 4;
  } else if (pet.state == "notification" || pet.state == "permission" || pet.state == "error") {
    brightness = (frameIndex % 2) ? 96 : 8;
  } else if (pet.state == "sleeping") {
    brightness = 10;
  }
  statusPixel.setBrightness(brightness);
  for (uint16_t i = 0; i < CP_STATUS_PIXEL_COUNT; i++) {
    statusPixel.setPixelColor(i, statusPixel.Color(r, g, b));
  }
  statusPixel.show();
#endif
}

static String stateLabel(const String &state) {
  if (state == "notification" || state == "permission") return "notify";
  return state.length() ? state : "idle";
}

static String displayStateLabel() {
  return pet.stateLabel.length() ? pet.stateLabel : stateLabel(pet.state);
}

static int petBob() {
  if (pet.state == "sleeping") return 1;
  if (pet.state == "thinking") return (frameIndex % 3) - 1;
  if (pet.state == "working" || pet.state == "typing" || pet.state == "building") return (frameIndex % 2) ? -3 : 0;
  if (pet.state == "juggling") return (frameIndex % 4) - 2;
  return (frameIndex % 2) ? -1 : 0;
}

static void renderPetFace(int16_t cx, int16_t cy, int16_t scale, uint16_t body, uint16_t accent, uint16_t ink, uint16_t face) {
  int bob = petBob();
  int faceW = 70 * scale / 10;
  int faceH = 42 * scale / 10;
  int bodyW = 54 * scale / 10;
  int bodyH = 20 * scale / 10;
  int faceX = cx - faceW / 2;
  int faceY = cy - faceH / 2 + bob;
  int bodyX = cx - bodyW / 2;
  int bodyY = faceY + faceH - 2;

  fillRoundRect(bodyX, bodyY, bodyW, bodyH, bodyH / 2, body);
  drawRoundRect(bodyX, bodyY, bodyW, bodyH, bodyH / 2, ink);
  fillRoundRect(faceX, faceY, faceW, faceH, 10, face);
  drawRoundRect(faceX, faceY, faceW, faceH, 10, ink);
  drawLine(cx, faceY - 8, cx, faceY - 1, ink);
  fillCircle(cx, faceY - 10, 4 + (pet.state == "notification" ? frameIndex % 2 : 0), accent);

  if (pet.state == "sleeping") {
    drawLine(faceX + faceW / 4, faceY + faceH / 2, faceX + faceW / 4 + 10, faceY + faceH / 2, ink);
    drawLine(faceX + faceW * 3 / 4 - 10, faceY + faceH / 2, faceX + faceW * 3 / 4, faceY + faceH / 2, ink);
    drawText("Z", faceX + faceW - 10, faceY + 2 - (frameIndex % 3), 1, ink, face);
  } else if (pet.state == "error") {
    int lx = faceX + faceW / 4;
    int rx = faceX + faceW * 3 / 4;
    int ey = faceY + faceH / 2;
    drawLine(lx - 5, ey - 5, lx + 5, ey + 5, ink);
    drawLine(lx + 5, ey - 5, lx - 5, ey + 5, ink);
    drawLine(rx - 5, ey - 5, rx + 5, ey + 5, ink);
    drawLine(rx + 5, ey - 5, rx - 5, ey + 5, ink);
  } else {
    int eyeOffset = pet.state == "thinking" ? ((frameIndex % 3) - 1) * 2 : 0;
    fillCircle(faceX + faceW / 4 + eyeOffset, faceY + faceH / 2, 5, ink);
    fillCircle(faceX + faceW * 3 / 4 + eyeOffset, faceY + faceH / 2, 5, ink);
  }

  if (pet.state == "working" || pet.state == "building" || pet.state == "attention") {
    drawLine(cx - 8, faceY + faceH - 10, cx + 8, faceY + faceH - 10, ink);
    drawLine(cx - 8, faceY + faceH - 7, cx + 8, faceY + faceH - 7, ink);
  } else {
    drawRoundRect(cx - 9, faceY + faceH - 13, 18, 8, 4, ink);
  }

  if (pet.state == "sweeping") {
    drawLine(bodyX + bodyW - 6, bodyY + 5, bodyX + bodyW + 28, bodyY + 18, accent);
    drawLine(bodyX + bodyW + 18, bodyY + 20, bodyX + bodyW + 36, bodyY + 20, accent);
  }

  if (pet.state == "juggling") {
    fillCircle(cx - 28, faceY - 8 - (frameIndex % 2) * 4, 4, accent);
    fillCircle(cx, faceY - 18 + (frameIndex % 2) * 4, 4, dimColor(accent, 70));
    fillCircle(cx + 28, faceY - 8 - (frameIndex % 2) * 4, 4, dimColor(accent, 85));
  }
}

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
static void ensureLvglUi() {
  if (lvRoot) return;
  const int16_t sw = screenW();
  const int16_t statusWidth = sw >= 280 ? 100 : 76;
  const int16_t headerWidth = sw > statusWidth + 24 ? sw - statusWidth - 24 : sw / 2;
  const int16_t footerWidth = sw > 16 ? sw - 16 : sw;
  const int16_t fallbackWidth = sw >= 200 ? 170 : sw - 24;
  const int16_t fallbackContentWidth = fallbackWidth > 24 ? fallbackWidth - 24 : fallbackWidth;
  const int16_t loadPanelWidth = sw >= 190 ? 164 : sw - 24;
  const int16_t loadTrackWidth = loadPanelWidth > 16 ? loadPanelWidth - 16 : loadPanelWidth;
  const int16_t loadTitleWidth = loadPanelWidth > 120 ? loadPanelWidth - 72 : loadPanelWidth / 2;

  lv_obj_set_style_bg_color(lv_scr_act(), lv_color_black(), 0);
  lv_obj_set_style_bg_opa(lv_scr_act(), LV_OPA_COVER, 0);

  lvRoot = lv_obj_create(lv_scr_act());
  lv_obj_remove_style_all(lvRoot);
  lv_obj_set_size(lvRoot, sw, screenH());
  lv_obj_set_style_bg_opa(lvRoot, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(lvRoot, 0, 0);
  lv_obj_set_style_pad_all(lvRoot, 0, 0);

  lvImage = lv_img_create(lvRoot);
  lv_obj_align(lvImage, LV_ALIGN_CENTER, 0, 0);

  lvHeader = lv_label_create(lvRoot);
  lv_obj_set_width(lvHeader, headerWidth);
  lv_label_set_long_mode(lvHeader, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_font(lvHeader, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvHeader, LV_ALIGN_TOP_LEFT, 8, 6);

  lvStatus = lv_label_create(lvRoot);
  lv_obj_set_width(lvStatus, statusWidth);
  lv_label_set_long_mode(lvStatus, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvStatus, LV_TEXT_ALIGN_RIGHT, 0);
  lv_obj_set_style_text_font(lvStatus, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvStatus, LV_ALIGN_TOP_RIGHT, -8, 6);

  lvFooterClip = lv_obj_create(lvRoot);
  lv_obj_remove_style_all(lvFooterClip);
  lv_obj_set_size(lvFooterClip, footerWidth, 24);
  lv_obj_align(lvFooterClip, LV_ALIGN_BOTTOM_MID, 0, -3);
  lv_obj_clear_flag(lvFooterClip, LV_OBJ_FLAG_SCROLLABLE);

  lvFooter = lv_label_create(lvFooterClip);
  lv_label_set_long_mode(lvFooter, LV_LABEL_LONG_CLIP);
  lv_obj_set_style_text_align(lvFooter, LV_TEXT_ALIGN_LEFT, 0);
  lv_obj_set_style_text_font(lvFooter, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvFooter, LV_ALIGN_LEFT_MID, 0, 0);

  lvFallback = lv_obj_create(lvRoot);
  lv_obj_set_size(lvFallback, fallbackWidth, 108);
  lv_obj_align(lvFallback, LV_ALIGN_CENTER, 0, 0);
  lv_obj_set_style_radius(lvFallback, 18, 0);
  lv_obj_set_style_border_width(lvFallback, 2, 0);
  lv_obj_set_style_pad_all(lvFallback, 12, 0);
  lv_obj_set_style_shadow_width(lvFallback, 0, 0);

  lvFallbackPersona = lv_label_create(lvFallback);
  lv_obj_set_width(lvFallbackPersona, fallbackContentWidth);
  lv_label_set_long_mode(lvFallbackPersona, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvFallbackPersona, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_font(lvFallbackPersona, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvFallbackPersona, LV_ALIGN_TOP_MID, 0, 10);

  lvFallbackState = lv_label_create(lvFallback);
  lv_obj_set_width(lvFallbackState, fallbackContentWidth);
  lv_label_set_long_mode(lvFallbackState, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvFallbackState, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_font(lvFallbackState, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvFallbackState, LV_ALIGN_CENTER, 0, 0);

  lvFallbackAgent = lv_label_create(lvFallback);
  lv_obj_set_width(lvFallbackAgent, fallbackContentWidth);
  lv_label_set_long_mode(lvFallbackAgent, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvFallbackAgent, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_font(lvFallbackAgent, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvFallbackAgent, LV_ALIGN_BOTTOM_MID, 0, -12);

  lvLoadPanel = lv_obj_create(lvRoot);
  lv_obj_set_size(lvLoadPanel, loadPanelWidth, 56);
  lv_obj_align(lvLoadPanel, LV_ALIGN_CENTER, 0, 48);
  lv_obj_set_style_radius(lvLoadPanel, 10, 0);
  lv_obj_set_style_border_width(lvLoadPanel, 1, 0);
  lv_obj_set_style_pad_all(lvLoadPanel, 8, 0);
  lv_obj_set_style_shadow_width(lvLoadPanel, 0, 0);
  lv_obj_clear_flag(lvLoadPanel, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(lvLoadPanel, LV_OBJ_FLAG_HIDDEN);

  lvLoadTitle = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadTitle, loadTitleWidth);
  lv_label_set_long_mode(lvLoadTitle, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_font(lvLoadTitle, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvLoadTitle, LV_ALIGN_TOP_LEFT, 0, -1);

  lvLoadPercent = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadPercent, 46);
  lv_label_set_long_mode(lvLoadPercent, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvLoadPercent, LV_TEXT_ALIGN_RIGHT, 0);
  lv_obj_set_style_text_font(lvLoadPercent, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvLoadPercent, LV_ALIGN_TOP_RIGHT, 0, -1);

  lvLoadTrack = lv_obj_create(lvLoadPanel);
  lv_obj_set_size(lvLoadTrack, loadTrackWidth, 8);
  lv_obj_align(lvLoadTrack, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_radius(lvLoadTrack, 4, 0);
  lv_obj_set_style_border_width(lvLoadTrack, 0, 0);
  lv_obj_set_style_pad_all(lvLoadTrack, 0, 0);
  lv_obj_clear_flag(lvLoadTrack, LV_OBJ_FLAG_SCROLLABLE);

  lvLoadFill = lv_obj_create(lvLoadTrack);
  lv_obj_set_size(lvLoadFill, 1, 8);
  lv_obj_align(lvLoadFill, LV_ALIGN_LEFT_MID, 0, 0);
  lv_obj_set_style_radius(lvLoadFill, 4, 0);
  lv_obj_set_style_border_width(lvLoadFill, 0, 0);
  lv_obj_set_style_pad_all(lvLoadFill, 0, 0);
  lv_obj_clear_flag(lvLoadFill, LV_OBJ_FLAG_SCROLLABLE);
}

static uint8_t dynamicPersonaProgressPercent() {
  if (!dynamicPersonaReceiving && dynamicPersonaReady) return 100;
  uint8_t completeFrames = 0;
  for (uint8_t i = 0; i < dynamicPersonaTransferFrameCount; i++) {
    if (dynamicPersonaReceivedFrameMask & (1U << i)) completeFrames++;
  }
  uint32_t total = static_cast<uint32_t>(dynamicPersonaTransferFrameCount) * CODE_PET_DYNAMIC_PERSONA_BYTES;
  uint32_t received = dynamicPersonaReceived;
  if (received > CODE_PET_DYNAMIC_PERSONA_BYTES) received = CODE_PET_DYNAMIC_PERSONA_BYTES;
  received += static_cast<uint32_t>(completeFrames) * CODE_PET_DYNAMIC_PERSONA_BYTES;
  if (total == 0) return 0;
  if (received > total) received = total;
  return static_cast<uint8_t>((received * 100U) / total);
}

static void setFooterTickerX(void *obj, int32_t value) {
  lv_obj_set_x(static_cast<lv_obj_t *>(obj), value);
}

static void finishFooterTicker(lv_anim_t *anim) {
  (void)anim;
  lvFooterTickerDone = true;
  if (lvFooterClip) lv_obj_add_flag(lvFooterClip, LV_OBJ_FLAG_HIDDEN);
}

static void updateFooterTicker(const String &text, bool connected) {
  if (!lvFooter || !lvFooterClip) return;

  if (!connected) {
    lv_anim_del(lvFooter, setFooterTickerX);
    lvFooterTickerText = CODE_PET_DISCONNECTED_LABEL;
    lvFooterTickerDone = false;
    lv_obj_clear_flag(lvFooterClip, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_width(lvFooter, lv_obj_get_width(lvFooterClip));
    lv_label_set_long_mode(lvFooter, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_align(lvFooter, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(lvFooter, CODE_PET_DISCONNECTED_LABEL);
    lv_obj_align(lvFooter, LV_ALIGN_CENTER, 0, 0);
    return;
  }

  if (!text.length()) {
    lv_anim_del(lvFooter, setFooterTickerX);
    lvFooterTickerText = "";
    lvFooterTickerDone = true;
    lv_obj_add_flag(lvFooterClip, LV_OBJ_FLAG_HIDDEN);
    return;
  }

  if (text == lvFooterTickerText) {
    if (lvFooterTickerDone) lv_obj_add_flag(lvFooterClip, LV_OBJ_FLAG_HIDDEN);
    return;
  }

  lv_anim_del(lvFooter, setFooterTickerX);
  lvFooterTickerText = text;
  lvFooterTickerDone = false;
  lv_obj_clear_flag(lvFooterClip, LV_OBJ_FLAG_HIDDEN);
  lv_obj_set_width(lvFooter, LV_SIZE_CONTENT);
  lv_label_set_long_mode(lvFooter, LV_LABEL_LONG_CLIP);
  lv_obj_set_style_text_align(lvFooter, LV_TEXT_ALIGN_LEFT, 0);
  lv_label_set_text(lvFooter, text.c_str());
  lv_obj_update_layout(lvFooter);

  int16_t clipWidth = lv_obj_get_width(lvFooterClip);
  int16_t textWidth = lv_obj_get_width(lvFooter);
  int16_t startX = clipWidth;
  int16_t endX = -textWidth;
  uint32_t distance = static_cast<uint32_t>(clipWidth + textWidth);
  uint32_t duration = (distance * 1000U) / 230U;
  if (duration < 900U) duration = 900U;

  lv_obj_set_y(lvFooter, 1);
  lv_obj_set_x(lvFooter, startX);

  lv_anim_t anim;
  lv_anim_init(&anim);
  lv_anim_set_var(&anim, lvFooter);
  lv_anim_set_exec_cb(&anim, setFooterTickerX);
  lv_anim_set_values(&anim, startX, endX);
  lv_anim_set_time(&anim, duration);
  lv_anim_set_ready_cb(&anim, finishFooterTicker);
  lv_anim_start(&anim);
}

static bool renderPersonaWithLvgl(uint16_t bg, uint16_t header, uint16_t panel, uint16_t ink, uint16_t muted, uint16_t accent) {
  ensureLvglUi();
  const bool connected = bleConnected;
  String renderSlug = pet.personaSlug.length() ? pet.personaSlug : String(CODE_PET_LVGL_FALLBACK_PERSONA_SLUG);
  String renderState = connected ? pet.state : String("idle");
  const bool imageLoading = connected && dynamicPersonaReceiving && dynamicPersonaShowLoading && dynamicPersonaTransferSlug == renderSlug;
  const uint8_t imageProgress = imageLoading ? dynamicPersonaProgressPercent() : 0;
  const lv_img_dsc_t *frame = imageLoading && dynamicPersonaReady ? dynamicPersonaFrameForSlug(dynamicPersonaSlug) : dynamicPersonaFrameForSlug(renderSlug);
  if (!frame) {
    frame = codePetPersonaFrame(renderSlug, renderState, frameIndex);
  }
  if (!frame && !connected && dynamicPersonaReady) {
    frame = dynamicPersonaFrameForSlug(dynamicPersonaSlug);
  }
  if (!frame) {
    frame = codePetPersonaFrame(String(CODE_PET_LVGL_FALLBACK_PERSONA_SLUG), renderState, frameIndex);
  }
  if (!frame) return false;

  lv_obj_set_style_bg_color(lv_scr_act(), lvColor(bg), 0);
  lv_obj_set_style_bg_color(lvRoot, lvColor(bg), 0);
  lv_obj_set_style_bg_opa(lvRoot, LV_OPA_COVER, 0);

  const bool night = isNightTheme();
  const uint16_t labelInk = night ? rgb565(255, 255, 255) : ink;
  const uint16_t labelMuted = night ? rgb565(190, 198, 209) : muted;
  const uint16_t loadPanelBg = night ? rgb565(8, 10, 14) : panel;
  const uint16_t loadTrackBg = night ? rgb565(36, 42, 54) : rgb565(224, 230, 238);
  lv_obj_set_style_text_color(lvHeader, lvColor(labelInk), 0);
  lv_obj_set_style_text_color(lvStatus, lvColor(accent), 0);
  lv_obj_set_style_text_color(lvFooter, lvColor(labelMuted), 0);
  lv_obj_set_style_bg_color(lvLoadPanel, lvColor(loadPanelBg), 0);
  lv_obj_set_style_bg_opa(lvLoadPanel, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(lvLoadPanel, lvColor(accent), 0);
  lv_obj_set_style_text_color(lvLoadTitle, lvColor(labelInk), 0);
  lv_obj_set_style_text_color(lvLoadPercent, lvColor(accent), 0);
  lv_obj_set_style_bg_color(lvLoadTrack, lvColor(loadTrackBg), 0);
  lv_obj_set_style_bg_opa(lvLoadTrack, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(lvLoadFill, lvColor(accent), 0);
  lv_obj_set_style_bg_opa(lvLoadFill, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(lvFooter, lvColor(labelMuted), 0);
  lv_label_set_text(lvHeader, connected ? cleanText(pet.agent, 22).c_str() : "");
  String statusText = connected ? cleanText(imageLoading ? String("Sync ") + String(imageProgress) + "%" : displayStateLabel(), 20) : "";
  lv_label_set_text(lvStatus, statusText.c_str());
  String footer = connected ? cleanText(pet.output, CODE_PET_OUTPUT_MAX_CHARS) : String(CODE_PET_DISCONNECTED_LABEL);
  updateFooterTicker(footer, connected);
  if (imageLoading) {
    String progressText = String(imageProgress) + "%";
    lv_label_set_text(lvLoadTitle, "Syncing");
    lv_label_set_text(lvLoadPercent, progressText.c_str());
    const int16_t trackWidth = lv_obj_get_width(lvLoadTrack);
    int16_t fillWidth = (trackWidth * imageProgress) / 100;
    if (fillWidth < 1) fillWidth = 1;
    lv_obj_set_width(lvLoadFill, fillWidth);
    lv_obj_clear_flag(lvLoadPanel, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(lvLoadPanel, LV_OBJ_FLAG_HIDDEN);
  }

  lv_obj_set_style_bg_color(lvFallback, lvColor(panel), 0);
  lv_obj_set_style_border_color(lvFallback, lvColor(ink), 0);
  lv_obj_set_style_text_color(lvFallbackPersona, lvColor(ink), 0);
  lv_obj_set_style_text_color(lvFallbackState, lvColor(accent), 0);
  lv_obj_set_style_text_color(lvFallbackAgent, lvColor(muted), 0);
  lv_label_set_text(lvFallbackPersona, connected ? cleanText(pet.personaName, 18).c_str() : CODE_PET_DISCONNECTED_LABEL);
  String fallbackState = connected ? cleanText(displayStateLabel(), 20) : "";
  lv_label_set_text(lvFallbackState, fallbackState.c_str());
  lv_label_set_text(lvFallbackAgent, connected ? cleanText(pet.agent, 18).c_str() : "");

  lv_img_set_src(lvImage, frame);
  lv_obj_align(lvImage, LV_ALIGN_CENTER, 0, connected ? petBob() : ((frameIndex % 2) ? -1 : 0));
  lv_obj_clear_flag(lvImage, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_flag(lvFallback, LV_OBJ_FLAG_HIDDEN);
  lv_obj_move_foreground(lvHeader);
  lv_obj_move_foreground(lvStatus);
  lv_obj_move_foreground(lvFooterClip);
  if (imageLoading) lv_obj_move_foreground(lvLoadPanel);
  return true;
}
#endif

static void renderScreen() {
  updateStatusPixel();

  const bool oled = screenW() <= 128 && screenH() <= 64;
  const bool night = isNightTheme();
  uint16_t bg = oled || night ? 0 : rgb565(238, 244, 247);
  uint16_t header = oled ? 0 : rgb565(24, 32, 42);
  uint16_t panel = oled ? 0 : rgb565(255, 255, 255);
  uint16_t ink = oled ? 1 : rgb565(38, 50, 65);
  uint16_t muted = oled ? 1 : rgb565(83, 93, 110);
  uint16_t face = oled ? 0 : rgb565(215, 245, 255);
  uint16_t body = oled ? 0 : personaColor();
  uint16_t accent = oled ? 1 : stateColor(pet.state);

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  if (!oled && renderPersonaWithLvgl(bg, header, panel, ink, muted, accent)) {
    lv_timer_handler();
    uiDirty = false;
    return;
  }
#endif

  fillScreen(bg);

  if (oled) {
    drawText(bleConnected ? cleanText(pet.agent, 12) : "", 0, 0, 1, 1, 0);
    drawText(bleConnected ? cleanText(displayStateLabel(), 12) : "", 0, 10, 1, 1, 0);
    drawText(bleConnected ? cleanText(pet.output, 18) : String(CODE_PET_DISCONNECTED_LABEL), 0, screenH() - 10, 1, 1, 0);
    renderPetFace(screenW() - 38, screenH() / 2 + 2, 7, 0, 1, 1, 0);
    displayFlush();
    return;
  }

  int16_t w = screenW();
  int16_t h = screenH();
  fillRect(0, 0, w, 32, header);
  drawText("Vibe Pet", 8, 9, 1, rgb565(255, 255, 255), header);
  drawText(bleConnected ? "BLE" : "WAIT", w - 42, 9, 1, bleConnected ? rgb565(113, 210, 159) : rgb565(190, 198, 209), header);

  fillRoundRect(8, 40, w - 16, 34, 8, panel);
  drawRoundRect(8, 40, w - 16, 34, 8, rgb565(215, 221, 231));
  drawText(bleConnected ? cleanText(displayStateLabel(), 18) : "", 18, 50, 1, accent, panel);
  drawText(bleConnected ? cleanText(pet.agent, 16) : "", w / 2, 50, 1, muted, panel);

  renderPetFace(w / 2, h / 2 + 22, min(w, h) > 200 ? 13 : 10, body, accent, ink, face);

  fillRect(0, h - 24, w, 24, header);
  String footer = bleConnected ? cleanText(pet.output, 40) : String(CODE_PET_DISCONNECTED_LABEL);
  drawText(footer, 8, h - 17, 1, rgb565(255, 255, 255), header);
  displayFlush();
  uiDirty = false;
}

static void markDirty() {
  uiDirty = true;
}

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
static const lv_img_dsc_t *dynamicPersonaFrameForSlug(const String &slug) {
  if (!dynamicPersonaReady || !dynamicPersonaSlug.length() || slug != dynamicPersonaSlug) return nullptr;
  uint8_t count = dynamicPersonaFrameCount;
  if (count < 1) count = 1;
  if (count > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) count = CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES;
  uint8_t slot = count > 1 ? (frameIndex % count) : 0;
  return &dynamicPersonaImages[slot];
}

static void clearDynamicPersonaFrame() {
  dynamicPersonaReady = false;
  dynamicPersonaReceiving = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaId = "";
  dynamicPersonaSlug = "";
  dynamicPersonaTransferSlug = "";
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaReceived = 0;
  dynamicPersonaFrameCount = 1;
  dynamicPersonaTransferFrameCount = 1;
  dynamicPersonaTransferFrameIndex = 0;
  dynamicPersonaReceivedFrameMask = 0;
  dynamicPersonaLastProgressPercent = 0;
  dynamicPersonaRleIndex = 0;
}

static void abortDynamicPersonaTransfer() {
  dynamicPersonaReceiving = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaTransferSlug = "";
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaReceived = 0;
  dynamicPersonaTransferFrameCount = 1;
  dynamicPersonaTransferFrameIndex = 0;
  dynamicPersonaReceivedFrameMask = 0;
  dynamicPersonaLastProgressPercent = 0;
  dynamicPersonaRleIndex = 0;
  markDirty();
}

static int8_t base64Value(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

static bool appendDynamicPersonaDecodedByte(uint8_t value) {
  if (dynamicPersonaFormat == DYNAMIC_PERSONA_RLE_RGB565) {
    dynamicPersonaRleTriple[dynamicPersonaRleIndex++] = value;
    if (dynamicPersonaRleIndex < 3) return true;

    uint8_t lo = dynamicPersonaRleTriple[0];
    uint8_t hi = dynamicPersonaRleTriple[1];
    uint8_t count = dynamicPersonaRleTriple[2];
    dynamicPersonaRleIndex = 0;
    if (count == 0) return false;
    for (uint8_t i = 0; i < count; i++) {
      if (dynamicPersonaReceived + 2 > CODE_PET_DYNAMIC_PERSONA_BYTES) return false;
      dynamicPersonaPendingPixels[dynamicPersonaReceived++] = lo;
      dynamicPersonaPendingPixels[dynamicPersonaReceived++] = hi;
    }
    return true;
  }

  if (dynamicPersonaReceived >= CODE_PET_DYNAMIC_PERSONA_BYTES) return false;
  dynamicPersonaPendingPixels[dynamicPersonaReceived++] = value;
  return true;
}

static bool appendDynamicPersonaBase64(const String &encoded) {
  int value = 0;
  int bits = -8;
  for (size_t i = 0; i < encoded.length(); i++) {
    char c = encoded[i];
    if (c == '=') break;
    if (c == ' ' || c == '\n' || c == '\r' || c == '\t') continue;
    int8_t digit = base64Value(c);
    if (digit < 0) return false;
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 0) {
      if (!appendDynamicPersonaDecodedByte(static_cast<uint8_t>((value >> bits) & 0xFF))) return false;
      bits -= 8;
    }
  }
  return true;
}

static void applyDynamicPersonaPayload(JsonVariantConst src) {
  String op = String(src["im"] | "");

  if (op == "s") {
    String id = cleanText(String(src["id"] | ""), 48);
    String slug = cleanText(String(src["p"] | ""), 48);
    String format = String(src["f"] | "");
    int width = src["w"] | 0;
    int height = src["h"] | 0;
    uint32_t size = src["z"] | 0;
    bool showLoading = (src["ld"] | 1) != 0;
    int frameCount = src["fc"] | 1;
    int frameSlot = src["fr"] | 0;

    if (!id.length() || !slug.length() ||
        width != CODE_PET_DYNAMIC_PERSONA_WIDTH ||
        height != CODE_PET_DYNAMIC_PERSONA_HEIGHT ||
        size != CODE_PET_DYNAMIC_PERSONA_BYTES ||
        frameCount < 1 ||
        frameCount > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES ||
        frameSlot < 0 ||
        frameSlot >= frameCount ||
        (format != "rgb565" && format != "rgb565-rle")) {
      abortDynamicPersonaTransfer();
      return;
    }

    if (frameSlot == 0) {
      dynamicPersonaReceivedFrameMask = 0;
      dynamicPersonaTransferFrameCount = static_cast<uint8_t>(frameCount);
      dynamicPersonaTransferSlug = slug;
    } else if (id != dynamicPersonaId ||
               slug != dynamicPersonaTransferSlug ||
               frameCount != dynamicPersonaTransferFrameCount ||
               (dynamicPersonaReceivedFrameMask & (1U << frameSlot))) {
      abortDynamicPersonaTransfer();
      return;
    }

    dynamicPersonaReceiving = true;
    dynamicPersonaShowLoading = showLoading;
    dynamicPersonaId = id;
    dynamicPersonaTransferFrameIndex = static_cast<uint8_t>(frameSlot);
    dynamicPersonaFormat = format == "rgb565-rle" ? DYNAMIC_PERSONA_RLE_RGB565 : DYNAMIC_PERSONA_RAW_RGB565;
    dynamicPersonaExpectedSeq = 0;
    dynamicPersonaReceived = 0;
    dynamicPersonaLastProgressPercent = 0;
    dynamicPersonaRleIndex = 0;
    markDirty();
    return;
  }

  if (op == "x") {
    String id = String(src["id"] | "");
    if (!id.length() || id == dynamicPersonaId) abortDynamicPersonaTransfer();
    return;
  }

  if (op == "c") {
    String id = String(src["id"] | "");
    int seq = src["q"] | -1;
    if (!dynamicPersonaReceiving || id != dynamicPersonaId || seq != dynamicPersonaExpectedSeq) {
      abortDynamicPersonaTransfer();
      return;
    }
    String data = String(src["d"] | "");
    if (!data.length() || !appendDynamicPersonaBase64(data)) {
      abortDynamicPersonaTransfer();
      return;
    }
    dynamicPersonaExpectedSeq++;
    uint8_t progress = dynamicPersonaProgressPercent();
    if (progress != dynamicPersonaLastProgressPercent) {
      dynamicPersonaLastProgressPercent = progress;
      if (dynamicPersonaShowLoading) markDirty();
    }
    return;
  }

  if (op == "e") {
    String id = String(src["id"] | "");
    if (dynamicPersonaReceiving && id == dynamicPersonaId &&
        dynamicPersonaReceived == CODE_PET_DYNAMIC_PERSONA_BYTES &&
        dynamicPersonaRleIndex == 0) {
      dynamicPersonaReceiving = false;
      memcpy(dynamicPersonaPixels[dynamicPersonaTransferFrameIndex], dynamicPersonaPendingPixels, CODE_PET_DYNAMIC_PERSONA_BYTES);
      dynamicPersonaReady = true;
      dynamicPersonaSlug = dynamicPersonaTransferSlug;
      dynamicPersonaReceivedFrameMask |= (1U << dynamicPersonaTransferFrameIndex);
      if (dynamicPersonaReceivedFrameMask & 0x01) dynamicPersonaFrameCount = 1;
      uint8_t completeMask = (1U << dynamicPersonaTransferFrameCount) - 1U;
      if ((dynamicPersonaReceivedFrameMask & completeMask) == completeMask) {
        dynamicPersonaFrameCount = dynamicPersonaTransferFrameCount;
        dynamicPersonaTransferSlug = "";
        dynamicPersonaLastProgressPercent = 100;
      }
      markDirty();
    } else {
      abortDynamicPersonaTransfer();
    }
  }
}
#endif

static void setDisconnectedPetState() {
#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  abortDynamicPersonaTransfer();
#endif
  String currentTheme = pet.theme;
  bool changed = pet.state != "idle" || pet.stateLabel.length() || pet.agent.length() ||
                 pet.event != CODE_PET_DISCONNECTED_LABEL || pet.title.length() || pet.output.length() ||
                 pet.activeCount != 0;
  pet.state = "idle";
  pet.stateLabel = "";
  pet.agent = "";
  pet.event = CODE_PET_DISCONNECTED_LABEL;
  pet.title = "";
  pet.output = "";
  if (!pet.personaSlug.length()) pet.personaSlug = "lulu";
  if (!pet.personaName.length()) pet.personaName = "Lulu";
  pet.theme = (currentTheme == "night" || currentTheme == "dark") ? currentTheme : "day";
  pet.activeCount = 0;
  pet.receivedAt = 0;
  if (changed) markDirty();
}

static void clearDisconnectedPetState() {
  if (pet.event != CODE_PET_DISCONNECTED_LABEL) return;
  pet.event = "";
  markDirty();
}

static void applyPacket(JsonVariantConst src) {
  String nextState = String(src["s"] | src["state"] | "idle");
  String nextStateLabel = String(src["sl"] | src["stateLabel"] | "");
  String nextAgent = String(src["a"] | src["agentName"] | src["agent"] | "agent");
  String nextEvent = String(src["e"] | src["event"] | "");
  String nextTitle = String(src["m"] | src["title"] | "");
  String nextOutput = String(src["o"] | src["output"] | "");
  String nextPersonaSlug = String(src["p"] | src["persona"]["slug"] | "lulu");
  String nextPersonaName = String(src["d"] | src["persona"]["displayName"] | "Lulu");
  String nextPersonaKind = String(src["k"] | src["persona"]["kind"] | "");
  String nextSpriteUrl = String(src["u"] | src["persona"]["spritesheetUrl"] | "");
  String nextTheme = String(src["th"] | src["theme"] | "day");
  int nextActiveCount = src["n"] | src["activeCount"] | 0;

  bool changed = nextState != pet.state || nextStateLabel != pet.stateLabel ||
                 nextAgent != pet.agent || nextEvent != pet.event ||
                 nextTitle != pet.title || nextOutput != pet.output || nextPersonaSlug != pet.personaSlug ||
                 nextPersonaName != pet.personaName || nextPersonaKind != pet.personaKind ||
                 nextSpriteUrl != pet.spriteUrl || nextTheme != pet.theme ||
                 nextActiveCount != pet.activeCount;

  pet.state = cleanText(nextState, 24);
  pet.stateLabel = cleanText(nextStateLabel, 24);
  pet.agent = cleanText(nextAgent, 24);
  pet.event = cleanText(nextEvent, 40);
  pet.title = cleanText(nextTitle, 40);
  pet.output = cleanText(nextOutput, CODE_PET_OUTPUT_MAX_CHARS);
  pet.personaSlug = cleanText(nextPersonaSlug, 48);
  pet.personaName = cleanText(nextPersonaName, 48);
  pet.personaKind = cleanText(nextPersonaKind, 24);
  pet.spriteUrl = nextSpriteUrl;
  nextTheme = cleanText(nextTheme, 12);
  pet.theme = (nextTheme == "night" || nextTheme == "dark") ? nextTheme : "day";
  pet.activeCount = nextActiveCount;
  pet.receivedAt = millis();
  if (changed) markDirty();
}

static void applyPayload(const String &payload) {
  noteDisplayActivity();
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    pet.state = "error";
    pet.agent = "bad-json";
    pet.event = error.c_str();
    markDirty();
    return;
  }

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  if (doc["im"].is<const char *>()) {
    applyDynamicPersonaPayload(doc.as<JsonVariantConst>());
    return;
  }
#endif

  if (doc["pets"].is<JsonArray>()) {
    JsonArray pets = doc["pets"].as<JsonArray>();
    JsonVariantConst selected;
    for (JsonVariantConst item : pets) {
      String state = String(item["state"] | item["packet"]["s"] | "idle");
      if (state != "idle" && state != "sleeping") {
        selected = item;
        break;
      }
      if (selected.isNull()) selected = item;
    }
    if (!selected.isNull()) {
      if (selected["packet"].is<JsonObject>()) applyPacket(selected["packet"]);
      else applyPacket(selected);
    }
    return;
  }

  if (doc["aggregate"].is<JsonObject>()) {
    applyPacket(doc["aggregate"]);
    return;
  }

  applyPacket(doc.as<JsonVariantConst>());
}

static void clearPayloadQueue() {
  for (uint8_t i = 0; i < CODE_PET_BLE_PAYLOAD_QUEUE_SIZE; i++) incomingPayloadQueue[i] = "";
  incomingPayloadHead = 0;
  incomingPayloadTail = 0;
  pendingPayload = false;
}

static void enqueuePayload(const String &payload) {
  uint8_t nextTail = (incomingPayloadTail + 1) % CODE_PET_BLE_PAYLOAD_QUEUE_SIZE;
  if (nextTail == incomingPayloadHead) {
    incomingPayloadQueue[incomingPayloadHead] = "";
    incomingPayloadHead = (incomingPayloadHead + 1) % CODE_PET_BLE_PAYLOAD_QUEUE_SIZE;
  }
  incomingPayloadQueue[incomingPayloadTail] = payload;
  incomingPayloadTail = nextTail;
  pendingPayload = true;
}

static bool dequeuePayload(String &payload) {
  if (incomingPayloadHead == incomingPayloadTail) {
    pendingPayload = false;
    return false;
  }
  payload = incomingPayloadQueue[incomingPayloadHead];
  incomingPayloadQueue[incomingPayloadHead] = "";
  incomingPayloadHead = (incomingPayloadHead + 1) % CODE_PET_BLE_PAYLOAD_QUEUE_SIZE;
  pendingPayload = incomingPayloadHead != incomingPayloadTail;
  return true;
}

#if defined(CODE_PET_HAS_BLE)
static void restartAdvertising() {
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    (void)server;
    bleConnected = true;
    clearDisconnectedPetState();
    noteDisplayActivity();
    markDirty();
  }

  void onDisconnect(BLEServer *server) override {
    (void)server;
    bleConnected = false;
    clearPayloadQueue();
    setDisconnectedPetState();
    noteDisplayActivity();
    markDirty();
    restartAdvertising();
  }
};

class StateCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    noteDisplayActivity();
    std::string value = characteristic->getValue();
    if (!value.length()) return;
    enqueuePayload(String(value.c_str()));
  }
};

static void setupBle() {
  BLEDevice::init(CODE_PET_DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *characteristic = service->createCharacteristic(
    STATE_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  characteristic->setCallbacks(new StateCallbacks());
  service->start();
  restartAdvertising();
}
#endif

#if defined(CODE_PET_USE_WIFI)
static void setupWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(CODE_PET_WIFI_SSID, CODE_PET_WIFI_PASSWORD);
}

static void pollBridge() {
  if (!strlen(CODE_PET_WIFI_SSID) || !strlen(CODE_PET_BRIDGE_URL)) return;
  if (WiFi.status() != WL_CONNECTED) {
    bleConnected = false;
    setDisconnectedPetState();
    if (millis() - lastWifiAttemptAt > 5000) {
      lastWifiAttemptAt = millis();
      WiFi.disconnect();
      WiFi.begin(CODE_PET_WIFI_SSID, CODE_PET_WIFI_PASSWORD);
    }
    return;
  }
  bleConnected = true;

#if defined(ESP8266)
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, CODE_PET_BRIDGE_URL)) return;
#else
  HTTPClient http;
  if (!http.begin(CODE_PET_BRIDGE_URL)) return;
#endif
  int code = http.GET();
  if (code == 200) applyPayload(http.getString());
  http.end();
}
#endif

void setup() {
  Serial.begin(115200);
  displayBegin();
#if defined(CODE_PET_STATUS_PIXEL)
  statusPixel.begin();
  statusPixel.clear();
  statusPixel.show();
#endif
  setDisconnectedPetState();
  markDirty();
#if defined(CODE_PET_HAS_BLE)
  setupBle();
#endif
#if defined(CODE_PET_USE_WIFI)
  setupWifi();
#endif
}

void loop() {
#if defined(CODE_PET_DISPLAY_M5UNIFIED)
  M5.update();
#endif
#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  uint32_t now = millis();
  uint32_t delta = now - lvLastTickAt;
  if (delta > 0) {
    lv_tick_inc(delta);
    lvLastTickAt = now;
  }
#endif
  updateDisplayPower();

  while (pendingPayload) {
    String payload;
    if (!dequeuePayload(payload)) break;
    applyPayload(payload);
  }

#if defined(CODE_PET_USE_WIFI)
  if (millis() - lastPollAt > 1000) {
    lastPollAt = millis();
    pollBridge();
  }
#endif

  if (millis() - lastFrameAt > 240) {
    lastFrameAt = millis();
    frameIndex++;
    uiDirty = true;
  }

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  lv_timer_handler();
#endif
  if (uiDirty) renderScreen();
}
