#include <Arduino.h>
#include <ArduinoJson.h>

#if defined(CODE_PET_DISPLAY_M5UNIFIED)
#include <M5Unified.h>
#elif defined(CODE_PET_DISPLAY_TFT_ESPI)
#include <TFT_eSPI.h>
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

#if defined(CODE_PET_STATUS_PIXEL)
Adafruit_NeoPixel statusPixel(CP_STATUS_PIXEL_COUNT, CP_STATUS_PIXEL_PIN, NEO_GRB + NEO_KHZ800);
#endif

struct VibePetPacket {
  String state = "idle";
  String agent = "agent";
  String event = "";
  String title = "";
  String personaSlug = "lulu";
  String personaName = "Lulu";
  String personaKind = "";
  String spriteUrl = "";
  int activeCount = 0;
  unsigned long receivedAt = 0;
};

VibePetPacket pet;
String incomingPayload;
bool pendingPayload = false;
bool bleConnected = false;
bool uiDirty = true;
uint8_t frameIndex = 0;
unsigned long lastFrameAt = 0;
unsigned long lastPollAt = 0;
unsigned long lastWifiAttemptAt = 0;

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

static String cleanText(const String &input, uint8_t maxLen) {
  String out = input;
  out.trim();
  out.replace("\n", " ");
  out.replace("\r", " ");
  while (out.indexOf("  ") >= 0) out.replace("  ", " ");
  if (out.length() > maxLen) out = out.substring(0, maxLen - 3) + "...";
  return out;
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
#if defined(TFT_BL) && TFT_BL >= 0
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

static void renderScreen() {
  updateStatusPixel();

  const bool oled = screenW() <= 128 && screenH() <= 64;
  uint16_t bg = oled ? 0 : rgb565(238, 244, 247);
  uint16_t header = oled ? 0 : rgb565(24, 32, 42);
  uint16_t panel = oled ? 0 : rgb565(255, 255, 255);
  uint16_t ink = oled ? 1 : rgb565(38, 50, 65);
  uint16_t muted = oled ? 1 : rgb565(83, 93, 110);
  uint16_t face = oled ? 0 : rgb565(215, 245, 255);
  uint16_t body = oled ? 0 : personaColor();
  uint16_t accent = oled ? 1 : stateColor(pet.state);

  fillScreen(bg);

  if (oled) {
    drawText(cleanText(pet.agent, 12), 0, 0, 1, 1, 0);
    drawText(stateLabel(pet.state), 0, 10, 1, 1, 0);
    drawText(cleanText(pet.personaName, 12), 0, screenH() - 10, 1, 1, 0);
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
  drawText(stateLabel(pet.state), 18, 50, 1, accent, panel);
  drawText(cleanText(pet.agent, 16), w / 2, 50, 1, muted, panel);

  renderPetFace(w / 2, h / 2 + 22, min(w, h) > 200 ? 13 : 10, body, accent, ink, face);

  fillRect(0, h - 24, w, 24, header);
  String footer = cleanText(pet.personaName, 18);
  if (pet.title.length()) footer += " / " + cleanText(pet.title, 18);
  drawText(footer, 8, h - 17, 1, rgb565(255, 255, 255), header);
  displayFlush();
  uiDirty = false;
}

static void markDirty() {
  uiDirty = true;
}

static void applyPacket(JsonVariantConst src) {
  String nextState = String(src["s"] | src["state"] | "idle");
  String nextAgent = String(src["a"] | src["agentName"] | src["agent"] | "agent");
  String nextEvent = String(src["e"] | src["event"] | "");
  String nextTitle = String(src["m"] | src["title"] | "");
  String nextPersonaSlug = String(src["p"] | src["persona"]["slug"] | "lulu");
  String nextPersonaName = String(src["d"] | src["persona"]["displayName"] | "Lulu");
  String nextPersonaKind = String(src["k"] | src["persona"]["kind"] | "");
  String nextSpriteUrl = String(src["u"] | src["persona"]["spritesheetUrl"] | "");
  int nextActiveCount = src["n"] | src["activeCount"] | 0;

  bool changed = nextState != pet.state || nextAgent != pet.agent || nextEvent != pet.event ||
                 nextTitle != pet.title || nextPersonaSlug != pet.personaSlug ||
                 nextPersonaName != pet.personaName || nextActiveCount != pet.activeCount;

  pet.state = cleanText(nextState, 24);
  pet.agent = cleanText(nextAgent, 24);
  pet.event = cleanText(nextEvent, 40);
  pet.title = cleanText(nextTitle, 40);
  pet.personaSlug = cleanText(nextPersonaSlug, 48);
  pet.personaName = cleanText(nextPersonaName, 48);
  pet.personaKind = cleanText(nextPersonaKind, 24);
  pet.spriteUrl = nextSpriteUrl;
  pet.activeCount = nextActiveCount;
  pet.receivedAt = millis();
  if (changed) markDirty();
}

static void applyPayload(const String &payload) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    pet.state = "error";
    pet.agent = "bad-json";
    pet.event = error.c_str();
    markDirty();
    return;
  }

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
    markDirty();
  }

  void onDisconnect(BLEServer *server) override {
    (void)server;
    bleConnected = false;
    markDirty();
    restartAdvertising();
  }
};

class StateCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    std::string value = characteristic->getValue();
    if (!value.length()) return;
    incomingPayload = String(value.c_str());
    pendingPayload = true;
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

  if (pendingPayload) {
    pendingPayload = false;
    applyPayload(incomingPayload);
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

  if (uiDirty) renderScreen();
}
