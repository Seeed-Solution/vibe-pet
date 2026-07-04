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
#elif defined(CODE_PET_DISPLAY_ARDUINO_GFX)
#include <Arduino_GFX_Library.h>
#if defined(CODE_PET_USE_SENSECAP_INDICATOR) && defined(ESP32) && CONFIG_IDF_TARGET_ESP32S3
#include "esp32s3/rom/cache.h"
#endif
#if defined(CODE_PET_USE_SENSECAP_INDICATOR)
#include "Indicator_Extender.h"
#include "Indicator_SWSPI.h"
#include "Indicator_RGB_Display.h"
#endif
#elif defined(CODE_PET_DISPLAY_OLED)
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#endif

#if defined(CODE_PET_DISPLAY_TFT_ESPI) || defined(CODE_PET_DISPLAY_ARDUINO_GFX)
#define CODE_PET_DISPLAY_COLOR_GFX
#endif

#if defined(CODE_PET_USE_LVGL) && defined(CODE_PET_DISPLAY_COLOR_GFX)
#define CODE_PET_USE_COLOR_LVGL
#endif

#if defined(CODE_PET_STATUS_PIXEL)
#include <Adafruit_NeoPixel.h>
#endif

#if defined(CODE_PET_HAS_RPC_BLE)
#include <rpcBLEDevice.h>
#include <BLEServer.h>
#elif defined(CODE_PET_HAS_BLE)
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

#if defined(ESP32) && defined(CODE_PET_USE_COLOR_LVGL)
#include <esp_heap_caps.h>
#include <FS.h>
#include <SPIFFS.h>
#endif

#if defined(CODE_PET_USE_COLOR_LVGL)
#include <lvgl.h>
#if LV_FONT_MONTSERRAT_36
#define CODE_PET_LVGL_PROGRESS_FONT &lv_font_montserrat_36
#else
#define CODE_PET_LVGL_PROGRESS_FONT LV_FONT_DEFAULT
#endif
#if defined(CODE_PET_DISPLAY_TFT_ESPI)
class TFT_eSPI;
extern TFT_eSPI tft;
#elif defined(CODE_PET_DISPLAY_ARDUINO_GFX)
class Arduino_GFX;
extern Arduino_GFX *gfx;
#endif
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
#ifndef CODE_PET_ANIMATION_FRAME_MS
#define CODE_PET_ANIMATION_FRAME_MS 150
#endif
#ifndef CODE_PET_ARDUINO_GFX_AUTO_FLUSH
#define CODE_PET_ARDUINO_GFX_AUTO_FLUSH 1
#endif
#ifndef CODE_PET_ARDUINO_GFX_PARTIAL_FLUSH
#define CODE_PET_ARDUINO_GFX_PARTIAL_FLUSH 0
#endif

#define CODE_PET_DISCONNECTED_LABEL "Disconnected"
#define CODE_PET_OUTPUT_MAX_CHARS 120
#ifndef CODE_PET_LVGL_FALLBACK_PERSONA_SLUG
#define CODE_PET_LVGL_FALLBACK_PERSONA_SLUG "lulu"
#endif

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
#define CODE_PET_BLE_PAYLOAD_QUEUE_SIZE 64
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
#if defined(CODE_PET_TEST_BUTTON_PIN)
bool localTestActive = false;
#endif

static void markDirty();
static bool displayConnected() {
#if defined(CODE_PET_TEST_BUTTON_PIN)
  return bleConnected || localTestActive;
#else
  return bleConnected;
#endif
}

#if defined(CODE_PET_USE_COLOR_LVGL) || (defined(CODE_PET_USE_SIMPLE_DYNAMIC_PERSONA) && defined(CODE_PET_DISPLAY_TFT_ESPI))
#ifndef CODE_PET_DYNAMIC_PERSONA_WIDTH
#define CODE_PET_DYNAMIC_PERSONA_WIDTH 144
#endif
#ifndef CODE_PET_DYNAMIC_PERSONA_HEIGHT
#define CODE_PET_DYNAMIC_PERSONA_HEIGHT 156
#endif
#ifndef CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES
#define CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES 2
#endif
#ifndef CODE_PET_DYNAMIC_PERSONA_STATE_COUNT
#define CODE_PET_DYNAMIC_PERSONA_STATE_COUNT 6
#endif
#define CODE_PET_DYNAMIC_PERSONA_BYTES (CODE_PET_DYNAMIC_PERSONA_WIDTH * CODE_PET_DYNAMIC_PERSONA_HEIGHT * 2)
#endif

#if defined(CODE_PET_USE_COLOR_LVGL)
#ifndef CP_TFT_WIDTH
#define CP_TFT_WIDTH 320
#endif
#ifndef CODE_PET_LVGL_BUFFER_ROWS
#define CODE_PET_LVGL_BUFFER_ROWS 20
#endif
#ifndef CODE_PET_LVGL_BUFFER_IN_PSRAM
#define CODE_PET_LVGL_BUFFER_IN_PSRAM 0
#endif
#ifndef CODE_PET_LVGL_FALLBACK_BUFFER_ROWS
#define CODE_PET_LVGL_FALLBACK_BUFFER_ROWS 8
#endif
#ifndef CODE_PET_LVGL_IMAGE_BASE_ZOOM
#define CODE_PET_LVGL_IMAGE_BASE_ZOOM 256
#endif
#ifndef CODE_PET_LVGL_PRESCALE_IMAGE
#define CODE_PET_LVGL_PRESCALE_IMAGE 0
#endif
#define CODE_PET_LVGL_PRESCALED_WIDTH ((CODE_PET_DYNAMIC_PERSONA_WIDTH * CODE_PET_LVGL_IMAGE_BASE_ZOOM) / 256)
#define CODE_PET_LVGL_PRESCALED_HEIGHT ((CODE_PET_DYNAMIC_PERSONA_HEIGHT * CODE_PET_LVGL_IMAGE_BASE_ZOOM) / 256)
#define CODE_PET_LVGL_PRESCALED_BYTES (CODE_PET_LVGL_PRESCALED_WIDTH * CODE_PET_LVGL_PRESCALED_HEIGHT * 2)
static lv_disp_draw_buf_t lvDrawBuffer;
#if CODE_PET_LVGL_BUFFER_IN_PSRAM && defined(ESP32)
static lv_color_t *lvBufferA = nullptr;
static lv_color_t *lvBufferB = nullptr;
static lv_color_t lvFallbackBufferA[CP_TFT_WIDTH * CODE_PET_LVGL_FALLBACK_BUFFER_ROWS];
static lv_color_t lvFallbackBufferB[CP_TFT_WIDTH * CODE_PET_LVGL_FALLBACK_BUFFER_ROWS];
static uint32_t lvDrawBufferPixels = 0;
#else
static lv_color_t lvBufferA[CP_TFT_WIDTH * CODE_PET_LVGL_BUFFER_ROWS];
static lv_color_t lvBufferB[CP_TFT_WIDTH * CODE_PET_LVGL_BUFFER_ROWS];
#endif
static lv_disp_drv_t lvDisplayDriver;
static lv_obj_t *lvRoot = nullptr;
static lv_obj_t *lvHeader = nullptr;
static lv_obj_t *lvHeaderShadow = nullptr;
static lv_obj_t *lvStatus = nullptr;
static lv_obj_t *lvStatusShadow = nullptr;
static lv_obj_t *lvFooterClip = nullptr;
static lv_obj_t *lvFooter = nullptr;
static lv_obj_t *lvFooterShadow = nullptr;
static lv_obj_t *lvImages[2] = {nullptr, nullptr};
static uint8_t lvImageFrontSlot = 0;
static const lv_img_dsc_t *lvImageSources[2] = {nullptr, nullptr};
static uint16_t lvImageSourceVersions[2] = {0, 0};
static bool lvImageSourcePrescaled[2] = {false, false};
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
static bool lvFooterDisconnectedMode = false;
static bool lvStyleCacheValid = false;
static uint16_t lvStyleBg = 0;
static uint16_t lvStylePanel = 0;
static uint16_t lvStyleInk = 0;
static uint16_t lvStyleMuted = 0;
static uint16_t lvStyleAccent = 0;
static uint16_t lvStyleLabelInk = 0;
static uint16_t lvStyleLabelMuted = 0;
static uint16_t lvStyleLoadPanelBg = 0;
static uint16_t lvStyleLoadTrackBg = 0;
static String lvHeaderTextCache = "";
static String lvStatusTextCache = "";
static String lvLoadTitleTextCache = "";
static String lvLoadPercentTextCache = "";
static String lvFallbackPersonaTextCache = "";
static String lvFallbackStateTextCache = "";
static String lvFallbackAgentTextCache = "";
#if defined(CODE_PET_DISPLAY_ARDUINO_GFX) && CODE_PET_ARDUINO_GFX_PARTIAL_FLUSH
static lv_area_t lvFlushDirtyArea;
static bool lvFlushDirtyAreaValid = false;
static bool lvForceFullFlush = false;
#endif

#if CODE_PET_LVGL_PRESCALE_IMAGE && defined(ESP32)
static uint8_t *lvPrescaledPixels[2] = {nullptr, nullptr};
static bool lvPrescaleReady = false;
static lv_img_dsc_t lvPrescaledImages[2] = {
  {
    .header = {
      .cf = LV_IMG_CF_TRUE_COLOR,
      .w = CODE_PET_LVGL_PRESCALED_WIDTH,
      .h = CODE_PET_LVGL_PRESCALED_HEIGHT,
    },
    .data_size = CODE_PET_LVGL_PRESCALED_BYTES,
    .data = nullptr,
  },
  {
    .header = {
      .cf = LV_IMG_CF_TRUE_COLOR,
      .w = CODE_PET_LVGL_PRESCALED_WIDTH,
      .h = CODE_PET_LVGL_PRESCALED_HEIGHT,
    },
    .data_size = CODE_PET_LVGL_PRESCALED_BYTES,
    .data = nullptr,
  },
};
#endif

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
static uint16_t dynamicPersonaImageVersions[CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES] = {0};
static String dynamicPersonaId = "";
static String dynamicPersonaSlug = "";
static String dynamicPersonaState = "idle";
static String dynamicPersonaTransferSlug = "";
static String dynamicPersonaTransferState = "idle";
static bool dynamicPersonaReady = false;
static bool dynamicPersonaReceiving = false;
static bool dynamicPersonaAtlasReceiving = false;
static bool dynamicPersonaAtlasReady = false;
static bool dynamicPersonaShowLoading = true;
static DynamicPersonaFormat dynamicPersonaFormat = DYNAMIC_PERSONA_RAW_RGB565;
static uint16_t dynamicPersonaExpectedSeq = 0;
static uint32_t dynamicPersonaReceived = 0;
static uint32_t dynamicPersonaTransferExpectedBytes = 0;
static uint8_t dynamicPersonaFrameCount = 1;
static uint8_t dynamicPersonaTransferFrameCount = 1;
static uint8_t dynamicPersonaTransferFrameIndex = 0;
static uint8_t dynamicPersonaReceivedFrameMask = 0;
static uint8_t dynamicPersonaLastProgressPercent = 0;
static uint8_t dynamicPersonaRleTriple[3] = {0, 0, 0};
static uint8_t dynamicPersonaRleIndex = 0;
static uint16_t dynamicPersonaAtlasWidth = 0;
static uint16_t dynamicPersonaAtlasHeight = 0;
static uint8_t dynamicPersonaAtlasCols = 0;
static uint8_t dynamicPersonaAtlasRows = 0;
static uint8_t dynamicPersonaAtlasFrameCount = 1;
static const char *DYNAMIC_PERSONA_STATE_NAMES[CODE_PET_DYNAMIC_PERSONA_STATE_COUNT] = {
  "idle", "notification", "working", "error", "thinking", "attention"
};
static String dynamicPersonaCachedSlug = "";
static String dynamicPersonaCachedTheme = "day";
static uint8_t dynamicPersonaCachedStateMask = 0;
static uint8_t dynamicPersonaCachedFrameCounts[CODE_PET_DYNAMIC_PERSONA_STATE_COUNT] = {0};
#if defined(ESP32)
static bool dynamicPersonaStoreMounted = false;
static const char *DYNAMIC_PERSONA_META_PATH = "/pet_meta.json";
static const char *DYNAMIC_PERSONA_META_TMP_PATH = "/pet_meta.tmp";
static const char *DYNAMIC_PERSONA_ATLAS_PATH = "/pet_atlas.bin";
static const char *DYNAMIC_PERSONA_ATLAS_TMP_PATH = "/pet_atlas.tmp";
static fs::File dynamicPersonaAtlasWriteFile;
static uint8_t dynamicPersonaAtlasWriteBuffer[1024];
static uint16_t dynamicPersonaAtlasWriteBufferSize = 0;
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

#if defined(CODE_PET_USE_COLOR_LVGL)
extern const lv_img_dsc_t *codePetPersonaFrame(const String &slug, const String &state, uint8_t frameIndex);
extern bool codePetPersonaAvailable(const String &slug);

#ifndef CODE_PET_LVGL_TFT_SWAP_BYTES
#define CODE_PET_LVGL_TFT_SWAP_BYTES 0
#endif

#ifndef CODE_PET_LVGL_TFT_SWAP_RB
#define CODE_PET_LVGL_TFT_SWAP_RB 0
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

static void setPremiumLabelTextIfChanged(lv_obj_t *label, lv_obj_t *shadow, String &cache, const String &text) {
  if (cache == text) return;
  cache = text;
  setPremiumLabelText(label, shadow, text.c_str());
}

static void setLabelTextIfChanged(lv_obj_t *label, String &cache, const String &text) {
  if (cache == text) return;
  cache = text;
  if (label) lv_label_set_text(label, text.c_str());
}

static void setLvHidden(lv_obj_t *obj, bool hidden) {
  if (!obj) return;
  const bool isHidden = lv_obj_has_flag(obj, LV_OBJ_FLAG_HIDDEN);
  if (hidden == isHidden) return;
  if (hidden) {
    lv_obj_add_flag(obj, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_clear_flag(obj, LV_OBJ_FLAG_HIDDEN);
  }
}

static void setPremiumLabelHidden(lv_obj_t *label, lv_obj_t *shadow, bool hidden) {
  setLvHidden(label, hidden);
  setLvHidden(shadow, hidden);
}

static void updateLvPersonaStyles(uint16_t bg, uint16_t panel, uint16_t ink, uint16_t muted,
                                  uint16_t accent, uint16_t labelInk, uint16_t labelMuted,
                                  uint16_t loadPanelBg, uint16_t loadTrackBg) {
  const bool first = !lvStyleCacheValid;
  if (first || lvStyleBg != bg) {
    lv_obj_set_style_bg_color(lv_scr_act(), lvColor(bg), 0);
    lv_obj_set_style_bg_color(lvRoot, lvColor(bg), 0);
    lvStyleBg = bg;
  }
  if (first || lvStyleLabelInk != labelInk) {
    stylePremiumLabel(lvHeader, labelInk);
    stylePremiumShadow(lvHeaderShadow, labelInk, LV_OPA_40);
    stylePremiumLabel(lvLoadTitle, labelInk);
    stylePremiumShadow(lvLoadTitleShadow, labelInk, LV_OPA_50);
    lvStyleLabelInk = labelInk;
  }
  if (first || lvStyleAccent != accent) {
    stylePremiumLabel(lvStatus, accent);
    stylePremiumShadow(lvStatusShadow, accent, LV_OPA_40);
    stylePremiumLabel(lvLoadPercent, labelInk);
    stylePremiumShadow(lvLoadPercentShadow, labelInk, LV_OPA_0);
    lv_obj_set_style_border_color(lvLoadPanel, lvColor(accent), 0);
    lv_obj_set_style_bg_color(lvLoadTrack, lvColor(accent), LV_PART_INDICATOR);
    lv_obj_set_style_text_color(lvFallbackState, lvColor(accent), 0);
    lvStyleAccent = accent;
  }
  if (first || lvStyleLabelMuted != labelMuted) {
    stylePremiumLabel(lvFooter, labelMuted);
    stylePremiumShadow(lvFooterShadow, labelMuted, LV_OPA_40);
    lvStyleLabelMuted = labelMuted;
  }
  if (first || lvStyleLoadPanelBg != loadPanelBg) {
    lv_obj_set_style_bg_color(lvLoadPanel, lvColor(loadPanelBg), 0);
    lvStyleLoadPanelBg = loadPanelBg;
  }
  if (first || lvStyleLoadTrackBg != loadTrackBg) {
    lv_obj_set_style_bg_color(lvLoadTrack, lvColor(loadTrackBg), LV_PART_MAIN);
    lvStyleLoadTrackBg = loadTrackBg;
  }
  if (first || lvStylePanel != panel) {
    lv_obj_set_style_bg_color(lvFallback, lvColor(panel), 0);
    lvStylePanel = panel;
  }
  if (first || lvStyleInk != ink) {
    lv_obj_set_style_border_color(lvFallback, lvColor(ink), 0);
    lv_obj_set_style_text_color(lvFallbackPersona, lvColor(ink), 0);
    lvStyleInk = ink;
  }
  if (first || lvStyleMuted != muted) {
    lv_obj_set_style_text_color(lvFallbackAgent, lvColor(muted), 0);
    lvStyleMuted = muted;
  }
  lvStyleCacheValid = true;
}

#if CODE_PET_LVGL_TFT_SWAP_RB
static uint16_t swapRgb565RedBlue(uint16_t color) {
  return ((color & 0xF800) >> 11) | (color & 0x07E0) | ((color & 0x001F) << 11);
}
#endif

#if defined(CODE_PET_DISPLAY_ARDUINO_GFX) && CODE_PET_ARDUINO_GFX_PARTIAL_FLUSH
static bool flushFullLvFramebuffer() {
#if defined(CODE_PET_USE_SENSECAP_INDICATOR) && defined(ESP32) && CONFIG_IDF_TARGET_ESP32S3 && CP_TFT_ROTATION == 0
  Arduino_RGB_Display *rgb = static_cast<Arduino_RGB_Display *>(gfx);
  uint16_t *framebuffer = rgb ? rgb->getFramebuffer() : nullptr;
  if (!framebuffer) return false;
  Cache_WriteBack_Addr(reinterpret_cast<uint32_t>(framebuffer),
                       static_cast<uint32_t>(CP_TFT_WIDTH) * CP_TFT_HEIGHT * sizeof(uint16_t));
  return true;
#else
  return false;
#endif
}

static void rememberLvFlushArea(const lv_area_t *area) {
  if (!area) return;
  if (!lvFlushDirtyAreaValid) {
    lvFlushDirtyArea = *area;
    lvFlushDirtyAreaValid = true;
    return;
  }
  if (area->x1 < lvFlushDirtyArea.x1) lvFlushDirtyArea.x1 = area->x1;
  if (area->y1 < lvFlushDirtyArea.y1) lvFlushDirtyArea.y1 = area->y1;
  if (area->x2 > lvFlushDirtyArea.x2) lvFlushDirtyArea.x2 = area->x2;
  if (area->y2 > lvFlushDirtyArea.y2) lvFlushDirtyArea.y2 = area->y2;
}

static bool flushRememberedLvArea() {
#if defined(CODE_PET_USE_SENSECAP_INDICATOR) && defined(ESP32) && CONFIG_IDF_TARGET_ESP32S3 && CP_TFT_ROTATION == 0
  if (!lvFlushDirtyAreaValid) return false;
  lv_area_t area = lvFlushDirtyArea;
  lvFlushDirtyAreaValid = false;
  if (area.x2 < 0 || area.y2 < 0 || area.x1 >= CP_TFT_WIDTH || area.y1 >= CP_TFT_HEIGHT) return true;
  if (area.x1 < 0) area.x1 = 0;
  if (area.y1 < 0) area.y1 = 0;
  if (area.x2 >= CP_TFT_WIDTH) area.x2 = CP_TFT_WIDTH - 1;
  if (area.y2 >= CP_TFT_HEIGHT) area.y2 = CP_TFT_HEIGHT - 1;
  const uint16_t width = area.x2 - area.x1 + 1;
  const uint16_t height = area.y2 - area.y1 + 1;
  Arduino_RGB_Display *rgb = static_cast<Arduino_RGB_Display *>(gfx);
  uint16_t *framebuffer = rgb ? rgb->getFramebuffer() : nullptr;
  if (!framebuffer) return false;
  uint16_t *start = framebuffer + static_cast<uint32_t>(area.y1) * CP_TFT_WIDTH + area.x1;
  const uint32_t bytes = (static_cast<uint32_t>(CP_TFT_WIDTH) * (height - 1) + width) * sizeof(uint16_t);
  Cache_WriteBack_Addr(reinterpret_cast<uint32_t>(start), bytes);
  return true;
#else
  lvFlushDirtyAreaValid = false;
  return false;
#endif
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
#if defined(CODE_PET_DISPLAY_TFT_ESPI)
  tft.startWrite();
  tft.setAddrWindow(area->x1, area->y1, width, height);
  tft.pushColors(pixels, count, CODE_PET_LVGL_TFT_SWAP_BYTES);
  tft.endWrite();
#elif defined(CODE_PET_DISPLAY_ARDUINO_GFX)
#if CODE_PET_LVGL_TFT_SWAP_BYTES
  gfx->draw16bitBeRGBBitmap(area->x1, area->y1, pixels, width, height);
#else
  gfx->draw16bitRGBBitmap(area->x1, area->y1, pixels, width, height);
#endif
#if !CODE_PET_ARDUINO_GFX_AUTO_FLUSH
#if CODE_PET_ARDUINO_GFX_PARTIAL_FLUSH
  rememberLvFlushArea(area);
  if (lv_disp_flush_is_last(disp)) {
    if (lvForceFullFlush) {
      lvFlushDirtyAreaValid = false;
      if (!flushFullLvFramebuffer()) gfx->flush();
    } else if (!flushRememberedLvArea()) {
      gfx->flush();
    }
  }
#else
  if (lv_disp_flush_is_last(disp)) gfx->flush();
#endif
#endif
#endif
  lv_disp_flush_ready(disp);
}

static uint32_t prepareLvDrawBufferPixels() {
#if CODE_PET_LVGL_BUFFER_IN_PSRAM && defined(ESP32)
  if (lvDrawBufferPixels) return lvDrawBufferPixels;

  const uint32_t requestedPixels = static_cast<uint32_t>(CP_TFT_WIDTH) * CODE_PET_LVGL_BUFFER_ROWS;
  const size_t requestedBytes = static_cast<size_t>(requestedPixels) * sizeof(lv_color_t);
  lv_color_t *bufferA = static_cast<lv_color_t *>(heap_caps_malloc(requestedBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  lv_color_t *bufferB = static_cast<lv_color_t *>(heap_caps_malloc(requestedBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));

  if (bufferA && bufferB) {
    lvBufferA = bufferA;
    lvBufferB = bufferB;
    lvDrawBufferPixels = requestedPixels;
    return lvDrawBufferPixels;
  }

  if (bufferA) heap_caps_free(bufferA);
  if (bufferB) heap_caps_free(bufferB);
  lvBufferA = lvFallbackBufferA;
  lvBufferB = lvFallbackBufferB;
  lvDrawBufferPixels = sizeof(lvFallbackBufferA) / sizeof(lvFallbackBufferA[0]);
  return lvDrawBufferPixels;
#else
  return sizeof(lvBufferA) / sizeof(lvBufferA[0]);
#endif
}

static void ensureLvglUi();
static bool renderPersonaWithLvgl(uint16_t bg, uint16_t header, uint16_t panel, uint16_t ink, uint16_t muted, uint16_t accent);
static const lv_img_dsc_t *dynamicPersonaFrameForSlug(const String &slug, const String &state);
static const lv_img_dsc_t *dynamicPersonaFrameForSlugAnyState(const String &slug);
static bool loadDynamicPersonaStateFrames(const String &state);
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
  uint32_t drawBufferPixels = prepareLvDrawBufferPixels();
  lv_disp_draw_buf_init(&lvDrawBuffer, lvBufferA, lvBufferB, drawBufferPixels);
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
#elif defined(CODE_PET_DISPLAY_ARDUINO_GFX)
#if defined(CODE_PET_USE_SENSECAP_INDICATOR)
static Arduino_DataBus *gfxBus = new Indicator_SWSPI(
  GFX_NOT_DEFINED,
  EXPANDER_IO_LCD_CS,
  SPI_SCLK,
  SPI_MOSI,
  GFX_NOT_DEFINED
);
static Arduino_ESP32RGBPanel *gfxRgbPanel = new Arduino_ESP32RGBPanel(
  18, 17, 16, 21,
  4, 3, 2, 1, 0,
  10, 9, 8, 7, 6, 5,
  15, 14, 13, 12, 11,
  1, 10, 8, 50,
  1, 10, 8, 20
);
Arduino_GFX *gfx = new Arduino_RGB_Display(
  CP_TFT_WIDTH,
  CP_TFT_HEIGHT,
  gfxRgbPanel,
  CP_TFT_ROTATION,
  CODE_PET_ARDUINO_GFX_AUTO_FLUSH != 0,
  gfxBus,
  GFX_NOT_DEFINED,
  st7701_indicator_init_operations,
  sizeof(st7701_indicator_init_operations)
);
#endif

#ifndef CODE_PET_ARDUINO_GFX_SPEED
#define CODE_PET_ARDUINO_GFX_SPEED 12000000L
#endif

static int16_t screenW() { return gfx->width(); }
static int16_t screenH() { return gfx->height(); }
static void displayBegin() {
#if defined(CODE_PET_USE_SENSECAP_INDICATOR)
  extender_init();
#endif
  gfx->begin(CODE_PET_ARDUINO_GFX_SPEED);
  gfx->setRotation(CP_TFT_ROTATION);
#if defined(CODE_PET_USE_COLOR_LVGL)
  lv_init();
  uint32_t drawBufferPixels = prepareLvDrawBufferPixels();
  lv_disp_draw_buf_init(&lvDrawBuffer, lvBufferA, lvBufferB, drawBufferPixels);
  lv_disp_drv_init(&lvDisplayDriver);
  lvDisplayDriver.hor_res = screenW();
  lvDisplayDriver.ver_res = screenH();
  lvDisplayDriver.flush_cb = lvFlush;
  lvDisplayDriver.draw_buf = &lvDrawBuffer;
  lv_disp_drv_register(&lvDisplayDriver);
  lvLastTickAt = millis();
#endif
#if defined(GFX_BL) && GFX_BL >= 0
  pinMode(GFX_BL, OUTPUT);
  digitalWrite(GFX_BL, HIGH);
#elif defined(TFT_BL) && TFT_BL >= 0
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, TFT_BACKLIGHT_ON);
#endif
}
static void fillScreen(uint16_t c) { gfx->fillScreen(c); }
static void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { gfx->fillRect(x, y, w, h, c); }
static void drawRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { gfx->drawRect(x, y, w, h, c); }
static void fillRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { gfx->fillRoundRect(x, y, w, h, r, c); }
static void drawRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { gfx->drawRoundRect(x, y, w, h, r, c); }
static void fillCircle(int16_t x, int16_t y, int16_t r, uint16_t c) { gfx->fillCircle(x, y, r, c); }
static void drawLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t c) { gfx->drawLine(x0, y0, x1, y1, c); }
static void drawText(const String &text, int16_t x, int16_t y, uint8_t size, uint16_t color, uint16_t bg) {
  gfx->setTextSize(size);
  gfx->setTextColor(color, bg);
  gfx->setCursor(x, y);
  gfx->print(text);
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
#elif defined(CODE_PET_DISPLAY_ARDUINO_GFX)
#if !CODE_PET_ARDUINO_GFX_AUTO_FLUSH
  gfx->flush();
#endif
#endif
}

static void updateStatusPixel() {
#if defined(CODE_PET_STATUS_PIXEL)
  uint8_t r, g, b;
  stateRgb(pet.state, r, g, b);
  uint8_t brightness = CP_STATUS_PIXEL_BRIGHTNESS;
  if (!displayConnected()) {
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

#if defined(CODE_PET_USE_COLOR_LVGL)
static String dynamicPersonaVisualState(const String &state) {
  String clean = normalizePacketState(state);
  if (clean == "sleeping") return "idle";
  if (clean == "typing" || clean == "building" || clean == "juggling") return "working";
  if (clean == "sweeping") return "thinking";
  return clean;
}

static bool dynamicPersonaLoadingFor(const String &slug, const String &visualState) {
  if (!displayConnected() || !dynamicPersonaReceiving || !dynamicPersonaTransferSlug.length()) return false;
  if (dynamicPersonaAtlasReceiving) return true;
  return dynamicPersonaTransferSlug == slug && dynamicPersonaTransferState == visualState;
}

static bool dynamicPersonaLoadingCurrent() {
  if (!dynamicPersonaReceiving || !displayConnected()) return false;
  const String fallbackSlug = String(CODE_PET_LVGL_FALLBACK_PERSONA_SLUG);
  String slug = displayConnected() && pet.personaSlug.length() ? pet.personaSlug : fallbackSlug;
  String visualState = dynamicPersonaVisualState(normalizePacketState(pet.state));
  return dynamicPersonaLoadingFor(slug, visualState);
}

static int8_t dynamicPersonaStateIndex(const String &state) {
  String visual = dynamicPersonaVisualState(state);
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) {
    if (visual == DYNAMIC_PERSONA_STATE_NAMES[i]) return static_cast<int8_t>(i);
  }
  return -1;
}
#endif

static int petBob() {
  if (pet.state == "sleeping") return 1;
  if (pet.state == "working" || pet.state == "typing" || pet.state == "building") {
    return (frameIndex % 4 == 1 || frameIndex % 4 == 2) ? -1 : 0;
  }
  if (pet.state == "thinking") {
    switch (frameIndex % 4) {
      case 0: return -4;
      case 1: return -1;
      case 2: return 3;
      default: return -1;
    }
  }
  if (pet.state == "juggling") return (frameIndex % 4) - 2;
  return (frameIndex % 2) ? -1 : 0;
}

#if defined(CODE_PET_USE_COLOR_LVGL)
static int petImageShiftX() {
  if (pet.state == "working" || pet.state == "typing" || pet.state == "building") {
    switch (frameIndex % 4) {
      case 1: return 2;
      case 3: return -2;
      default: return 0;
    }
  }
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
  const uint32_t baseZoom = CODE_PET_LVGL_IMAGE_BASE_ZOOM;
  if (pet.state == "attention" || pet.state == "notification" || pet.state == "error") {
    return static_cast<uint16_t>((baseZoom * ((frameIndex % 2) ? 266U : 256U)) / 256U);
  }
  return static_cast<uint16_t>(baseZoom);
}

static uint16_t dynamicPersonaImageVersionFor(const lv_img_dsc_t *frame) {
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES; i++) {
    if (frame == &dynamicPersonaImages[i]) return dynamicPersonaImageVersions[i];
  }
  return 0;
}

#if CODE_PET_LVGL_PRESCALE_IMAGE && defined(ESP32)
static bool ensureLvPrescaleBuffers() {
  if (lvPrescaleReady) return true;
  if (CODE_PET_LVGL_IMAGE_BASE_ZOOM == 256) return false;
  for (uint8_t i = 0; i < 2; i++) {
    if (!lvPrescaledPixels[i]) {
      lvPrescaledPixels[i] = static_cast<uint8_t *>(heap_caps_malloc(CODE_PET_LVGL_PRESCALED_BYTES,
                                                                     MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
      if (!lvPrescaledPixels[i]) return false;
      lvPrescaledImages[i].data = lvPrescaledPixels[i];
    }
  }
  lvPrescaleReady = true;
  return true;
}

static uint16_t blendRgb565(uint16_t c00, uint16_t c10, uint16_t c01, uint16_t c11, uint16_t wx, uint16_t wy) {
  const uint16_t ix = 256U - wx;
  const uint16_t iy = 256U - wy;
  const uint32_t w00 = static_cast<uint32_t>(ix) * iy;
  const uint32_t w10 = static_cast<uint32_t>(wx) * iy;
  const uint32_t w01 = static_cast<uint32_t>(ix) * wy;
  const uint32_t w11 = static_cast<uint32_t>(wx) * wy;
  const uint32_t r = ((((c00 >> 11) & 0x1F) * w00) +
                      (((c10 >> 11) & 0x1F) * w10) +
                      (((c01 >> 11) & 0x1F) * w01) +
                      (((c11 >> 11) & 0x1F) * w11) + 32768U) >> 16;
  const uint32_t g = ((((c00 >> 5) & 0x3F) * w00) +
                      (((c10 >> 5) & 0x3F) * w10) +
                      (((c01 >> 5) & 0x3F) * w01) +
                      (((c11 >> 5) & 0x3F) * w11) + 32768U) >> 16;
  const uint32_t b = (((c00 & 0x1F) * w00) +
                      ((c10 & 0x1F) * w10) +
                      ((c01 & 0x1F) * w01) +
                      ((c11 & 0x1F) * w11) + 32768U) >> 16;
  return static_cast<uint16_t>((r << 11) | (g << 5) | b);
}

static bool prepareLvPrescaledImage(uint8_t slot, const lv_img_dsc_t *frame) {
  if (slot >= 2 || !frame || !frame->data || !ensureLvPrescaleBuffers()) return false;
  if (frame->header.w != CODE_PET_DYNAMIC_PERSONA_WIDTH ||
      frame->header.h != CODE_PET_DYNAMIC_PERSONA_HEIGHT) {
    return false;
  }
  // Built-in LVGL persona assets carry an alpha byte per pixel; only raw RGB565
  // dynamic frames can be sampled directly into the prescale buffer.
  if (frame->header.cf != LV_IMG_CF_TRUE_COLOR ||
      frame->data_size < CODE_PET_DYNAMIC_PERSONA_BYTES) {
    return false;
  }

  const uint16_t *src = reinterpret_cast<const uint16_t *>(frame->data);
  uint16_t *dst = reinterpret_cast<uint16_t *>(lvPrescaledPixels[slot]);
  for (uint16_t y = 0; y < CODE_PET_LVGL_PRESCALED_HEIGHT; y++) {
    const uint32_t syFixed = CODE_PET_LVGL_PRESCALED_HEIGHT > 1
      ? (static_cast<uint32_t>(y) * (CODE_PET_DYNAMIC_PERSONA_HEIGHT - 1) * 256U) / (CODE_PET_LVGL_PRESCALED_HEIGHT - 1)
      : 0;
    const uint16_t sy = syFixed >> 8;
    const uint16_t sy1 = sy + 1 < CODE_PET_DYNAMIC_PERSONA_HEIGHT ? sy + 1 : sy;
    const uint16_t wy = syFixed & 0xFF;
    const uint16_t *srcRow0 = src + static_cast<uint32_t>(sy) * CODE_PET_DYNAMIC_PERSONA_WIDTH;
    const uint16_t *srcRow1 = src + static_cast<uint32_t>(sy1) * CODE_PET_DYNAMIC_PERSONA_WIDTH;
    uint16_t *dstRow = dst + static_cast<uint32_t>(y) * CODE_PET_LVGL_PRESCALED_WIDTH;
    for (uint16_t x = 0; x < CODE_PET_LVGL_PRESCALED_WIDTH; x++) {
      const uint32_t sxFixed = CODE_PET_LVGL_PRESCALED_WIDTH > 1
        ? (static_cast<uint32_t>(x) * (CODE_PET_DYNAMIC_PERSONA_WIDTH - 1) * 256U) / (CODE_PET_LVGL_PRESCALED_WIDTH - 1)
        : 0;
      const uint16_t sx = sxFixed >> 8;
      const uint16_t sx1 = sx + 1 < CODE_PET_DYNAMIC_PERSONA_WIDTH ? sx + 1 : sx;
      const uint16_t wx = sxFixed & 0xFF;
      dstRow[x] = blendRgb565(srcRow0[sx], srcRow0[sx1], srcRow1[sx], srcRow1[sx1], wx, wy);
    }
  }
  lv_img_cache_invalidate_src(&lvPrescaledImages[slot]);
  return true;
}
#endif

static void hideLvPersonaImages() {
  for (uint8_t i = 0; i < 2; i++) {
    setLvHidden(lvImages[i], true);
  }
}

static void setLvPersonaImagePose(lv_obj_t *image, bool connected, bool frameUsesCurrentPersona, bool prescaled) {
  if (!image) return;
  const uint16_t imageWidth = prescaled ? CODE_PET_LVGL_PRESCALED_WIDTH : CODE_PET_DYNAMIC_PERSONA_WIDTH;
  const uint16_t imageHeight = prescaled ? CODE_PET_LVGL_PRESCALED_HEIGHT : CODE_PET_DYNAMIC_PERSONA_HEIGHT;
  lv_img_set_pivot(image, imageWidth / 2, imageHeight / 2);
  lv_img_set_angle(image, prescaled ? 0 : (connected && frameUsesCurrentPersona ? petImageAngle() : 0));
  lv_img_set_zoom(image, prescaled ? 256 : (connected ? petImageZoom() : CODE_PET_LVGL_IMAGE_BASE_ZOOM));
  lv_obj_align(image, LV_ALIGN_CENTER,
               connected && frameUsesCurrentPersona ? petImageShiftX() : 0,
               connected ? petBob() : ((frameIndex % 2) ? -1 : 0));
}

static void showLvPersonaImage(const lv_img_dsc_t *frame, bool connected, bool frameUsesCurrentPersona) {
  if (!frame || !lvImages[0] || !lvImages[1]) return;

  const uint16_t version = dynamicPersonaImageVersionFor(frame);
  const uint8_t frontSlot = lvImageFrontSlot;
  lv_obj_t *frontImage = lvImages[frontSlot];
  const bool frontVisible = frontImage && !lv_obj_has_flag(frontImage, LV_OBJ_FLAG_HIDDEN);
  const bool sameFrame = frontVisible &&
                         lvImageSources[frontSlot] == frame &&
                         lvImageSourceVersions[frontSlot] == version;
  const uint8_t targetSlot = sameFrame ? frontSlot : static_cast<uint8_t>(frontSlot ^ 1U);
  lv_obj_t *targetImage = lvImages[targetSlot];

  if (!sameFrame) {
    const bool targetAlreadyHasFrame = lvImageSources[targetSlot] == frame &&
                                       lvImageSourceVersions[targetSlot] == version;
    const bool targetWasPrescaled = lvImageSourcePrescaled[targetSlot];
    const lv_img_dsc_t *displayFrame = frame;
    bool prescaled = false;
#if CODE_PET_LVGL_PRESCALE_IMAGE && defined(ESP32)
    if (targetAlreadyHasFrame && lvImageSourcePrescaled[targetSlot]) {
      displayFrame = &lvPrescaledImages[targetSlot];
      prescaled = true;
    } else if (prepareLvPrescaledImage(targetSlot, frame)) {
      displayFrame = &lvPrescaledImages[targetSlot];
      prescaled = true;
    }
#endif
    if (!targetAlreadyHasFrame || targetWasPrescaled != prescaled) lv_img_set_src(targetImage, displayFrame);
    lvImageSources[targetSlot] = frame;
    lvImageSourceVersions[targetSlot] = version;
    lvImageSourcePrescaled[targetSlot] = prescaled;
  }
  setLvPersonaImagePose(targetImage, connected, frameUsesCurrentPersona, lvImageSourcePrescaled[targetSlot]);
  setLvHidden(targetImage, false);

  if (!sameFrame) {
    setLvHidden(frontImage, true);
    lvImageFrontSlot = targetSlot;
  }
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

#if defined(CODE_PET_USE_COLOR_LVGL)
static void ensureLvglUi() {
  if (lvRoot) return;
  const int16_t sw = screenW();
  const int16_t statusWidth = sw >= 280 ? 100 : 76;
  const int16_t headerWidth = sw > statusWidth + 24 ? sw - statusWidth - 24 : sw / 2;
  const int16_t footerWidth = sw > 16 ? sw - 16 : sw;
  const int16_t fallbackWidth = sw >= 200 ? 170 : sw - 24;
  const int16_t fallbackContentWidth = fallbackWidth > 24 ? fallbackWidth - 24 : fallbackWidth;
  const int16_t loadPanelWidth = sw;
  const int16_t loadPanelHeight = screenH();
  const int16_t loadTrackWidth = sw > 64 ? sw - 64 : sw - 24;
  const int16_t loadTrackHeight = sw >= 240 ? 10 : 8;
  const int16_t loadTitleWidth = sw > 32 ? sw - 32 : sw;

  lv_obj_set_style_bg_color(lv_scr_act(), lv_color_black(), 0);
  lv_obj_set_style_bg_opa(lv_scr_act(), LV_OPA_COVER, 0);

  lvRoot = lv_obj_create(lv_scr_act());
  lv_obj_remove_style_all(lvRoot);
  lv_obj_set_size(lvRoot, sw, screenH());
  lv_obj_set_style_bg_opa(lvRoot, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(lvRoot, 0, 0);
  lv_obj_set_style_pad_all(lvRoot, 0, 0);

  for (uint8_t i = 0; i < 2; i++) {
    lvImages[i] = lv_img_create(lvRoot);
    lv_obj_align(lvImages[i], LV_ALIGN_CENTER, 0, 0);
    lv_obj_add_flag(lvImages[i], LV_OBJ_FLAG_HIDDEN);
  }

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
  setPremiumLabelText(lvHeader, lvHeaderShadow, "");

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
  setPremiumLabelText(lvStatus, lvStatusShadow, "");

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
  setPremiumLabelText(lvFooter, lvFooterShadow, "");

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
  lv_label_set_text(lvFallbackPersona, "");

  lvFallbackState = lv_label_create(lvFallback);
  lv_obj_set_width(lvFallbackState, fallbackContentWidth);
  lv_label_set_long_mode(lvFallbackState, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvFallbackState, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_font(lvFallbackState, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvFallbackState, LV_ALIGN_CENTER, 0, 0);
  lv_label_set_text(lvFallbackState, "");

  lvFallbackAgent = lv_label_create(lvFallback);
  lv_obj_set_width(lvFallbackAgent, fallbackContentWidth);
  lv_label_set_long_mode(lvFallbackAgent, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvFallbackAgent, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_font(lvFallbackAgent, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvFallbackAgent, LV_ALIGN_BOTTOM_MID, 0, -12);
  lv_label_set_text(lvFallbackAgent, "");

  lvLoadPanel = lv_obj_create(lvRoot);
  lv_obj_set_size(lvLoadPanel, loadPanelWidth, loadPanelHeight);
  lv_obj_align(lvLoadPanel, LV_ALIGN_CENTER, 0, 0);
  lv_obj_set_style_radius(lvLoadPanel, 0, 0);
  lv_obj_set_style_border_width(lvLoadPanel, 0, 0);
  lv_obj_set_style_pad_all(lvLoadPanel, 0, 0);
  lv_obj_set_style_shadow_width(lvLoadPanel, 0, 0);
  lv_obj_set_style_bg_opa(lvLoadPanel, LV_OPA_TRANSP, 0);
  lv_obj_clear_flag(lvLoadPanel, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(lvLoadPanel, LV_OBJ_FLAG_HIDDEN);

  lvLoadTitleShadow = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadTitleShadow, loadTitleWidth);
  lv_label_set_long_mode(lvLoadTitleShadow, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_font(lvLoadTitleShadow, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvLoadTitleShadow, LV_ALIGN_CENTER, 1, -48);
  lv_obj_add_flag(lvLoadTitleShadow, LV_OBJ_FLAG_HIDDEN);

  lvLoadTitle = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadTitle, loadTitleWidth);
  lv_label_set_long_mode(lvLoadTitle, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_font(lvLoadTitle, LV_FONT_DEFAULT, 0);
  lv_obj_align(lvLoadTitle, LV_ALIGN_CENTER, 0, -49);
  lv_obj_add_flag(lvLoadTitle, LV_OBJ_FLAG_HIDDEN);
  setPremiumLabelText(lvLoadTitle, lvLoadTitleShadow, "");

  lvLoadPercentShadow = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadPercentShadow, sw);
  lv_label_set_long_mode(lvLoadPercentShadow, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvLoadPercentShadow, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_font(lvLoadPercentShadow, CODE_PET_LVGL_PROGRESS_FONT, 0);
  lv_obj_align(lvLoadPercentShadow, LV_ALIGN_CENTER, 0, -6);
  lv_obj_add_flag(lvLoadPercentShadow, LV_OBJ_FLAG_HIDDEN);

  lvLoadPercent = lv_label_create(lvLoadPanel);
  lv_obj_set_width(lvLoadPercent, sw);
  lv_label_set_long_mode(lvLoadPercent, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(lvLoadPercent, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_font(lvLoadPercent, CODE_PET_LVGL_PROGRESS_FONT, 0);
  lv_obj_set_style_text_opa(lvLoadPercent, LV_OPA_90, 0);
  lv_obj_align(lvLoadPercent, LV_ALIGN_CENTER, 0, -8);
  setPremiumLabelText(lvLoadPercent, lvLoadPercentShadow, "");

  lvLoadTrack = lv_bar_create(lvLoadPanel);
  lv_obj_set_size(lvLoadTrack, loadTrackWidth, loadTrackHeight);
  lv_obj_align(lvLoadTrack, LV_ALIGN_BOTTOM_MID, 0, -32);
  lv_bar_set_range(lvLoadTrack, 0, 100);
  lv_bar_set_value(lvLoadTrack, 0, LV_ANIM_OFF);
  lv_obj_set_style_radius(lvLoadTrack, loadTrackHeight / 2, LV_PART_MAIN);
  lv_obj_set_style_radius(lvLoadTrack, loadTrackHeight / 2, LV_PART_INDICATOR);
  lv_obj_set_style_border_width(lvLoadTrack, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(lvLoadTrack, 0, LV_PART_INDICATOR);
  lv_obj_set_style_pad_all(lvLoadTrack, 0, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(lvLoadTrack, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(lvLoadTrack, LV_OPA_COVER, LV_PART_INDICATOR);
  lv_obj_clear_flag(lvLoadTrack, LV_OBJ_FLAG_SCROLLABLE);
  lvLoadFill = nullptr;
}

static uint8_t dynamicPersonaProgressPercent() {
  if (!dynamicPersonaReceiving && dynamicPersonaReady) return 100;
  uint8_t completeFrames = 0;
  if (!dynamicPersonaAtlasReceiving) {
    for (uint8_t i = 0; i < dynamicPersonaTransferFrameCount && i < 8; i++) {
      if (dynamicPersonaReceivedFrameMask & (1U << i)) completeFrames++;
    }
  }
  uint32_t total = dynamicPersonaTransferExpectedBytes;
  if (!total) total = static_cast<uint32_t>(dynamicPersonaTransferFrameCount) * CODE_PET_DYNAMIC_PERSONA_BYTES;
  uint32_t received = dynamicPersonaReceived;
  if (!dynamicPersonaAtlasReceiving) {
    if (received > CODE_PET_DYNAMIC_PERSONA_BYTES) received = CODE_PET_DYNAMIC_PERSONA_BYTES;
    received += static_cast<uint32_t>(completeFrames) * CODE_PET_DYNAMIC_PERSONA_BYTES;
  }
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
  setLvHidden(lvFooterClip, true);
}

static void updateFooterTicker(const String &text, bool connected) {
  if (!lvFooter || !lvFooterClip) return;

  if (!connected) {
    if (lvFooterDisconnectedMode && lvFooterTickerText == CODE_PET_DISCONNECTED_LABEL) return;
    lv_anim_del(lvFooter, setFooterTickerX);
    lvFooterDisconnectedMode = true;
    lvFooterTickerText = CODE_PET_DISCONNECTED_LABEL;
    lvFooterTickerDone = false;
    setLvHidden(lvFooterClip, false);
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
    if (!lvFooterDisconnectedMode && !lvFooterTickerText.length() && lvFooterTickerDone) {
      setLvHidden(lvFooterClip, true);
      return;
    }
    lv_anim_del(lvFooter, setFooterTickerX);
    lvFooterDisconnectedMode = false;
    lvFooterTickerText = "";
    lvFooterTickerDone = true;
    setLvHidden(lvFooterClip, true);
    return;
  }

  lvFooterDisconnectedMode = false;
  if (text == lvFooterTickerText) {
    if (lvFooterTickerDone) setLvHidden(lvFooterClip, true);
    return;
  }

  lv_anim_del(lvFooter, setFooterTickerX);
  lvFooterTickerText = text;
  lvFooterTickerDone = false;
  setLvHidden(lvFooterClip, false);
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
  const bool connected = displayConnected();
  const String fallbackSlug = String(CODE_PET_LVGL_FALLBACK_PERSONA_SLUG);
  String renderSlug = connected && pet.personaSlug.length() ? pet.personaSlug : fallbackSlug;
  String renderState = normalizePacketState(connected ? pet.state : String("idle"));
  String renderVisualState = dynamicPersonaVisualState(renderState);
  const bool imageLoading = dynamicPersonaLoadingFor(renderSlug, renderVisualState);
  const uint8_t imageProgress = imageLoading ? dynamicPersonaProgressPercent() : 0;
  const lv_img_dsc_t *frame = nullptr;
  bool frameUsesCurrentPersona = false;
  if (!imageLoading) {
    frame = connected ? dynamicPersonaFrameForSlug(renderSlug, renderState) : nullptr;
    frameUsesCurrentPersona = frame != nullptr;
    if (!frame) {
      frame = codePetPersonaFrame(renderSlug, renderState, frameIndex);
      frameUsesCurrentPersona = frame != nullptr;
    }
    if (!frame && connected) {
      frame = codePetPersonaFrame(fallbackSlug, renderState, frameIndex);
      frameUsesCurrentPersona = false;
    }
    if (!frame) {
      frame = codePetPersonaFrame(fallbackSlug, renderState, frameIndex);
      frameUsesCurrentPersona = false;
    }
  }
  const bool showFallbackPanel = !imageLoading && frame == nullptr;
  if (showFallbackPanel && !connected && !pet.personaSlug.length()) {
#if defined(CODE_PET_DISPLAY_ARDUINO_GFX) && CODE_PET_ARDUINO_GFX_PARTIAL_FLUSH
    lvForceFullFlush = false;
#endif
    return false;
  }

  const bool night = isNightTheme();
  const uint16_t labelInk = night ? rgb565(255, 255, 255) : rgb565(30, 40, 54);
  const uint16_t labelMuted = night ? rgb565(232, 238, 248) : rgb565(38, 49, 66);
  const uint16_t loadPanelBg = night ? rgb565(8, 10, 14) : panel;
  const uint16_t loadTrackBg = night ? rgb565(36, 42, 54) : rgb565(224, 230, 238);
  updateLvPersonaStyles(bg, panel, ink, muted, accent, labelInk, labelMuted, loadPanelBg, loadTrackBg);
#if defined(CODE_PET_DISPLAY_ARDUINO_GFX) && CODE_PET_ARDUINO_GFX_PARTIAL_FLUSH
  lvForceFullFlush = imageLoading;
#endif

  if (imageLoading) {
    setPremiumLabelHidden(lvHeader, lvHeaderShadow, true);
    setPremiumLabelHidden(lvStatus, lvStatusShadow, true);
    updateFooterTicker(String(""), connected);
    hideLvPersonaImages();
    setLvHidden(lvFallback, true);
    setPremiumLabelHidden(lvLoadTitle, lvLoadTitleShadow, true);
    setLvHidden(lvLoadPercentShadow, true);

    String progressText = String(imageProgress) + "%";
    setPremiumLabelTextIfChanged(lvLoadPercent, lvLoadPercentShadow, lvLoadPercentTextCache, progressText);
    lv_bar_set_value(lvLoadTrack, imageProgress, LV_ANIM_OFF);
    setLvHidden(lvLoadPanel, false);
    return true;
  }

  setPremiumLabelHidden(lvHeader, lvHeaderShadow, false);
  setPremiumLabelHidden(lvStatus, lvStatusShadow, false);
  setLvHidden(lvLoadPanel, true);

  String headerText = connected ? cleanText(pet.agent, 22) : "";
  setPremiumLabelTextIfChanged(lvHeader, lvHeaderShadow, lvHeaderTextCache, headerText);
  String statusText = connected ? cleanText(imageLoading ? String("Syncing") : displayStateLabel(), 20) : "";
  setPremiumLabelTextIfChanged(lvStatus, lvStatusShadow, lvStatusTextCache, statusText);
  String footer = connected ? cleanText(pet.output, CODE_PET_OUTPUT_MAX_CHARS) : String(CODE_PET_DISCONNECTED_LABEL);
  updateFooterTicker(footer, connected);

  String fallbackPersona = connected ? cleanText(pet.personaName, 18) : String(CODE_PET_DISCONNECTED_LABEL);
  setLabelTextIfChanged(lvFallbackPersona, lvFallbackPersonaTextCache, fallbackPersona);
  String fallbackState = connected ? cleanText(displayStateLabel(), 20) : "";
  setLabelTextIfChanged(lvFallbackState, lvFallbackStateTextCache, fallbackState);
  String fallbackAgent = connected ? cleanText(pet.agent, 18) : "";
  setLabelTextIfChanged(lvFallbackAgent, lvFallbackAgentTextCache, fallbackAgent);

  if (showFallbackPanel) {
    hideLvPersonaImages();
    setLvHidden(lvFallback, false);
  } else {
    showLvPersonaImage(frame, connected, frameUsesCurrentPersona);
    setLvHidden(lvFallback, true);
  }
  return true;
}
#endif

#if defined(CODE_PET_USE_SIMPLE_DYNAMIC_PERSONA) && defined(CODE_PET_DISPLAY_TFT_ESPI)
enum SimpleDynamicPersonaFormat : uint8_t {
  SIMPLE_DYNAMIC_PERSONA_RAW_RGB565,
  SIMPLE_DYNAMIC_PERSONA_RLE_RGB565,
};

static uint8_t simpleDynamicPersonaPixels[CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES][CODE_PET_DYNAMIC_PERSONA_BYTES];
static String simpleDynamicPersonaId = "";
static String simpleDynamicPersonaSlug = "";
static String simpleDynamicPersonaState = "idle";
static String simpleDynamicPersonaTransferSlug = "";
static String simpleDynamicPersonaTransferState = "idle";
static bool simpleDynamicPersonaReady = false;
static bool simpleDynamicPersonaReceiving = false;
static bool simpleDynamicPersonaShowLoading = true;
static SimpleDynamicPersonaFormat simpleDynamicPersonaFormat = SIMPLE_DYNAMIC_PERSONA_RAW_RGB565;
static uint16_t simpleDynamicPersonaExpectedSeq = 0;
static uint32_t simpleDynamicPersonaReceived = 0;
static uint8_t simpleDynamicPersonaFrameCount = 1;
static uint8_t simpleDynamicPersonaTransferFrameCount = 1;
static uint8_t simpleDynamicPersonaTransferFrameIndex = 0;
static uint8_t simpleDynamicPersonaReceivedFrameMask = 0;
static uint8_t simpleDynamicPersonaLastProgressPercent = 0;
static uint8_t simpleDynamicPersonaRleTriple[3] = {0, 0, 0};
static uint8_t simpleDynamicPersonaRleIndex = 0;
static const char *SIMPLE_DYNAMIC_PERSONA_STATE_NAMES[CODE_PET_DYNAMIC_PERSONA_STATE_COUNT] = {
  "idle", "notification", "working", "error", "thinking", "attention"
};

static String simpleDynamicPersonaVisualState(const String &state) {
  String clean = normalizePacketState(state);
  if (clean == "sleeping") return "idle";
  if (clean == "typing" || clean == "building" || clean == "juggling") return "working";
  if (clean == "sweeping") return "thinking";
  return clean;
}

static int8_t simpleDynamicPersonaStateIndex(const String &state) {
  String visual = simpleDynamicPersonaVisualState(state);
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) {
    if (visual == SIMPLE_DYNAMIC_PERSONA_STATE_NAMES[i]) return static_cast<int8_t>(i);
  }
  return -1;
}

static uint8_t simpleDynamicPersonaProgressPercent() {
  uint8_t completeFrames = 0;
  for (uint8_t i = 0; i < simpleDynamicPersonaTransferFrameCount; i++) {
    if (simpleDynamicPersonaReceivedFrameMask & (1U << i)) completeFrames++;
  }
  uint32_t total = static_cast<uint32_t>(simpleDynamicPersonaTransferFrameCount) * CODE_PET_DYNAMIC_PERSONA_BYTES;
  uint32_t received = simpleDynamicPersonaReceived;
  if (received > CODE_PET_DYNAMIC_PERSONA_BYTES) received = CODE_PET_DYNAMIC_PERSONA_BYTES;
  received += static_cast<uint32_t>(completeFrames) * CODE_PET_DYNAMIC_PERSONA_BYTES;
  if (total == 0) return 0;
  if (received > total) received = total;
  return static_cast<uint8_t>((received * 100U) / total);
}

static bool simpleDynamicPersonaMatchesCurrent() {
  return displayConnected() &&
         simpleDynamicPersonaReady &&
         simpleDynamicPersonaSlug.length() &&
         simpleDynamicPersonaSlug == pet.personaSlug &&
         simpleDynamicPersonaState == simpleDynamicPersonaVisualState(pet.state);
}

static bool simpleDynamicPersonaLoadingCurrent() {
  return displayConnected() &&
         simpleDynamicPersonaReceiving &&
         simpleDynamicPersonaShowLoading &&
         simpleDynamicPersonaTransferSlug == pet.personaSlug &&
         simpleDynamicPersonaTransferState == simpleDynamicPersonaVisualState(pet.state);
}

static bool simpleDynamicPersonaScreen() {
  return simpleDynamicPersonaLoadingCurrent() || simpleDynamicPersonaMatchesCurrent();
}

static void simpleAbortDynamicPersonaTransfer() {
  simpleDynamicPersonaReceiving = false;
  simpleDynamicPersonaShowLoading = true;
  simpleDynamicPersonaId = "";
  simpleDynamicPersonaTransferSlug = "";
  simpleDynamicPersonaTransferState = "idle";
  simpleDynamicPersonaExpectedSeq = 0;
  simpleDynamicPersonaReceived = 0;
  simpleDynamicPersonaTransferFrameCount = 1;
  simpleDynamicPersonaTransferFrameIndex = 0;
  simpleDynamicPersonaReceivedFrameMask = 0;
  simpleDynamicPersonaLastProgressPercent = 0;
  simpleDynamicPersonaRleIndex = 0;
  markDirty();
}

static void simpleClearDynamicPersonaFrame() {
  simpleDynamicPersonaReady = false;
  simpleAbortDynamicPersonaTransfer();
  simpleDynamicPersonaSlug = "";
  simpleDynamicPersonaState = "idle";
  simpleDynamicPersonaFrameCount = 1;
}

static int8_t simpleBase64Value(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

static bool simpleAppendDynamicPersonaDecodedByte(uint8_t value) {
  if (simpleDynamicPersonaTransferFrameIndex >= CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) return false;
  uint8_t *pixels = simpleDynamicPersonaPixels[simpleDynamicPersonaTransferFrameIndex];

  if (simpleDynamicPersonaFormat == SIMPLE_DYNAMIC_PERSONA_RLE_RGB565) {
    simpleDynamicPersonaRleTriple[simpleDynamicPersonaRleIndex++] = value;
    if (simpleDynamicPersonaRleIndex < 3) return true;

    uint8_t lo = simpleDynamicPersonaRleTriple[0];
    uint8_t hi = simpleDynamicPersonaRleTriple[1];
    uint8_t count = simpleDynamicPersonaRleTriple[2];
    simpleDynamicPersonaRleIndex = 0;
    if (count == 0) return false;
    for (uint8_t i = 0; i < count; i++) {
      if (simpleDynamicPersonaReceived + 2 > CODE_PET_DYNAMIC_PERSONA_BYTES) return false;
      pixels[simpleDynamicPersonaReceived++] = lo;
      pixels[simpleDynamicPersonaReceived++] = hi;
    }
    return true;
  }

  if (simpleDynamicPersonaReceived >= CODE_PET_DYNAMIC_PERSONA_BYTES) return false;
  pixels[simpleDynamicPersonaReceived++] = value;
  return true;
}

static bool simpleAppendDynamicPersonaBase64(const String &encoded) {
  int value = 0;
  int bits = -8;
  for (size_t i = 0; i < encoded.length(); i++) {
    char c = encoded[i];
    if (c == '=') break;
    if (c == ' ' || c == '\n' || c == '\r' || c == '\t') continue;
    int8_t digit = simpleBase64Value(c);
    if (digit < 0) return false;
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 0) {
      if (!simpleAppendDynamicPersonaDecodedByte(static_cast<uint8_t>((value >> bits) & 0xFF))) return false;
      bits -= 8;
    }
  }
  return true;
}

static void simpleApplyDynamicPersonaPayload(JsonVariantConst src) {
  String op = String(src["im"] | "");

  if (op == "s") {
    String id = cleanText(String(src["id"] | ""), 48);
    String slug = cleanText(String(src["p"] | ""), 48);
    String displayName = cleanText(String(src["d"] | src["displayName"] | ""), 48);
    String kind = cleanText(String(src["k"] | src["kind"] | ""), 24);
    String spriteUrl = String(src["u"] | src["spritesheetUrl"] | "");
    String theme = cleanText(String(src["th"] | src["theme"] | ""), 12);
    theme = (theme == "night" || theme == "dark") ? theme : "day";
    String state = simpleDynamicPersonaVisualState(String(src["st"] | src["state"] | "idle"));
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
        (format != "rgb565" && format != "rgb565-rle") ||
        simpleDynamicPersonaStateIndex(state) < 0) {
      simpleAbortDynamicPersonaTransfer();
      return;
    }

    if (state != simpleDynamicPersonaVisualState(pet.state)) {
      simpleDynamicPersonaReceiving = false;
      return;
    }

    if (frameSlot == 0) {
      simpleDynamicPersonaReady = false;
      simpleDynamicPersonaReceivedFrameMask = 0;
      simpleDynamicPersonaTransferFrameCount = static_cast<uint8_t>(frameCount);
      simpleDynamicPersonaTransferSlug = slug;
      simpleDynamicPersonaTransferState = state;
    } else if (id != simpleDynamicPersonaId ||
               slug != simpleDynamicPersonaTransferSlug ||
               state != simpleDynamicPersonaTransferState ||
               frameCount != simpleDynamicPersonaTransferFrameCount ||
               (simpleDynamicPersonaReceivedFrameMask & (1U << frameSlot))) {
      simpleAbortDynamicPersonaTransfer();
      return;
    }

    simpleDynamicPersonaReceiving = true;
    simpleDynamicPersonaShowLoading = showLoading;
    simpleDynamicPersonaId = id;
    simpleDynamicPersonaTransferFrameIndex = static_cast<uint8_t>(frameSlot);
    simpleDynamicPersonaFormat = format == "rgb565-rle" ? SIMPLE_DYNAMIC_PERSONA_RLE_RGB565 : SIMPLE_DYNAMIC_PERSONA_RAW_RGB565;
    simpleDynamicPersonaExpectedSeq = 0;
    simpleDynamicPersonaReceived = 0;
    simpleDynamicPersonaLastProgressPercent = 0;
    simpleDynamicPersonaRleIndex = 0;
    pet.personaSlug = slug;
    if (displayName.length()) pet.personaName = displayName;
    if (kind.length()) pet.personaKind = kind;
    if (!src["u"].isNull() || !src["spritesheetUrl"].isNull()) pet.spriteUrl = spriteUrl;
    if (theme.length()) pet.theme = theme;
    markDirty();
    return;
  }

  if (op == "x") {
    String id = String(src["id"] | "");
    if (!id.length() || id == simpleDynamicPersonaId) simpleAbortDynamicPersonaTransfer();
    return;
  }

  if (op == "c") {
    String id = String(src["id"] | "");
    int seq = src["q"] | -1;
    if (!simpleDynamicPersonaReceiving || id != simpleDynamicPersonaId || seq != simpleDynamicPersonaExpectedSeq) return;
    String data = String(src["d"] | "");
    if (!data.length() || !simpleAppendDynamicPersonaBase64(data)) {
      simpleAbortDynamicPersonaTransfer();
      return;
    }
    simpleDynamicPersonaExpectedSeq++;
    uint8_t progress = simpleDynamicPersonaProgressPercent();
    if (progress != simpleDynamicPersonaLastProgressPercent) {
      simpleDynamicPersonaLastProgressPercent = progress;
      if (simpleDynamicPersonaShowLoading) markDirty();
    }
    return;
  }

  if (op == "e") {
    String id = String(src["id"] | "");
    if (simpleDynamicPersonaReceiving && id == simpleDynamicPersonaId &&
        simpleDynamicPersonaReceived == CODE_PET_DYNAMIC_PERSONA_BYTES &&
        simpleDynamicPersonaRleIndex == 0) {
      simpleDynamicPersonaReceiving = false;
      simpleDynamicPersonaReady = true;
      simpleDynamicPersonaSlug = simpleDynamicPersonaTransferSlug;
      simpleDynamicPersonaState = simpleDynamicPersonaTransferState;
      simpleDynamicPersonaReceivedFrameMask |= (1U << simpleDynamicPersonaTransferFrameIndex);
      if (simpleDynamicPersonaReceivedFrameMask & 0x01) simpleDynamicPersonaFrameCount = 1;
      uint8_t completeMask = (1U << simpleDynamicPersonaTransferFrameCount) - 1U;
      if ((simpleDynamicPersonaReceivedFrameMask & completeMask) == completeMask) {
        simpleDynamicPersonaFrameCount = simpleDynamicPersonaTransferFrameCount;
        simpleDynamicPersonaTransferSlug = "";
        simpleDynamicPersonaTransferState = simpleDynamicPersonaState;
        simpleDynamicPersonaLastProgressPercent = 100;
      }
      markDirty();
    } else if (simpleDynamicPersonaReceiving) {
      simpleAbortDynamicPersonaTransfer();
    }
  }
}

static void renderSimpleDynamicPersonaContent(uint16_t bg, uint16_t panel, uint16_t ink, uint16_t accent) {
  const int16_t sw = screenW();
  const int16_t sh = screenH();
  int16_t contentH = sh > 56 ? sh - 56 : 0;
  fillRect(0, 32, sw, contentH, bg);

  if (simpleDynamicPersonaLoadingCurrent()) {
    const uint8_t progress = simpleDynamicPersonaProgressPercent();
    int16_t panelW = sw > 32 ? sw - 32 : 96;
    if (panelW < 96) panelW = 96;
    if (panelW > 164) panelW = 164;
    const int16_t panelX = (sw - panelW) / 2;
    int16_t panelY = (sh - 56) / 2;
    if (panelY < 54) panelY = 54;
    const int16_t trackW = panelW - 24;
    fillRoundRect(panelX, panelY, panelW, 56, 10, panel);
    drawRoundRect(panelX, panelY, panelW, 56, 10, accent);
    drawText("Syncing", panelX + 12, panelY + 13, 1, ink, panel);
    drawText(String(progress) + "%", panelX + panelW - 38, panelY + 13, 1, accent, panel);
    fillRoundRect(panelX + 12, panelY + 38, trackW, 8, 4, dimColor(ink, 20));
    int16_t fillWidth = (trackW * progress) / 100;
    if (fillWidth < 1) fillWidth = 1;
    fillRoundRect(panelX + 12, panelY + 38, fillWidth, 8, 4, accent);
    return;
  }

  if (!simpleDynamicPersonaMatchesCurrent()) return;
  uint8_t count = simpleDynamicPersonaFrameCount;
  if (count < 1) count = 1;
  if (count > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) count = CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES;
  uint8_t slot = count > 1 ? (frameIndex % count) : 0;
  int16_t x = (sw - CODE_PET_DYNAMIC_PERSONA_WIDTH) / 2;
  int16_t y = (sh - CODE_PET_DYNAMIC_PERSONA_HEIGHT) / 2;
  if (y < 36) y = 36;
  if (y + CODE_PET_DYNAMIC_PERSONA_HEIGHT > sh - 24) y = sh - 24 - CODE_PET_DYNAMIC_PERSONA_HEIGHT;
  if (y < 32) y = 32;
  tft.pushImage(x, y, CODE_PET_DYNAMIC_PERSONA_WIDTH, CODE_PET_DYNAMIC_PERSONA_HEIGHT, reinterpret_cast<uint16_t *>(simpleDynamicPersonaPixels[slot]));
}
#endif

static void renderScreen() {
  updateStatusPixel();

  const bool oled = screenW() <= 128 && screenH() <= 64;
  const bool connected = displayConnected();
  const bool night = isNightTheme();
  uint16_t bg = oled || night ? 0 : rgb565(238, 244, 247);
  uint16_t header = oled ? 0 : rgb565(24, 32, 42);
  uint16_t panel = oled ? 0 : rgb565(255, 255, 255);
  uint16_t ink = oled ? 1 : rgb565(38, 50, 65);
  uint16_t muted = oled ? 1 : rgb565(83, 93, 110);
  uint16_t face = oled ? 0 : rgb565(215, 245, 255);
  uint16_t body = oled ? 0 : personaColor();
  uint16_t accent = oled ? 1 : stateColor(pet.state);

#if defined(CODE_PET_USE_COLOR_LVGL)
  if (!oled && renderPersonaWithLvgl(bg, header, panel, ink, muted, accent)) {
    lv_timer_handler();
    uiDirty = false;
    return;
  }
#endif

  fillScreen(bg);

  if (oled) {
    drawText(connected ? cleanText(pet.agent, 12) : "", 0, 0, 1, 1, 0);
    drawText(connected ? cleanText(displayStateLabel(), 12) : "", 0, 10, 1, 1, 0);
    drawText(connected ? cleanText(pet.output, 18) : String(CODE_PET_DISCONNECTED_LABEL), 0, screenH() - 10, 1, 1, 0);
    renderPetFace(screenW() - 38, screenH() / 2 + 2, 7, 0, 1, 1, 0);
    displayFlush();
    return;
  }

  int16_t w = screenW();
  int16_t h = screenH();
#if defined(CODE_PET_USE_SIMPLE_DYNAMIC_PERSONA) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  bool simplePersonaScreen = simpleDynamicPersonaScreen();
#else
  bool simplePersonaScreen = false;
#endif
  fillRect(0, 0, w, 32, header);
  drawText("Vibe Pet", 8, 9, 1, rgb565(255, 255, 255), header);
  String connectionText = connected ? (bleConnected ? "BLE" : "TEST") : "WAIT";
  drawText(connectionText, w - 42, 9, 1, connected ? rgb565(113, 210, 159) : rgb565(190, 198, 209), header);

  if (!simplePersonaScreen) {
    fillRoundRect(8, 40, w - 16, 34, 8, panel);
    drawRoundRect(8, 40, w - 16, 34, 8, rgb565(215, 221, 231));
    drawText(connected ? cleanText(displayStateLabel(), 18) : "", 18, 50, 1, accent, panel);
    drawText(connected ? cleanText(pet.agent, 16) : "", w / 2, 50, 1, muted, panel);
    renderPetFace(w / 2, h / 2 + 22, min(w, h) > 200 ? 13 : 10, body, accent, ink, face);
  }
#if defined(CODE_PET_USE_SIMPLE_DYNAMIC_PERSONA) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  else {
    renderSimpleDynamicPersonaContent(bg, panel, ink, accent);
  }
#endif

  fillRect(0, h - 24, w, 24, header);
  String footer = connected ? cleanText(pet.output, 40) : String(CODE_PET_DISCONNECTED_LABEL);
  drawText(footer, 8, h - 17, 1, rgb565(255, 255, 255), header);
  displayFlush();
  uiDirty = false;
}

static void markDirty() {
  uiDirty = true;
}

#if defined(CODE_PET_USE_COLOR_LVGL)
static const lv_img_dsc_t *dynamicPersonaFrameForSlug(const String &slug, const String &state) {
  if (dynamicPersonaReceiving &&
      dynamicPersonaTransferSlug.length() &&
      (dynamicPersonaAtlasReceiving || slug == dynamicPersonaTransferSlug)) {
    return nullptr;
  }
  String visualState = dynamicPersonaVisualState(state);
  if (dynamicPersonaReady && dynamicPersonaSlug.length() && slug == dynamicPersonaSlug &&
      visualState == dynamicPersonaState) {
    return dynamicPersonaFrameForSlugAnyState(slug);
  }
  if (!dynamicPersonaCachedSlug.length() || slug != dynamicPersonaCachedSlug) return nullptr;
  if (!loadDynamicPersonaStateFrames(visualState)) return nullptr;
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
  dynamicPersonaImageVersions[slot]++;
  lv_img_cache_invalidate_src(&dynamicPersonaImages[slot]);
}

static void clearDynamicPersonaFrame() {
  dynamicPersonaReady = false;
  dynamicPersonaReceiving = false;
  dynamicPersonaAtlasReceiving = false;
  dynamicPersonaAtlasReady = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaId = "";
  dynamicPersonaSlug = "";
  dynamicPersonaState = "idle";
  dynamicPersonaCachedSlug = "";
  dynamicPersonaCachedTheme = "day";
  dynamicPersonaCachedStateMask = 0;
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) dynamicPersonaCachedFrameCounts[i] = 0;
  dynamicPersonaTransferSlug = "";
  dynamicPersonaTransferState = "idle";
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaReceived = 0;
  dynamicPersonaTransferExpectedBytes = 0;
  dynamicPersonaFrameCount = 1;
  dynamicPersonaTransferFrameCount = 1;
  dynamicPersonaTransferFrameIndex = 0;
  dynamicPersonaReceivedFrameMask = 0;
  dynamicPersonaLastProgressPercent = 0;
  dynamicPersonaRleIndex = 0;
  dynamicPersonaAtlasWidth = 0;
  dynamicPersonaAtlasHeight = 0;
  dynamicPersonaAtlasCols = 0;
  dynamicPersonaAtlasRows = 0;
  dynamicPersonaAtlasFrameCount = 1;
#if defined(ESP32)
  if (dynamicPersonaAtlasWriteFile) dynamicPersonaAtlasWriteFile.close();
  dynamicPersonaAtlasWriteBufferSize = 0;
#endif
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES; i++) {
    invalidateDynamicPersonaImage(i);
  }
}

#if defined(ESP32)
static bool ensureDynamicPersonaStore() {
  if (dynamicPersonaStoreMounted) return true;
  dynamicPersonaStoreMounted = SPIFFS.begin(true);
  return dynamicPersonaStoreMounted;
}

static String dynamicPersonaFramePath(const String &state, uint8_t frameIndex, bool temporary = false) {
  String visual = dynamicPersonaVisualState(state);
  String path = String("/pet_") + visual + "_" + String(frameIndex);
  path += temporary ? ".tmp" : ".bin";
  return path;
}

static void removeDynamicPersonaFrameFiles() {
  if (!ensureDynamicPersonaStore()) return;
  for (uint8_t stateIndex = 0; stateIndex < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; stateIndex++) {
    String state = String(DYNAMIC_PERSONA_STATE_NAMES[stateIndex]);
    for (uint8_t frameIndex = 0; frameIndex < CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES; frameIndex++) {
      SPIFFS.remove(dynamicPersonaFramePath(state, frameIndex, false).c_str());
      SPIFFS.remove(dynamicPersonaFramePath(state, frameIndex, true).c_str());
    }
  }
}

static void removeDynamicPersonaAtlasFiles() {
  if (!ensureDynamicPersonaStore()) return;
  SPIFFS.remove(DYNAMIC_PERSONA_ATLAS_PATH);
  SPIFFS.remove(DYNAMIC_PERSONA_ATLAS_TMP_PATH);
}

static bool writeDynamicPersonaFile(const String &tmpPath, const String &path, const uint8_t *data, size_t size) {
  if (!ensureDynamicPersonaStore()) return false;
  SPIFFS.remove(tmpPath.c_str());
  fs::File file = SPIFFS.open(tmpPath.c_str(), FILE_WRITE);
  if (!file) return false;
  size_t written = file.write(data, size);
  file.close();
  if (written != size) {
    SPIFFS.remove(tmpPath.c_str());
    return false;
  }
  SPIFFS.remove(path.c_str());
  return SPIFFS.rename(tmpPath.c_str(), path.c_str());
}

static bool readDynamicPersonaFile(const String &path, uint8_t *data, size_t size) {
  if (!ensureDynamicPersonaStore()) return false;
  fs::File file = SPIFFS.open(path.c_str(), FILE_READ);
  if (!file) return false;
  if (file.size() != size) {
    file.close();
    return false;
  }
  size_t read = file.read(data, size);
  file.close();
  return read == size;
}

static bool writeDynamicPersonaMeta() {
  JsonDocument doc;
  doc["v"] = 2;
  doc["mode"] = "frames";
  doc["w"] = CODE_PET_DYNAMIC_PERSONA_WIDTH;
  doc["h"] = CODE_PET_DYNAMIC_PERSONA_HEIGHT;
  doc["z"] = CODE_PET_DYNAMIC_PERSONA_BYTES;
  doc["p"] = dynamicPersonaCachedSlug.length() ? dynamicPersonaCachedSlug : dynamicPersonaSlug;
  doc["d"] = pet.personaName;
  doc["k"] = pet.personaKind;
  doc["u"] = pet.spriteUrl;
  doc["th"] = dynamicPersonaCachedTheme.length() ? dynamicPersonaCachedTheme : pet.theme;
  doc["sm"] = dynamicPersonaCachedStateMask;
  JsonArray frameCounts = doc["fc"].to<JsonArray>();
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) frameCounts.add(dynamicPersonaCachedFrameCounts[i]);

  SPIFFS.remove(DYNAMIC_PERSONA_META_TMP_PATH);
  fs::File meta = SPIFFS.open(DYNAMIC_PERSONA_META_TMP_PATH, FILE_WRITE);
  if (!meta) return false;
  bool ok = serializeJson(doc, meta) > 0;
  meta.close();
  if (!ok) {
    SPIFFS.remove(DYNAMIC_PERSONA_META_TMP_PATH);
    return false;
  }
  SPIFFS.remove(DYNAMIC_PERSONA_META_PATH);
  return SPIFFS.rename(DYNAMIC_PERSONA_META_TMP_PATH, DYNAMIC_PERSONA_META_PATH);
}

static bool writeDynamicPersonaAtlasMeta() {
  if (!dynamicPersonaAtlasReady || !dynamicPersonaCachedSlug.length()) return false;
  JsonDocument doc;
  doc["v"] = 3;
  doc["mode"] = "atlas";
  doc["w"] = CODE_PET_DYNAMIC_PERSONA_WIDTH;
  doc["h"] = CODE_PET_DYNAMIC_PERSONA_HEIGHT;
  doc["aw"] = dynamicPersonaAtlasWidth;
  doc["ah"] = dynamicPersonaAtlasHeight;
  doc["z"] = dynamicPersonaTransferExpectedBytes;
  doc["p"] = dynamicPersonaCachedSlug;
  doc["d"] = pet.personaName;
  doc["k"] = pet.personaKind;
  doc["u"] = pet.spriteUrl;
  doc["th"] = dynamicPersonaCachedTheme.length() ? dynamicPersonaCachedTheme : pet.theme;
  doc["cols"] = dynamicPersonaAtlasCols;
  doc["rows"] = dynamicPersonaAtlasRows;
  doc["fc"] = dynamicPersonaAtlasFrameCount;
  doc["sm"] = dynamicPersonaCachedStateMask;
  JsonArray states = doc["states"].to<JsonArray>();
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) states.add(DYNAMIC_PERSONA_STATE_NAMES[i]);

  SPIFFS.remove(DYNAMIC_PERSONA_META_TMP_PATH);
  fs::File meta = SPIFFS.open(DYNAMIC_PERSONA_META_TMP_PATH, FILE_WRITE);
  if (!meta) return false;
  bool ok = serializeJson(doc, meta) > 0;
  meta.close();
  if (!ok) {
    SPIFFS.remove(DYNAMIC_PERSONA_META_TMP_PATH);
    return false;
  }
  SPIFFS.remove(DYNAMIC_PERSONA_META_PATH);
  return SPIFFS.rename(DYNAMIC_PERSONA_META_TMP_PATH, DYNAMIC_PERSONA_META_PATH);
}

static void resetDynamicPersonaCacheFor(const String &slug, const String &theme) {
  dynamicPersonaCachedSlug = slug;
  dynamicPersonaCachedTheme = (theme == "night" || theme == "dark") ? theme : "day";
  dynamicPersonaCachedStateMask = 0;
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) dynamicPersonaCachedFrameCounts[i] = 0;
  dynamicPersonaReady = false;
  dynamicPersonaSlug = "";
  dynamicPersonaState = "idle";
  dynamicPersonaAtlasReady = false;
  dynamicPersonaAtlasWidth = 0;
  dynamicPersonaAtlasHeight = 0;
  dynamicPersonaAtlasCols = 0;
  dynamicPersonaAtlasRows = 0;
  dynamicPersonaAtlasFrameCount = 1;
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES; i++) {
    invalidateDynamicPersonaImage(i);
  }
  SPIFFS.remove(DYNAMIC_PERSONA_META_PATH);
  removeDynamicPersonaFrameFiles();
  removeDynamicPersonaAtlasFiles();
}

static bool saveDynamicPersonaFrame() {
  if (!dynamicPersonaReady || !dynamicPersonaSlug.length()) return false;
  if (!ensureDynamicPersonaStore()) return false;

  String state = dynamicPersonaVisualState(dynamicPersonaState);
  int8_t stateIndex = dynamicPersonaStateIndex(state);
  if (stateIndex < 0) return false;

  if (dynamicPersonaCachedSlug != dynamicPersonaSlug) {
    resetDynamicPersonaCacheFor(dynamicPersonaSlug, pet.theme);
  }

  uint8_t count = dynamicPersonaFrameCount;
  if (count < 1) count = 1;
  if (count > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) count = CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES;
  for (uint8_t i = 0; i < count; i++) {
    if (!writeDynamicPersonaFile(dynamicPersonaFramePath(state, i, true),
                                 dynamicPersonaFramePath(state, i, false),
                                 dynamicPersonaPixels[i],
                                 CODE_PET_DYNAMIC_PERSONA_BYTES)) {
      return false;
    }
  }

  dynamicPersonaCachedStateMask |= (1U << stateIndex);
  dynamicPersonaCachedFrameCounts[stateIndex] = count;
  dynamicPersonaCachedSlug = dynamicPersonaSlug;
  dynamicPersonaCachedTheme = (pet.theme == "night" || pet.theme == "dark") ? pet.theme : "day";
  dynamicPersonaAtlasReady = false;
  dynamicPersonaAtlasWidth = 0;
  dynamicPersonaAtlasHeight = 0;
  dynamicPersonaAtlasCols = 0;
  dynamicPersonaAtlasRows = 0;
  dynamicPersonaAtlasFrameCount = 1;
  removeDynamicPersonaAtlasFiles();
  return writeDynamicPersonaMeta();
}

static bool loadDynamicPersonaAtlasStateFrames(const String &state) {
  if (!ensureDynamicPersonaStore()) return false;
  if (!dynamicPersonaAtlasReady || !dynamicPersonaCachedSlug.length()) return false;
  if (!dynamicPersonaAtlasWidth || !dynamicPersonaAtlasHeight ||
      !dynamicPersonaAtlasCols || !dynamicPersonaAtlasRows) {
    return false;
  }

  String visual = dynamicPersonaVisualState(state);
  int8_t stateIndex = dynamicPersonaStateIndex(visual);
  if (stateIndex < 0 || stateIndex >= dynamicPersonaAtlasRows) return false;

  fs::File file = SPIFFS.open(DYNAMIC_PERSONA_ATLAS_PATH, FILE_READ);
  if (!file) return false;

  uint8_t count = dynamicPersonaAtlasFrameCount;
  if (count < 1) count = 1;
  if (count > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) count = CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES;
  if (count > dynamicPersonaAtlasCols) count = dynamicPersonaAtlasCols;

  const uint32_t rowByteWidth = static_cast<uint32_t>(dynamicPersonaAtlasWidth) * 2U;
  const uint32_t frameRowBytes = static_cast<uint32_t>(CODE_PET_DYNAMIC_PERSONA_WIDTH) * 2U;
  for (uint8_t slot = 0; slot < count; slot++) {
    uint8_t *dst = dynamicPersonaPixels[slot];
    for (uint16_t y = 0; y < CODE_PET_DYNAMIC_PERSONA_HEIGHT; y++) {
      uint32_t offset = (static_cast<uint32_t>(stateIndex) * CODE_PET_DYNAMIC_PERSONA_HEIGHT + y) * rowByteWidth;
      offset += static_cast<uint32_t>(slot) * frameRowBytes;
      if (!file.seek(offset, fs::SeekSet)) {
        file.close();
        return false;
      }
      size_t read = file.read(dst + static_cast<uint32_t>(y) * frameRowBytes, frameRowBytes);
      if (read != frameRowBytes) {
        file.close();
        return false;
      }
    }
    invalidateDynamicPersonaImage(slot);
  }
  file.close();

  dynamicPersonaReady = true;
  dynamicPersonaSlug = dynamicPersonaCachedSlug;
  dynamicPersonaState = visual;
  dynamicPersonaFrameCount = count;
  dynamicPersonaReceivedFrameMask = (1U << count) - 1U;
  dynamicPersonaReceived = 0;
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaRleIndex = 0;
  dynamicPersonaLastProgressPercent = 100;
  return true;
}

static bool loadDynamicPersonaStateFrames(const String &state) {
  if (!ensureDynamicPersonaStore()) return false;
  if (!dynamicPersonaCachedSlug.length()) return false;
  String visual = dynamicPersonaVisualState(state);
  int8_t stateIndex = dynamicPersonaStateIndex(visual);
  if (stateIndex < 0) return false;
  if (dynamicPersonaAtlasReady) return loadDynamicPersonaAtlasStateFrames(visual);
  if (!(dynamicPersonaCachedStateMask & (1U << stateIndex))) return false;

  uint8_t count = dynamicPersonaCachedFrameCounts[stateIndex];
  if (count < 1) count = 1;
  if (count > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) count = CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES;
  for (uint8_t i = 0; i < count; i++) {
    if (!readDynamicPersonaFile(dynamicPersonaFramePath(visual, i, false),
                                dynamicPersonaPixels[i],
                                CODE_PET_DYNAMIC_PERSONA_BYTES)) {
      return false;
    }
    invalidateDynamicPersonaImage(i);
  }

  dynamicPersonaReady = true;
  dynamicPersonaSlug = dynamicPersonaCachedSlug;
  dynamicPersonaState = visual;
  dynamicPersonaFrameCount = count;
  dynamicPersonaReceivedFrameMask = (1U << count) - 1U;
  dynamicPersonaReceived = 0;
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaRleIndex = 0;
  dynamicPersonaLastProgressPercent = 100;
  return true;
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
  String mode = String(doc["mode"] | "frames");
  int width = doc["w"] | 0;
  int height = doc["h"] | 0;
  uint32_t size = doc["z"] | 0;
  String slug = cleanText(String(doc["p"] | ""), 48);
  if (mode == "atlas") {
    int atlasWidth = doc["aw"] | 0;
    int atlasHeight = doc["ah"] | 0;
    int cols = doc["cols"] | 0;
    int rows = doc["rows"] | 0;
    int frameCount = doc["fc"] | 1;
    if (version < 3 ||
        !slug.length() ||
        width != CODE_PET_DYNAMIC_PERSONA_WIDTH ||
        height != CODE_PET_DYNAMIC_PERSONA_HEIGHT ||
        cols < 1 ||
        cols > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES ||
        rows != CODE_PET_DYNAMIC_PERSONA_STATE_COUNT ||
        atlasWidth != CODE_PET_DYNAMIC_PERSONA_WIDTH * cols ||
        atlasHeight != CODE_PET_DYNAMIC_PERSONA_HEIGHT * rows ||
        size != static_cast<uint32_t>(atlasWidth) * atlasHeight * 2U ||
        frameCount < 1 ||
        frameCount > cols ||
        !SPIFFS.exists(DYNAMIC_PERSONA_ATLAS_PATH)) {
      return;
    }

    dynamicPersonaAtlasReady = true;
    dynamicPersonaAtlasReceiving = false;
    dynamicPersonaAtlasWidth = static_cast<uint16_t>(atlasWidth);
    dynamicPersonaAtlasHeight = static_cast<uint16_t>(atlasHeight);
    dynamicPersonaAtlasCols = static_cast<uint8_t>(cols);
    dynamicPersonaAtlasRows = static_cast<uint8_t>(rows);
    dynamicPersonaAtlasFrameCount = static_cast<uint8_t>(frameCount);
    dynamicPersonaTransferExpectedBytes = size;
    dynamicPersonaCachedSlug = slug;
    dynamicPersonaCachedTheme = cleanText(String(doc["th"] | "day"), 12);
    dynamicPersonaCachedTheme = (dynamicPersonaCachedTheme == "night" || dynamicPersonaCachedTheme == "dark") ? dynamicPersonaCachedTheme : "day";
    dynamicPersonaCachedStateMask = (1U << CODE_PET_DYNAMIC_PERSONA_STATE_COUNT) - 1U;
    for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) {
      dynamicPersonaCachedFrameCounts[i] = dynamicPersonaAtlasFrameCount;
    }
    dynamicPersonaReceiving = false;
    dynamicPersonaShowLoading = true;
    dynamicPersonaTransferSlug = "";
    dynamicPersonaTransferState = "idle";
    dynamicPersonaExpectedSeq = 0;
    dynamicPersonaReceived = 0;
    dynamicPersonaRleIndex = 0;

    loadDynamicPersonaStateFrames(dynamicPersonaVisualState(pet.state));
    return;
  }

  if (version < 1 ||
      !slug.length() ||
      width != CODE_PET_DYNAMIC_PERSONA_WIDTH ||
      height != CODE_PET_DYNAMIC_PERSONA_HEIGHT ||
      size != CODE_PET_DYNAMIC_PERSONA_BYTES) {
    return;
  }

  dynamicPersonaCachedSlug = slug;
  dynamicPersonaCachedTheme = cleanText(String(doc["th"] | "day"), 12);
  dynamicPersonaCachedTheme = (dynamicPersonaCachedTheme == "night" || dynamicPersonaCachedTheme == "dark") ? dynamicPersonaCachedTheme : "day";
  dynamicPersonaCachedStateMask = 0;
  for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) dynamicPersonaCachedFrameCounts[i] = 0;

  if (version >= 2) {
    dynamicPersonaCachedStateMask = doc["sm"] | 0;
    JsonArrayConst counts = doc["fc"].as<JsonArrayConst>();
    for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) {
      int count = counts[i] | 0;
      if (count < 0) count = 0;
      if (count > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) count = CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES;
      dynamicPersonaCachedFrameCounts[i] = static_cast<uint8_t>(count);
    }
  } else {
    String legacyState = dynamicPersonaVisualState(String(doc["st"] | "idle"));
    int frameCount = doc["fc"] | 1;
    if (frameCount < 1 || frameCount > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES) return;
    int8_t stateIndex = dynamicPersonaStateIndex(legacyState);
    if (stateIndex < 0) return;
    dynamicPersonaCachedStateMask = (1U << stateIndex);
    dynamicPersonaCachedFrameCounts[stateIndex] = static_cast<uint8_t>(frameCount);
  }

  dynamicPersonaReceiving = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaTransferSlug = "";
  dynamicPersonaTransferState = "idle";
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaReceived = 0;
  dynamicPersonaRleIndex = 0;

  String preferredState = dynamicPersonaVisualState(pet.state);
  if (!loadDynamicPersonaStateFrames(preferredState)) {
    for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) {
      if (dynamicPersonaCachedStateMask & (1U << i)) {
        loadDynamicPersonaStateFrames(String(DYNAMIC_PERSONA_STATE_NAMES[i]));
        break;
      }
    }
  }
}
#else
static bool loadDynamicPersonaStateFrames(const String &state) {
  (void)state;
  return false;
}
static bool saveDynamicPersonaFrame() { return false; }
static void loadDynamicPersonaFrame() {}
#endif

static void abortDynamicPersonaTransfer() {
  if (dynamicPersonaAtlasReceiving) dynamicPersonaAtlasReady = false;
  dynamicPersonaReceiving = false;
  dynamicPersonaAtlasReceiving = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaTransferSlug = "";
  dynamicPersonaTransferState = "idle";
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaReceived = 0;
  dynamicPersonaTransferExpectedBytes = 0;
  dynamicPersonaTransferFrameCount = 1;
  dynamicPersonaTransferFrameIndex = 0;
  dynamicPersonaReceivedFrameMask = 0;
  dynamicPersonaLastProgressPercent = 0;
  dynamicPersonaRleIndex = 0;
#if defined(ESP32)
  if (dynamicPersonaAtlasWriteFile) dynamicPersonaAtlasWriteFile.close();
  dynamicPersonaAtlasWriteBufferSize = 0;
  if (ensureDynamicPersonaStore()) SPIFFS.remove(DYNAMIC_PERSONA_ATLAS_TMP_PATH);
#endif
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

static bool flushDynamicPersonaAtlasWriteBuffer() {
#if defined(ESP32)
  if (!dynamicPersonaAtlasWriteBufferSize) return true;
  if (!dynamicPersonaAtlasWriteFile) return false;
  size_t written = dynamicPersonaAtlasWriteFile.write(dynamicPersonaAtlasWriteBuffer,
                                                      dynamicPersonaAtlasWriteBufferSize);
  if (written != dynamicPersonaAtlasWriteBufferSize) return false;
  dynamicPersonaAtlasWriteBufferSize = 0;
  return true;
#else
  return false;
#endif
}

static bool appendDynamicPersonaAtlasByte(uint8_t value) {
#if defined(ESP32)
  if (!dynamicPersonaAtlasWriteFile) return false;
  if (!dynamicPersonaTransferExpectedBytes ||
      dynamicPersonaReceived >= dynamicPersonaTransferExpectedBytes) {
    return false;
  }
  if (dynamicPersonaAtlasWriteBufferSize >= sizeof(dynamicPersonaAtlasWriteBuffer) &&
      !flushDynamicPersonaAtlasWriteBuffer()) {
    return false;
  }
  dynamicPersonaAtlasWriteBuffer[dynamicPersonaAtlasWriteBufferSize++] = value;
  dynamicPersonaReceived++;
  if (dynamicPersonaAtlasWriteBufferSize >= sizeof(dynamicPersonaAtlasWriteBuffer) &&
      !flushDynamicPersonaAtlasWriteBuffer()) {
    return false;
  }
  return true;
#else
  (void)value;
  return false;
#endif
}

static bool appendDynamicPersonaAtlasDecodedByte(uint8_t value) {
  if (dynamicPersonaFormat == DYNAMIC_PERSONA_RLE_RGB565) {
    dynamicPersonaRleTriple[dynamicPersonaRleIndex++] = value;
    if (dynamicPersonaRleIndex < 3) return true;

    uint8_t lo = dynamicPersonaRleTriple[0];
    uint8_t hi = dynamicPersonaRleTriple[1];
    uint8_t count = dynamicPersonaRleTriple[2];
    dynamicPersonaRleIndex = 0;
    if (count == 0) return false;
    for (uint8_t i = 0; i < count; i++) {
      if (!appendDynamicPersonaAtlasByte(lo) || !appendDynamicPersonaAtlasByte(hi)) return false;
    }
    return true;
  }

  return appendDynamicPersonaAtlasByte(value);
}

static bool appendDynamicPersonaAtlasBase64(const String &encoded) {
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
      if (!appendDynamicPersonaAtlasDecodedByte(static_cast<uint8_t>((value >> bits) & 0xFF))) return false;
      bits -= 8;
    }
  }
  return true;
}

static void applyDynamicPersonaBinaryPayload(const std::string &value) {
  if (value.length() < 5 || value[0] != '~') return;
  char op = value[1];
  uint16_t seq = static_cast<uint8_t>(value[2]) |
                 (static_cast<uint16_t>(static_cast<uint8_t>(value[3])) << 8);

  if (op == 'a') {
    if (!dynamicPersonaAtlasReceiving || !dynamicPersonaReceiving ||
        seq != dynamicPersonaExpectedSeq) {
      abortDynamicPersonaTransfer();
      return;
    }
    for (size_t i = 4; i < value.length(); i++) {
      if (!appendDynamicPersonaAtlasDecodedByte(static_cast<uint8_t>(value[i]))) {
        abortDynamicPersonaTransfer();
        return;
      }
    }
    dynamicPersonaExpectedSeq++;
    uint8_t progress = dynamicPersonaProgressPercent();
    if (progress != dynamicPersonaLastProgressPercent) {
      dynamicPersonaLastProgressPercent = progress;
      if (dynamicPersonaShowLoading) markDirty();
    }
  }
}

static void applyDynamicPersonaPayload(JsonVariantConst src) {
  String op = String(src["im"] | "");

  if (op == "as") {
    String id = cleanText(String(src["id"] | ""), 48);
    String slug = cleanText(String(src["p"] | ""), 48);
    String displayName = cleanText(String(src["d"] | src["displayName"] | ""), 48);
    String kind = cleanText(String(src["k"] | src["kind"] | ""), 24);
    String spriteUrl = String(src["u"] | src["spritesheetUrl"] | "");
    String theme = cleanText(String(src["th"] | src["theme"] | ""), 12);
    theme = (theme == "night" || theme == "dark") ? theme : "day";
    String format = String(src["f"] | "");
    int width = src["w"] | 0;
    int height = src["h"] | 0;
    int atlasWidth = src["aw"] | 0;
    int atlasHeight = src["ah"] | 0;
    uint32_t size = src["z"] | 0;
    int cols = src["cols"] | 0;
    if (!cols) cols = src["fc"] | 0;
    int rows = src["rows"] | 0;
    if (!rows) rows = src["sc"] | 0;
    int frameCount = src["fc"] | cols;
    bool showLoading = true;

    if (!id.length() || !slug.length() ||
        width != CODE_PET_DYNAMIC_PERSONA_WIDTH ||
        height != CODE_PET_DYNAMIC_PERSONA_HEIGHT ||
        cols < 1 ||
        cols > CODE_PET_DYNAMIC_PERSONA_MAX_FRAMES ||
        rows != CODE_PET_DYNAMIC_PERSONA_STATE_COUNT ||
        atlasWidth != CODE_PET_DYNAMIC_PERSONA_WIDTH * cols ||
        atlasHeight != CODE_PET_DYNAMIC_PERSONA_HEIGHT * rows ||
        size != static_cast<uint32_t>(atlasWidth) * atlasHeight * 2U ||
        frameCount < 1 ||
        frameCount > cols ||
        (format != "rgb565" && format != "rgb565-rle")) {
      abortDynamicPersonaTransfer();
      return;
    }

#if defined(ESP32)
    if (!ensureDynamicPersonaStore()) {
      abortDynamicPersonaTransfer();
      return;
    }
    if (dynamicPersonaAtlasWriteFile) dynamicPersonaAtlasWriteFile.close();
    dynamicPersonaAtlasWriteBufferSize = 0;
    resetDynamicPersonaCacheFor(slug, theme);
    SPIFFS.remove(DYNAMIC_PERSONA_ATLAS_TMP_PATH);
    dynamicPersonaAtlasWriteFile = SPIFFS.open(DYNAMIC_PERSONA_ATLAS_TMP_PATH, FILE_WRITE);
    if (!dynamicPersonaAtlasWriteFile) {
      abortDynamicPersonaTransfer();
      return;
    }
#else
    abortDynamicPersonaTransfer();
    return;
#endif

    dynamicPersonaReceiving = true;
    dynamicPersonaAtlasReceiving = true;
    dynamicPersonaAtlasReady = false;
    dynamicPersonaShowLoading = showLoading;
    dynamicPersonaId = id;
    dynamicPersonaTransferSlug = slug;
    dynamicPersonaTransferState = dynamicPersonaVisualState(pet.state);
    dynamicPersonaFormat = format == "rgb565-rle" ? DYNAMIC_PERSONA_RLE_RGB565 : DYNAMIC_PERSONA_RAW_RGB565;
    dynamicPersonaExpectedSeq = 0;
    dynamicPersonaReceived = 0;
    dynamicPersonaTransferExpectedBytes = size;
    dynamicPersonaTransferFrameCount = 1;
    dynamicPersonaTransferFrameIndex = 0;
    dynamicPersonaReceivedFrameMask = 0;
    dynamicPersonaLastProgressPercent = 0;
    dynamicPersonaRleIndex = 0;
    dynamicPersonaAtlasWidth = static_cast<uint16_t>(atlasWidth);
    dynamicPersonaAtlasHeight = static_cast<uint16_t>(atlasHeight);
    dynamicPersonaAtlasCols = static_cast<uint8_t>(cols);
    dynamicPersonaAtlasRows = static_cast<uint8_t>(rows);
    dynamicPersonaAtlasFrameCount = static_cast<uint8_t>(frameCount);
    pet.personaSlug = slug;
    if (displayName.length()) pet.personaName = displayName;
    else if (!pet.personaName.length()) pet.personaName = slug;
    if (kind.length()) pet.personaKind = kind;
    if (!src["u"].isNull() || !src["spritesheetUrl"].isNull()) pet.spriteUrl = spriteUrl;
    if (theme.length()) pet.theme = theme;
    markDirty();
    return;
  }

  if (op == "ac") {
    String id = String(src["id"] | "");
    int seq = src["q"] | -1;
    if (!dynamicPersonaAtlasReceiving || !dynamicPersonaReceiving ||
        id != dynamicPersonaId || seq != dynamicPersonaExpectedSeq) {
      abortDynamicPersonaTransfer();
      return;
    }
    String data = String(src["d"] | "");
    if (!data.length() || !appendDynamicPersonaAtlasBase64(data)) {
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

  if (op == "ae") {
    String id = String(src["id"] | "");
    if (dynamicPersonaAtlasReceiving && dynamicPersonaReceiving &&
        id == dynamicPersonaId &&
        dynamicPersonaReceived == dynamicPersonaTransferExpectedBytes &&
        dynamicPersonaRleIndex == 0) {
#if defined(ESP32)
      if (!flushDynamicPersonaAtlasWriteBuffer()) {
        abortDynamicPersonaTransfer();
        return;
      }
      if (dynamicPersonaAtlasWriteFile) dynamicPersonaAtlasWriteFile.close();
      SPIFFS.remove(DYNAMIC_PERSONA_ATLAS_PATH);
      if (!SPIFFS.rename(DYNAMIC_PERSONA_ATLAS_TMP_PATH, DYNAMIC_PERSONA_ATLAS_PATH)) {
        abortDynamicPersonaTransfer();
        return;
      }
#endif
      dynamicPersonaAtlasReady = true;
      dynamicPersonaReady = false;
      dynamicPersonaCachedSlug = dynamicPersonaTransferSlug;
      dynamicPersonaCachedTheme = (pet.theme == "night" || pet.theme == "dark") ? pet.theme : "day";
      dynamicPersonaCachedStateMask = (1U << CODE_PET_DYNAMIC_PERSONA_STATE_COUNT) - 1U;
      for (uint8_t i = 0; i < CODE_PET_DYNAMIC_PERSONA_STATE_COUNT; i++) {
        dynamicPersonaCachedFrameCounts[i] = dynamicPersonaAtlasFrameCount;
      }
      if (!loadDynamicPersonaStateFrames(dynamicPersonaVisualState(pet.state))) {
        abortDynamicPersonaTransfer();
        return;
      }
      dynamicPersonaReceiving = false;
      dynamicPersonaAtlasReceiving = false;
      dynamicPersonaTransferSlug = "";
      dynamicPersonaTransferState = "idle";
      dynamicPersonaLastProgressPercent = 100;
      writeDynamicPersonaAtlasMeta();
      markDirty();
    } else {
      abortDynamicPersonaTransfer();
    }
    return;
  }

  if (op == "s") {
    String id = cleanText(String(src["id"] | ""), 48);
    String slug = cleanText(String(src["p"] | ""), 48);
    String displayName = cleanText(String(src["d"] | src["displayName"] | ""), 48);
    String kind = cleanText(String(src["k"] | src["kind"] | ""), 24);
    String spriteUrl = String(src["u"] | src["spritesheetUrl"] | "");
    String theme = cleanText(String(src["th"] | src["theme"] | ""), 12);
    theme = (theme == "night" || theme == "dark") ? theme : "day";
    String state = dynamicPersonaVisualState(String(src["st"] | src["state"] | "idle"));
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
        (format != "rgb565" && format != "rgb565-rle") ||
        dynamicPersonaStateIndex(state) < 0) {
      abortDynamicPersonaTransfer();
      return;
    }

    if (frameSlot == 0) {
      if (dynamicPersonaCachedSlug != slug || dynamicPersonaCachedTheme != theme) {
        resetDynamicPersonaCacheFor(slug, theme);
      }
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
    dynamicPersonaAtlasReceiving = false;
    dynamicPersonaShowLoading = showLoading;
    dynamicPersonaId = id;
    dynamicPersonaTransferFrameIndex = static_cast<uint8_t>(frameSlot);
    dynamicPersonaFormat = format == "rgb565-rle" ? DYNAMIC_PERSONA_RLE_RGB565 : DYNAMIC_PERSONA_RAW_RGB565;
    dynamicPersonaExpectedSeq = 0;
    dynamicPersonaReceived = 0;
    dynamicPersonaTransferExpectedBytes = static_cast<uint32_t>(frameCount) * CODE_PET_DYNAMIC_PERSONA_BYTES;
    dynamicPersonaLastProgressPercent = 0;
    dynamicPersonaRleIndex = 0;
    String previousPersonaSlug = pet.personaSlug;
    pet.personaSlug = slug;
    if (displayName.length()) pet.personaName = displayName;
    else if (previousPersonaSlug != slug || !pet.personaName.length()) pet.personaName = slug;
    if (kind.length()) pet.personaKind = kind;
    if (!src["u"].isNull() || !src["spritesheetUrl"].isNull()) pet.spriteUrl = spriteUrl;
    if (theme.length()) pet.theme = theme;
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
    if (dynamicPersonaAtlasReceiving || !dynamicPersonaReceiving ||
        id != dynamicPersonaId || seq != dynamicPersonaExpectedSeq) {
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
    if (!dynamicPersonaAtlasReceiving && dynamicPersonaReceiving && id == dynamicPersonaId &&
        dynamicPersonaReceived == CODE_PET_DYNAMIC_PERSONA_BYTES &&
        dynamicPersonaRleIndex == 0) {
      dynamicPersonaReceiving = false;
      memcpy(dynamicPersonaPixels[dynamicPersonaTransferFrameIndex], dynamicPersonaPendingPixels, CODE_PET_DYNAMIC_PERSONA_BYTES);
      invalidateDynamicPersonaImage(dynamicPersonaTransferFrameIndex);
      dynamicPersonaReady = true;
      dynamicPersonaSlug = dynamicPersonaTransferSlug;
      dynamicPersonaState = dynamicPersonaTransferState;
      dynamicPersonaCachedSlug = dynamicPersonaTransferSlug;
      dynamicPersonaCachedTheme = (pet.theme == "night" || pet.theme == "dark") ? pet.theme : "day";
      dynamicPersonaReceivedFrameMask |= (1U << dynamicPersonaTransferFrameIndex);
      if (dynamicPersonaReceivedFrameMask & 0x01) dynamicPersonaFrameCount = 1;
      uint8_t completeMask = (1U << dynamicPersonaTransferFrameCount) - 1U;
      if ((dynamicPersonaReceivedFrameMask & completeMask) == completeMask) {
        dynamicPersonaFrameCount = dynamicPersonaTransferFrameCount;
        dynamicPersonaTransferSlug = "";
        dynamicPersonaTransferState = dynamicPersonaState;
        dynamicPersonaLastProgressPercent = 100;
        saveDynamicPersonaFrame();
        String currentState = dynamicPersonaVisualState(pet.state);
        if (currentState != dynamicPersonaState) loadDynamicPersonaStateFrames(currentState);
      }
      markDirty();
    } else {
      abortDynamicPersonaTransfer();
    }
  }
}
#endif

static void setDisconnectedPetState() {
#if defined(CODE_PET_USE_COLOR_LVGL)
  abortDynamicPersonaTransfer();
#elif defined(CODE_PET_USE_SIMPLE_DYNAMIC_PERSONA) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  simpleAbortDynamicPersonaTransfer();
#endif
  String currentTheme = pet.theme;
  bool changed = pet.state != "idle" || pet.stateLabel.length() || pet.agent.length() ||
                 pet.event != CODE_PET_DISCONNECTED_LABEL || pet.title.length() || pet.output.length() ||
                 pet.personaSlug != CODE_PET_LVGL_FALLBACK_PERSONA_SLUG ||
                 pet.personaName != "Lulu" ||
                 pet.personaKind.length() ||
                 pet.spriteUrl.length() ||
                 pet.activeCount != 0;
  pet.state = "idle";
  pet.stateLabel = "";
  pet.agent = "";
  pet.event = CODE_PET_DISCONNECTED_LABEL;
  pet.title = "";
  pet.output = "";
  pet.personaSlug = CODE_PET_LVGL_FALLBACK_PERSONA_SLUG;
  pet.personaName = "Lulu";
  pet.personaKind = "";
  pet.spriteUrl = "";
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

#if defined(CODE_PET_USE_COLOR_LVGL)
  if (dynamicPersonaReceiving &&
      dynamicPersonaTransferSlug.length() &&
      nextPersonaSlug != dynamicPersonaTransferSlug) {
    abortDynamicPersonaTransfer();
  }
#elif defined(CODE_PET_USE_SIMPLE_DYNAMIC_PERSONA) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  if (simpleDynamicPersonaReceiving &&
      simpleDynamicPersonaTransferSlug.length() &&
      nextPersonaSlug != simpleDynamicPersonaTransferSlug) {
    simpleAbortDynamicPersonaTransfer();
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

#if defined(CODE_PET_USE_COLOR_LVGL)
  if (doc["im"].is<const char *>()) {
    applyDynamicPersonaPayload(doc.as<JsonVariantConst>());
    return;
  }
#elif defined(CODE_PET_USE_SIMPLE_DYNAMIC_PERSONA) && defined(CODE_PET_DISPLAY_TFT_ESPI)
  if (doc["im"].is<const char *>()) {
    simpleApplyDynamicPersonaPayload(doc.as<JsonVariantConst>());
    return;
  }
#else
  if (doc["im"].is<const char *>()) return;
#endif

  if (doc["pets"].is<JsonArray>()) {
    JsonArray pets = doc["pets"].as<JsonArray>();
    JsonVariantConst selected;
    for (JsonVariantConst item : pets) {
      JsonVariantConst packet = item["packet"];
      String state = normalizePacketState(String(item["state"] | item["s"] | packet["state"] | packet["s"] | "idle"));
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
#if defined(CODE_PET_USE_COLOR_LVGL)
  if (marker == '~') {
    applyDynamicPersonaBinaryPayload(value);
    return;
  }
#endif
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

#if defined(CODE_PET_HAS_BLE) || defined(CODE_PET_HAS_RPC_BLE)
static void restartAdvertising() {
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    (void)server;
#if defined(CODE_PET_TEST_BUTTON_PIN)
    localTestActive = false;
#endif
    bleConnected = true;
    clearDisconnectedPetState();
    noteDisplayActivity();
    markDirty();
  }

  void onDisconnect(BLEServer *server) override {
    (void)server;
#if defined(CODE_PET_TEST_BUTTON_PIN)
    localTestActive = false;
#endif
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
#if defined(CODE_PET_HAS_BLE)
  BLEDevice::setMTU(CODE_PET_BLE_MTU);
#endif
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

#if defined(CODE_PET_TEST_BUTTON_PIN)
static const char *CODE_PET_TEST_STATES[] = {
  "idle", "thinking", "working", "juggling", "building",
  "attention", "notification", "error", "sweeping", "sleeping"
};
static const uint8_t CODE_PET_TEST_STATE_COUNT = sizeof(CODE_PET_TEST_STATES) / sizeof(CODE_PET_TEST_STATES[0]);
static uint8_t codePetTestIndex = 0;

static void setupTestButton() {
  pinMode(CODE_PET_TEST_BUTTON_PIN, INPUT_PULLUP);
}

static void handleTestButton() {
  static bool wasDown = false;
  bool down = digitalRead(CODE_PET_TEST_BUTTON_PIN) == LOW;
  if (down && !wasDown) {
    codePetTestIndex = (codePetTestIndex + 1) % CODE_PET_TEST_STATE_COUNT;
    String nextState = normalizePacketState(String(CODE_PET_TEST_STATES[codePetTestIndex]));
    localTestActive = true;
    pet.state = nextState;
    pet.stateLabel = localizedStateLabel(nextState, pet.locale, "");
    pet.agent = "local";
    pet.event = "button-test";
    pet.title = "";
    pet.output = "button-test";
    pet.personaSlug = CODE_PET_LVGL_FALLBACK_PERSONA_SLUG;
    pet.personaName = "Lulu";
    pet.activeCount = nextState == "idle" ? 0 : 1;
    pet.receivedAt = millis();
#if defined(CODE_PET_USE_SIMPLE_DYNAMIC_PERSONA) && defined(CODE_PET_DISPLAY_TFT_ESPI)
    simpleClearDynamicPersonaFrame();
#endif
    noteDisplayActivity();
    markDirty();
  }
  wasDown = down;
}
#else
static void setupTestButton() {}
static void handleTestButton() {}
#endif

void setup() {
  Serial.begin(115200);
  displayBegin();
#if defined(CODE_PET_USE_COLOR_LVGL)
  loadDynamicPersonaFrame();
#endif
#if defined(CODE_PET_STATUS_PIXEL)
  statusPixel.begin();
  statusPixel.clear();
  statusPixel.show();
#endif
  setupTestButton();
  setDisconnectedPetState();
  markDirty();
#if defined(CODE_PET_HAS_BLE) || defined(CODE_PET_HAS_RPC_BLE)
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
#if defined(CODE_PET_USE_COLOR_LVGL)
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

  handleTestButton();

#if defined(CODE_PET_USE_WIFI)
  if (millis() - lastPollAt > 1000) {
    lastPollAt = millis();
    pollBridge();
  }
#endif

  const bool pauseFrameAnimation =
#if defined(CODE_PET_USE_COLOR_LVGL)
    dynamicPersonaLoadingCurrent();
#else
    false;
#endif

  if (!pauseFrameAnimation && millis() - lastFrameAt > CODE_PET_ANIMATION_FRAME_MS) {
    lastFrameAt = millis();
    frameIndex++;
    uiDirty = true;
  }

#if defined(CODE_PET_USE_COLOR_LVGL)
  if (!uiDirty) lv_timer_handler();
#endif
  if (uiDirty) renderScreen();
}
