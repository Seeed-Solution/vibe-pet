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

#if defined(ESP32) && defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
#include <FS.h>
#include <SPIFFS.h>
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

#ifndef CODE_PET_BLE_MTU
#define CODE_PET_BLE_MTU 517
#endif

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
  String locale = "en";
  int activeCount = 0;
  unsigned long receivedAt = 0;
};

VibePetPacket pet;
#ifndef CODE_PET_BLE_PAYLOAD_QUEUE_SIZE
#define CODE_PET_BLE_PAYLOAD_QUEUE_SIZE 24
#endif
#ifndef CODE_PET_BLE_FRAGMENT_MAX_BYTES
#define CODE_PET_BLE_FRAGMENT_MAX_BYTES 768
#endif
String incomingPayloadQueue[CODE_PET_BLE_PAYLOAD_QUEUE_SIZE];
volatile uint8_t incomingPayloadHead = 0;
volatile uint8_t incomingPayloadTail = 0;
volatile bool pendingPayload = false;
String incomingBleFragment = "";
char incomingBleFragmentId = '\0';
size_t incomingBleFragmentExpectedBytes = 0;
bool incomingBleFragmentActive = false;
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
static lv_obj_t *lvHeaderShadow = nullptr;
static lv_obj_t *lvStatus = nullptr;
static lv_obj_t *lvStatusShadow = nullptr;
static lv_obj_t *lvFooterClip = nullptr;
static lv_obj_t *lvFooter = nullptr;
static lv_obj_t *lvFooterShadow = nullptr;
static lv_obj_t *lvImage = nullptr;
static lv_obj_t *lvFallback = nullptr;
static lv_obj_t *lvFallbackAgent = nullptr;
static lv_obj_t *lvFallbackState = nullptr;
static lv_obj_t *lvFallbackPersona = nullptr;
static lv_obj_t *lvLoadPanel = nullptr;
static lv_obj_t *lvLoadTitle = nullptr;
static lv_obj_t *lvLoadTitleShadow = nullptr;
static lv_obj_t *lvLoadPercent = nullptr;
static lv_obj_t *lvLoadPercentShadow = nullptr;
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
static String dynamicPersonaState = "idle";
static String dynamicPersonaTransferSlug = "";
static String dynamicPersonaTransferState = "idle";
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
#if defined(ESP32)
static bool dynamicPersonaStoreMounted = false;
static const char *DYNAMIC_PERSONA_META_PATH = "/pet_meta.json";
static const char *DYNAMIC_PERSONA_META_TMP_PATH = "/pet_meta.tmp";
static const char *DYNAMIC_PERSONA_FRAME_PATHS[CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES] = {"/pet0.bin", "/pet1.bin"};
static const char *DYNAMIC_PERSONA_FRAME_TMP_PATHS[CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES] = {"/pet0.tmp", "/pet1.tmp"};
#endif
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

static uint8_t colorLuma(uint16_t color) {
  uint8_t r = ((color >> 11) & 0x1F) * 255 / 31;
  uint8_t g = ((color >> 5) & 0x3F) * 255 / 63;
  uint8_t b = (color & 0x1F) * 255 / 31;
  return static_cast<uint8_t>((static_cast<uint16_t>(r) * 30U + static_cast<uint16_t>(g) * 59U + static_cast<uint16_t>(b) * 11U) / 100U);
}

static uint16_t textLiftColor(uint16_t textColor) {
  return colorLuma(textColor) > 150 ? rgb565(0, 0, 0) : rgb565(255, 255, 255);
}

static void stylePremiumLabel(lv_obj_t *label, uint16_t color) {
  if (!label) return;
  lv_obj_set_style_text_color(label, lvColor(color), 0);
  lv_obj_set_style_text_opa(label, LV_OPA_COVER, 0);
  lv_obj_set_style_text_letter_space(label, 0, 0);
}

static void stylePremiumShadow(lv_obj_t *label, uint16_t textColor, lv_opa_t opa) {
  if (!label) return;
  lv_obj_set_style_text_color(label, lvColor(textLiftColor(textColor)), 0);
  lv_obj_set_style_text_opa(label, opa, 0);
  lv_obj_set_style_text_letter_space(label, 0, 0);
}

static void setPremiumLabelText(lv_obj_t *label, lv_obj_t *shadow, const char *text) {
  if (shadow) lv_label_set_text(shadow, text);
  if (label) lv_label_set_text(label, text);
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
static const lv_img_dsc_t *dynamicPersonaFrameForSlug(const String &slug, const String &state);
static const lv_img_dsc_t *dynamicPersonaFrameForSlugAnyState(const String &slug);
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

static bool isZhLocale(const String &locale) {
  return locale == "zh" || locale.startsWith("zh-") || locale.startsWith("zh_");
}

static bool isJaLocale(const String &locale) {
  return locale == "ja" || locale.startsWith("ja-") || locale.startsWith("ja_");
}

static String stateLabelForLocale(const String &state, const String &locale) {
  if (isZhLocale(locale)) {
    if (state == "notification" || state == "permission") return "通知";
    if (state == "thinking") return "思考中";
    if (state == "working" || state == "typing") return "工作中";
    if (state == "building") return "构建中";
    if (state == "juggling") return "多任务";
    if (state == "attention") return "需关注";
    if (state == "error") return "出错";
    if (state == "sweeping") return "清理中";
    if (state == "sleeping") return "休眠";
    return "空闲";
  }
  if (isJaLocale(locale)) {
    if (state == "notification" || state == "permission") return "通知";
    if (state == "thinking") return "思考中";
    if (state == "working" || state == "typing") return "作業中";
    if (state == "building") return "ビルド中";
    if (state == "juggling") return "複数処理";
    if (state == "attention") return "要確認";
    if (state == "error") return "エラー";
    if (state == "sweeping") return "整理中";
    if (state == "sleeping") return "休止中";
    return "待機中";
  }
  if (state == "notification" || state == "permission") return "notify";
  return state.length() ? state : "idle";
}

static String stateLabel(const String &state) {
  return stateLabelForLocale(state, "en");
}

static bool isDefaultStateLabel(const String &label, const String &state) {
  if (!label.length()) return true;
  if (label == state || label == stateLabelForLocale(state, "en")) return true;
  String lower = label;
  lower.toLowerCase();
  if (lower == state) return true;
  if ((state == "working" || state == "typing") && lower == "working") return true;
  if ((state == "notification" || state == "permission") && label == "Notification") return true;
  if (state == "juggling" && label == "Handling multiple tasks") return true;
  if (state == "attention" && label == "Needs attention") return true;
  if (state == "sweeping" && label == "Cleaning context") return true;
  if (label == "Unknown" || label == "未知状态" || label == "不明") return true;
  return false;
}

static String localizedStateLabel(const String &state, const String &locale, const String &label) {
  String cleanLabel = cleanText(label, 24);
  if ((isZhLocale(locale) || isJaLocale(locale)) && isDefaultStateLabel(cleanLabel, state)) {
    return stateLabelForLocale(state, locale);
  }
  return cleanLabel.length() ? cleanLabel : stateLabelForLocale(state, locale);
}

static String displayStateLabel() {
  return localizedStateLabel(pet.state, pet.locale, pet.stateLabel);
}

static String normalizePacketState(const String &state) {
  String clean = cleanText(state, 24);
  if (clean == "permission" || clean == "codex-permission") return "notification";
  if (clean == "idle" || clean == "thinking" || clean == "working" || clean == "typing" ||
      clean == "building" || clean == "juggling" || clean == "attention" ||
      clean == "notification" || clean == "error" || clean == "sweeping" ||
      clean == "sleeping") {
    return clean;
  }
  return "idle";
}

static int petBob() {
  if (pet.state == "sleeping") return 1;
  if (pet.state == "thinking") {
    switch (frameIndex % 4) {
      case 0: return -4;
      case 1: return -1;
      case 2: return 3;
      default: return -1;
    }
  }
  if (pet.state == "working" || pet.state == "typing" || pet.state == "building") return (frameIndex % 2) ? -3 : 0;
  if (pet.state == "juggling") return (frameIndex % 4) - 2;
  return (frameIndex % 2) ? -1 : 0;
}

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
static int petImageShiftX() {
  if (pet.state == "thinking") {
    switch (frameIndex % 4) {
      case 0: return -2;
      case 2: return 2;
      default: return 0;
    }
  }
  if (pet.state == "juggling") return ((frameIndex % 4) - 2) * 2;
  if (pet.state == "sweeping") return (frameIndex % 2) ? 3 : -3;
  return 0;
}

static int16_t petImageAngle() {
  if (pet.state == "thinking") {
    switch (frameIndex % 4) {
      case 0: return -25;
      case 2: return 25;
      default: return 0;
    }
  }
  if (pet.state == "juggling") return static_cast<int16_t>(((frameIndex % 4) - 2) * 18);
  if (pet.state == "sweeping") return (frameIndex % 2) ? 18 : -18;
  return 0;
}

static uint16_t petImageZoom() {
  if (pet.state == "working" || pet.state == "typing" || pet.state == "building") {
    return (frameIndex % 2) ? 262 : 256;
  }
  if (pet.state == "attention" || pet.state == "notification" || pet.state == "error") {
    return (frameIndex % 2) ? 266 : 256;
  }
  return 256;
}
#endif

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

  lvHeaderShadow = lv_label_create(lvRoot);
  lv_obj_set_width(lvHeaderShadow, headerWidth);
  lv_label_set_long_mode(lvHeaderShadow, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_font(lvHeaderShadow, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvHeaderShadow, LV_ALIGN_TOP_LEFT, 9, 7);

  lvHeader = lv_label_create(lvRoot);
  lv_obj_set_width(lvHeader, headerWidth);
  lv_label_set_long_mode(lvHeader, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_font(lvHeader, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvHeader, LV_ALIGN_TOP_LEFT, 8, 6);

  lvStatusShadow = lv_label_create(lvRoot);
  lv_obj_set_width(lvStatusShadow, statusWidth);
  lv_label_set_long_mode(lvStatusShadow, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvStatusShadow, LV_TEXT_ALIGN_RIGHT, 0);
  lv_obj_set_style_text_font(lvStatusShadow, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvStatusShadow, LV_ALIGN_TOP_RIGHT, -7, 7);

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

  lvFooterShadow = lv_label_create(lvFooterClip);
  lv_label_set_long_mode(lvFooterShadow, LV_LABEL_LONG_CLIP);
  lv_obj_set_style_text_align(lvFooterShadow, LV_TEXT_ALIGN_LEFT, 0);
  lv_obj_set_style_text_font(lvFooterShadow, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvFooterShadow, LV_ALIGN_LEFT_MID, 1, 1);

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

  lvLoadTitleShadow = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadTitleShadow, loadTitleWidth);
  lv_label_set_long_mode(lvLoadTitleShadow, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_font(lvLoadTitleShadow, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvLoadTitleShadow, LV_ALIGN_TOP_LEFT, 1, 0);

  lvLoadTitle = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadTitle, loadTitleWidth);
  lv_label_set_long_mode(lvLoadTitle, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_font(lvLoadTitle, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvLoadTitle, LV_ALIGN_TOP_LEFT, 0, -1);

  lvLoadPercentShadow = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadPercentShadow, 46);
  lv_label_set_long_mode(lvLoadPercentShadow, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvLoadPercentShadow, LV_TEXT_ALIGN_RIGHT, 0);
  lv_obj_set_style_text_font(lvLoadPercentShadow, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvLoadPercentShadow, LV_ALIGN_TOP_RIGHT, 1, 0);

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
  if (lvFooterShadow && obj == lvFooter) lv_obj_set_x(lvFooterShadow, value + 1);
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
    if (lvFooterShadow) lv_obj_set_width(lvFooterShadow, lv_obj_get_width(lvFooterClip));
    lv_label_set_long_mode(lvFooter, LV_LABEL_LONG_DOT);
    if (lvFooterShadow) lv_label_set_long_mode(lvFooterShadow, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_align(lvFooter, LV_TEXT_ALIGN_CENTER, 0);
    if (lvFooterShadow) lv_obj_set_style_text_align(lvFooterShadow, LV_TEXT_ALIGN_CENTER, 0);
    setPremiumLabelText(lvFooter, lvFooterShadow, CODE_PET_DISCONNECTED_LABEL);
    lv_obj_align(lvFooter, LV_ALIGN_CENTER, 0, 0);
    if (lvFooterShadow) lv_obj_align(lvFooterShadow, LV_ALIGN_CENTER, 1, 1);
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
  if (lvFooterShadow) lv_obj_set_width(lvFooterShadow, LV_SIZE_CONTENT);
  lv_label_set_long_mode(lvFooter, LV_LABEL_LONG_CLIP);
  if (lvFooterShadow) lv_label_set_long_mode(lvFooterShadow, LV_LABEL_LONG_CLIP);
  lv_obj_set_style_text_align(lvFooter, LV_TEXT_ALIGN_LEFT, 0);
  if (lvFooterShadow) lv_obj_set_style_text_align(lvFooterShadow, LV_TEXT_ALIGN_LEFT, 0);
  setPremiumLabelText(lvFooter, lvFooterShadow, text.c_str());
  lv_obj_update_layout(lvFooter);
  if (lvFooterShadow) lv_obj_update_layout(lvFooterShadow);

  int16_t clipWidth = lv_obj_get_width(lvFooterClip);
  int16_t textWidth = lv_obj_get_width(lvFooter);
  int16_t startX = clipWidth;
  int16_t endX = -textWidth;
  uint32_t distance = static_cast<uint32_t>(clipWidth + textWidth);
  uint32_t duration = (distance * 1000U) / 230U;
  if (duration < 900U) duration = 900U;

  lv_obj_set_y(lvFooter, 1);
  lv_obj_set_x(lvFooter, startX);
  if (lvFooterShadow) {
    lv_obj_set_y(lvFooterShadow, 2);
    lv_obj_set_x(lvFooterShadow, startX + 1);
  }

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
  const String fallbackSlug = String(CODE_PET_LVGL_FALLBACK_PERSONA_SLUG);
  String renderSlug = pet.personaSlug.length() ? pet.personaSlug : fallbackSlug;
  String renderState = normalizePacketState(connected ? pet.state : String("idle"));
  const bool imageLoading = connected && dynamicPersonaReceiving && dynamicPersonaShowLoading &&
                            dynamicPersonaTransferSlug == renderSlug &&
                            dynamicPersonaTransferState == normalizePacketState(renderState);
  const uint8_t imageProgress = imageLoading ? dynamicPersonaProgressPercent() : 0;
  const lv_img_dsc_t *frame = dynamicPersonaFrameForSlug(renderSlug, renderState);
  bool frameUsesCurrentPersona = frame != nullptr;
  if (!frame) {
    frame = codePetPersonaFrame(renderSlug, renderState, frameIndex);
    frameUsesCurrentPersona = frame != nullptr;
  }
  if (!frame && dynamicPersonaReady && renderSlug == dynamicPersonaSlug) {
    frame = dynamicPersonaFrameForSlugAnyState(renderSlug);
    frameUsesCurrentPersona = frame != nullptr;
  }
  if (!frame && connected) {
    frame = codePetPersonaFrame(fallbackSlug, renderState, frameIndex);
    frameUsesCurrentPersona = false;
  }
  if (!frame && !connected && dynamicPersonaReady) {
    frame = dynamicPersonaFrameForSlug(dynamicPersonaSlug, dynamicPersonaState);
    frameUsesCurrentPersona = frame != nullptr;
  }
  if (!frame) {
    frame = codePetPersonaFrame(fallbackSlug, renderState, frameIndex);
    frameUsesCurrentPersona = false;
  }
  const bool showFallbackPanel = frame == nullptr;
  if (showFallbackPanel && !connected && !pet.personaSlug.length()) return false;

  lv_obj_set_style_bg_color(lv_scr_act(), lvColor(bg), 0);
  lv_obj_set_style_bg_color(lvRoot, lvColor(bg), 0);
  lv_obj_set_style_bg_opa(lvRoot, LV_OPA_COVER, 0);

  const bool night = isNightTheme();
  const uint16_t labelInk = night ? rgb565(255, 255, 255) : rgb565(30, 40, 54);
  const uint16_t labelMuted = night ? rgb565(232, 238, 248) : rgb565(38, 49, 66);
  const uint16_t loadPanelBg = night ? rgb565(8, 10, 14) : panel;
  const uint16_t loadTrackBg = night ? rgb565(36, 42, 54) : rgb565(224, 230, 238);
  stylePremiumLabel(lvHeader, labelInk);
  stylePremiumShadow(lvHeaderShadow, labelInk, LV_OPA_40);
  stylePremiumLabel(lvStatus, accent);
  stylePremiumShadow(lvStatusShadow, accent, LV_OPA_40);
  stylePremiumLabel(lvFooter, labelMuted);
  stylePremiumShadow(lvFooterShadow, labelMuted, LV_OPA_40);
  lv_obj_set_style_bg_color(lvLoadPanel, lvColor(loadPanelBg), 0);
  lv_obj_set_style_bg_opa(lvLoadPanel, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(lvLoadPanel, lvColor(accent), 0);
  stylePremiumLabel(lvLoadTitle, labelInk);
  stylePremiumShadow(lvLoadTitleShadow, labelInk, LV_OPA_50);
  stylePremiumLabel(lvLoadPercent, accent);
  stylePremiumShadow(lvLoadPercentShadow, accent, LV_OPA_50);
  lv_obj_set_style_bg_color(lvLoadTrack, lvColor(loadTrackBg), 0);
  lv_obj_set_style_bg_opa(lvLoadTrack, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(lvLoadFill, lvColor(accent), 0);
  lv_obj_set_style_bg_opa(lvLoadFill, LV_OPA_COVER, 0);
  String headerText = connected ? cleanText(pet.agent, 22) : "";
  setPremiumLabelText(lvHeader, lvHeaderShadow, headerText.c_str());
  String statusText = connected ? cleanText(imageLoading ? String("Sync ") + String(imageProgress) + "%" : displayStateLabel(), 20) : "";
  setPremiumLabelText(lvStatus, lvStatusShadow, statusText.c_str());
  String footer = connected ? cleanText(pet.output, CODE_PET_OUTPUT_MAX_CHARS) : String(CODE_PET_DISCONNECTED_LABEL);
  updateFooterTicker(footer, connected);
  if (imageLoading) {
    String progressText = String(imageProgress) + "%";
    setPremiumLabelText(lvLoadTitle, lvLoadTitleShadow, "Syncing");
    setPremiumLabelText(lvLoadPercent, lvLoadPercentShadow, progressText.c_str());
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

  if (showFallbackPanel) {
    lv_obj_add_flag(lvImage, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(lvFallback, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_img_set_src(lvImage, frame);
    lv_img_set_pivot(lvImage, CODE_PET_DYNAMIC_PERSONA_WIDTH / 2, CODE_PET_DYNAMIC_PERSONA_HEIGHT / 2);
    lv_img_set_angle(lvImage, connected && frameUsesCurrentPersona ? petImageAngle() : 0);
    lv_img_set_zoom(lvImage, connected && frameUsesCurrentPersona ? petImageZoom() : 256);
    lv_obj_align(lvImage, LV_ALIGN_CENTER,
                 connected && frameUsesCurrentPersona ? petImageShiftX() : 0,
                 connected ? petBob() : ((frameIndex % 2) ? -1 : 0));
    lv_obj_clear_flag(lvImage, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(lvFallback, LV_OBJ_FLAG_HIDDEN);
  }
  lv_obj_move_foreground(lvHeaderShadow);
  lv_obj_move_foreground(lvHeader);
  lv_obj_move_foreground(lvStatusShadow);
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
static const lv_img_dsc_t *dynamicPersonaFrameForSlug(const String &slug, const String &state) {
  if (!dynamicPersonaReady || !dynamicPersonaSlug.length() || slug != dynamicPersonaSlug) return nullptr;
  if (normalizePacketState(state) != dynamicPersonaState) return nullptr;
  return dynamicPersonaFrameForSlugAnyState(slug);
}

static const lv_img_dsc_t *dynamicPersonaFrameForSlugAnyState(const String &slug) {
  if (!dynamicPersonaReady || !dynamicPersonaSlug.length() || slug != dynamicPersonaSlug) return nullptr;
  uint8_t count = dynamicPersonaFrameCount;
  if (count < 1) count = 1;
  if (count > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) count = CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES;
  uint8_t slot = count > 1 ? (frameIndex % count) : 0;
  return &dynamicPersonaImages[slot];
}

static void invalidateDynamicPersonaImage(uint8_t slot) {
  if (slot >= CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) return;
  lv_img_cache_invalidate_src(&dynamicPersonaImages[slot]);
}

static void clearDynamicPersonaFrame() {
  dynamicPersonaReady = false;
  dynamicPersonaReceiving = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaId = "";
  dynamicPersonaSlug = "";
  dynamicPersonaState = "idle";
  dynamicPersonaTransferSlug = "";
  dynamicPersonaTransferState = "idle";
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaReceived = 0;
  dynamicPersonaFrameCount = 1;
  dynamicPersonaTransferFrameCount = 1;
  dynamicPersonaTransferFrameIndex = 0;
  dynamicPersonaReceivedFrameMask = 0;
  dynamicPersonaLastProgressPercent = 0;
  dynamicPersonaRleIndex = 0;
}

#if defined(ESP32)
static bool ensureDynamicPersonaStore() {
  if (dynamicPersonaStoreMounted) return true;
  dynamicPersonaStoreMounted = SPIFFS.begin(true);
  return dynamicPersonaStoreMounted;
}

static bool writeDynamicPersonaFile(const char *tmpPath, const char *path, const uint8_t *data, size_t size) {
  if (!ensureDynamicPersonaStore()) return false;
  SPIFFS.remove(tmpPath);
  fs::File file = SPIFFS.open(tmpPath, FILE_WRITE);
  if (!file) return false;
  size_t written = file.write(data, size);
  file.close();
  if (written != size) {
    SPIFFS.remove(tmpPath);
    return false;
  }
  SPIFFS.remove(path);
  return SPIFFS.rename(tmpPath, path);
}

static bool readDynamicPersonaFile(const char *path, uint8_t *data, size_t size) {
  if (!ensureDynamicPersonaStore()) return false;
  fs::File file = SPIFFS.open(path, FILE_READ);
  if (!file) return false;
  if (file.size() != size) {
    file.close();
    return false;
  }
  size_t read = file.read(data, size);
  file.close();
  return read == size;
}

static void saveDynamicPersonaFrame() {
  if (!dynamicPersonaReady || !dynamicPersonaSlug.length()) return;
  if (!ensureDynamicPersonaStore()) return;

  uint8_t count = dynamicPersonaFrameCount;
  if (count < 1) count = 1;
  if (count > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) count = CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES;
  for (uint8_t i = 0; i < count; i++) {
    if (!writeDynamicPersonaFile(DYNAMIC_PERSONA_FRAME_TMP_PATHS[i],
                                 DYNAMIC_PERSONA_FRAME_PATHS[i],
                                 dynamicPersonaPixels[i],
                                 CODE_PET_DYNAMIC_PERSONA_BYTES)) {
      SPIFFS.remove(DYNAMIC_PERSONA_META_PATH);
      return;
    }
  }

  JsonDocument doc;
  doc["v"] = 1;
  doc["w"] = CODE_PET_DYNAMIC_PERSONA_WIDTH;
  doc["h"] = CODE_PET_DYNAMIC_PERSONA_HEIGHT;
  doc["z"] = CODE_PET_DYNAMIC_PERSONA_BYTES;
  doc["fc"] = count;
  doc["p"] = dynamicPersonaSlug;
  doc["st"] = dynamicPersonaState;
  doc["d"] = pet.personaName;
  doc["k"] = pet.personaKind;
  doc["u"] = pet.spriteUrl;
  doc["th"] = pet.theme;

  SPIFFS.remove(DYNAMIC_PERSONA_META_TMP_PATH);
  fs::File meta = SPIFFS.open(DYNAMIC_PERSONA_META_TMP_PATH, FILE_WRITE);
  if (!meta) return;
  bool ok = serializeJson(doc, meta) > 0;
  meta.close();
  if (!ok) {
    SPIFFS.remove(DYNAMIC_PERSONA_META_TMP_PATH);
    return;
  }
  SPIFFS.remove(DYNAMIC_PERSONA_META_PATH);
  SPIFFS.rename(DYNAMIC_PERSONA_META_TMP_PATH, DYNAMIC_PERSONA_META_PATH);
}

static void loadDynamicPersonaFrame() {
  if (!ensureDynamicPersonaStore()) return;
  fs::File meta = SPIFFS.open(DYNAMIC_PERSONA_META_PATH, FILE_READ);
  if (!meta) return;
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, meta);
  meta.close();
  if (error) return;

  int version = doc["v"] | 0;
  int width = doc["w"] | 0;
  int height = doc["h"] | 0;
  uint32_t size = doc["z"] | 0;
  int frameCount = doc["fc"] | 1;
  String slug = cleanText(String(doc["p"] | ""), 48);
  String state = normalizePacketState(String(doc["st"] | "idle"));
  if (version != 1 ||
      !slug.length() ||
      width != CODE_PET_DYNAMIC_PERSONA_WIDTH ||
      height != CODE_PET_DYNAMIC_PERSONA_HEIGHT ||
      size != CODE_PET_DYNAMIC_PERSONA_BYTES ||
      frameCount < 1 ||
      frameCount > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) {
    return;
  }

  for (uint8_t i = 0; i < static_cast<uint8_t>(frameCount); i++) {
    if (!readDynamicPersonaFile(DYNAMIC_PERSONA_FRAME_PATHS[i], dynamicPersonaPixels[i], CODE_PET_DYNAMIC_PERSONA_BYTES)) return;
  }

  dynamicPersonaReady = true;
  dynamicPersonaReceiving = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaSlug = slug;
  dynamicPersonaState = state;
  dynamicPersonaTransferSlug = "";
  dynamicPersonaTransferState = state;
  dynamicPersonaFrameCount = static_cast<uint8_t>(frameCount);
  dynamicPersonaTransferFrameCount = dynamicPersonaFrameCount;
  dynamicPersonaReceivedFrameMask = (1U << dynamicPersonaFrameCount) - 1U;
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaReceived = 0;
  dynamicPersonaLastProgressPercent = 100;
  dynamicPersonaRleIndex = 0;

  pet.personaSlug = slug;
  pet.personaName = cleanText(String(doc["d"] | ""), 48);
  if (!pet.personaName.length()) pet.personaName = slug;
  pet.personaKind = cleanText(String(doc["k"] | ""), 24);
  pet.spriteUrl = String(doc["u"] | "");
  String storedTheme = cleanText(String(doc["th"] | ""), 12);
  pet.theme = (storedTheme == "night" || storedTheme == "dark") ? storedTheme : "day";
}
#else
static void saveDynamicPersonaFrame() {}
static void loadDynamicPersonaFrame() {}
#endif

static void abortDynamicPersonaTransfer() {
  dynamicPersonaReceiving = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaTransferSlug = "";
  dynamicPersonaTransferState = "idle";
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
    String displayName = cleanText(String(src["d"] | src["displayName"] | ""), 48);
    String kind = cleanText(String(src["k"] | src["kind"] | ""), 24);
    String spriteUrl = String(src["u"] | src["spritesheetUrl"] | "");
    String theme = cleanText(String(src["th"] | src["theme"] | ""), 12);
    String state = normalizePacketState(String(src["st"] | src["state"] | "idle"));
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
      dynamicPersonaTransferState = state;
    } else if (id != dynamicPersonaId ||
               slug != dynamicPersonaTransferSlug ||
               state != dynamicPersonaTransferState ||
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
    String previousPersonaSlug = pet.personaSlug;
    pet.personaSlug = slug;
    if (displayName.length()) pet.personaName = displayName;
    else if (previousPersonaSlug != slug || !pet.personaName.length()) pet.personaName = slug;
    if (kind.length()) pet.personaKind = kind;
    if (!src["u"].isNull() || !src["spritesheetUrl"].isNull()) pet.spriteUrl = spriteUrl;
    if (theme == "night" || theme == "dark") pet.theme = theme;
    else if (theme.length()) pet.theme = "day";
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
      invalidateDynamicPersonaImage(dynamicPersonaTransferFrameIndex);
      dynamicPersonaReady = true;
      dynamicPersonaSlug = dynamicPersonaTransferSlug;
      dynamicPersonaState = dynamicPersonaTransferState;
      dynamicPersonaReceivedFrameMask |= (1U << dynamicPersonaTransferFrameIndex);
      if (dynamicPersonaReceivedFrameMask & 0x01) dynamicPersonaFrameCount = 1;
      uint8_t completeMask = (1U << dynamicPersonaTransferFrameCount) - 1U;
      if ((dynamicPersonaReceivedFrameMask & completeMask) == completeMask) {
        dynamicPersonaFrameCount = dynamicPersonaTransferFrameCount;
        dynamicPersonaTransferSlug = "";
        dynamicPersonaTransferState = dynamicPersonaState;
        dynamicPersonaLastProgressPercent = 100;
        saveDynamicPersonaFrame();
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
  String nextState = normalizePacketState(String(src["s"] | src["state"] | "idle"));
  String nextStateLabel = String(src["sl"] | src["stateLabel"] | "");
  String nextAgent = String(src["a"] | src["agentName"] | src["agent"] | "agent");
  String nextEvent = String(src["e"] | src["event"] | "");
  String nextTitle = String(src["m"] | src["title"] | "");
  String nextOutput = String(src["o"] | src["output"] | "");
  String nextLocale = cleanText(String(src["l"] | src["locale"] | pet.locale), 12);
  if (!nextLocale.length()) nextLocale = "en";
  JsonVariantConst persona = src["persona"];
  bool hasPersonaFields = !src["p"].isNull() || !src["d"].isNull() ||
                           !src["k"].isNull() || !src["u"].isNull() ||
                           !persona["slug"].isNull() || !persona["displayName"].isNull() ||
                           !persona["kind"].isNull() || !persona["spritesheetUrl"].isNull();
  String nextPersonaSlug = hasPersonaFields ? String(src["p"] | persona["slug"] | "lulu") : pet.personaSlug;
  String nextPersonaName = hasPersonaFields ? String(src["d"] | persona["displayName"] | "Lulu") : pet.personaName;
  String nextPersonaKind = hasPersonaFields ? String(src["k"] | persona["kind"] | "") : pet.personaKind;
  String nextSpriteUrl = hasPersonaFields ? String(src["u"] | persona["spritesheetUrl"] | "") : pet.spriteUrl;
  bool hasTheme = !src["th"].isNull() || !src["theme"].isNull();
  String nextTheme = hasTheme ? String(src["th"] | src["theme"] | "day") : pet.theme;
  int nextActiveCount = src["n"] | src["activeCount"] | 0;
  nextStateLabel = localizedStateLabel(nextState, nextLocale, nextStateLabel);

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  if (dynamicPersonaReceiving &&
      (nextState != dynamicPersonaTransferState ||
       (dynamicPersonaTransferSlug.length() && nextPersonaSlug != dynamicPersonaTransferSlug))) {
    abortDynamicPersonaTransfer();
  }
#endif

  bool changed = nextState != pet.state || nextStateLabel != pet.stateLabel ||
                 nextAgent != pet.agent || nextEvent != pet.event ||
                 nextTitle != pet.title || nextOutput != pet.output || nextPersonaSlug != pet.personaSlug ||
                 nextPersonaName != pet.personaName || nextPersonaKind != pet.personaKind ||
                 nextSpriteUrl != pet.spriteUrl || nextTheme != pet.theme ||
                 nextLocale != pet.locale ||
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
  pet.locale = nextLocale;
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
      String state = normalizePacketState(String(item["state"] | item["packet"]["s"] | "idle"));
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

static void clearBleFragment() {
  incomingBleFragment = "";
  incomingBleFragmentId = '\0';
  incomingBleFragmentExpectedBytes = 0;
  incomingBleFragmentActive = false;
}

static bool parseBleFragmentStart(const std::string &value, char &id, size_t &expectedBytes) {
  if (value.length() < 4 || value[0] != '#' || value[2] != ':') return false;
  id = value[1];
  expectedBytes = 0;
  for (size_t i = 3; i < value.length(); i++) {
    char c = value[i];
    if (c < '0' || c > '9') return false;
    expectedBytes = expectedBytes * 10 + static_cast<size_t>(c - '0');
    if (expectedBytes > CODE_PET_BLE_FRAGMENT_MAX_BYTES) return false;
  }
  return expectedBytes > 0;
}

static String stringFromBleBytes(const std::string &value, size_t offset = 0) {
  String out;
  if (offset >= value.length()) return out;
  out.reserve(value.length() - offset);
  for (size_t i = offset; i < value.length(); i++) out += static_cast<char>(value[i]);
  return out;
}

static void appendBleFragmentBytes(const std::string &value, size_t offset) {
  for (size_t i = offset; i < value.length(); i++) incomingBleFragment += static_cast<char>(value[i]);
}

static void enqueueCompletedBleFragment() {
  if (incomingBleFragment.length() == incomingBleFragmentExpectedBytes) enqueuePayload(incomingBleFragment);
  clearBleFragment();
}

static void handleBleWriteValue(const std::string &value) {
  if (!value.length()) return;
  char marker = value[0];
  if (marker == '#') {
    char id = '\0';
    size_t expectedBytes = 0;
    clearBleFragment();
    if (!parseBleFragmentStart(value, id, expectedBytes)) return;
    incomingBleFragmentId = id;
    incomingBleFragmentExpectedBytes = expectedBytes;
    incomingBleFragmentActive = true;
    incomingBleFragment.reserve(expectedBytes);
    return;
  }

  if (marker == '+') {
    if (!incomingBleFragmentActive || value.length() < 2 || value[1] != incomingBleFragmentId) return;
    size_t nextLength = incomingBleFragment.length() + value.length() - 2;
    if (nextLength > incomingBleFragmentExpectedBytes || nextLength > CODE_PET_BLE_FRAGMENT_MAX_BYTES) {
      clearBleFragment();
      return;
    }
    appendBleFragmentBytes(value, 2);
    if (incomingBleFragment.length() >= incomingBleFragmentExpectedBytes) enqueueCompletedBleFragment();
    return;
  }

  if (marker == '!') {
    if (incomingBleFragmentActive && value.length() >= 2 && value[1] == incomingBleFragmentId) {
      enqueueCompletedBleFragment();
    }
    return;
  }

  enqueuePayload(stringFromBleBytes(value));
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
    clearBleFragment();
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
    handleBleWriteValue(value);
  }
};

static void setupBle() {
  BLEDevice::init(CODE_PET_DEVICE_NAME);
  BLEDevice::setMTU(CODE_PET_BLE_MTU);
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
#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  loadDynamicPersonaFrame();
#endif
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
