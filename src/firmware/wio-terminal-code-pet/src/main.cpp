#include <Arduino.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <rpcBLEDevice.h>
#include <BLEServer.h>
#include <ArduinoJson.h>

#define DEVICE_NAME "VibePet-Wio"
#define SERVICE_UUID "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001"
#define STATE_CHAR_UUID "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002"

#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 240
#define HEADER_H 46
#define FOOTER_Y 218
#define FOOTER_H 22
#define PET_AREA_X 34
#define PET_AREA_Y 102
#define PET_AREA_W 252
#define PET_AREA_H 116
#define DYNAMIC_PERSONA_WIDTH 144
#define DYNAMIC_PERSONA_HEIGHT 156
#define DYNAMIC_PERSONA_BYTES (DYNAMIC_PERSONA_WIDTH * DYNAMIC_PERSONA_HEIGHT * 2)
#define BLE_PAYLOAD_QUEUE_SIZE 24
#define OUTPUT_MAX_CHARS 120

TFT_eSPI tft;

enum DynamicPersonaFormat : uint8_t {
  DYNAMIC_PERSONA_RAW_RGB565,
  DYNAMIC_PERSONA_RLE_RGB565,
};

struct PetState {
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

PetState pet;
BLEServer *bleServer = nullptr;
BLECharacteristic *stateCharacteristic = nullptr;

String incomingPayloadQueue[BLE_PAYLOAD_QUEUE_SIZE];
volatile uint8_t incomingPayloadHead = 0;
volatile uint8_t incomingPayloadTail = 0;
bool pendingPayload = false;
bool bleConnected = false;
bool uiDirty = true;
bool petDirty = true;
uint8_t testIndex = 0;
unsigned long lastFrameAt = 0;
uint8_t frameIndex = 0;

static uint8_t dynamicPersonaPixels[DYNAMIC_PERSONA_BYTES];
static String dynamicPersonaId = "";
static String dynamicPersonaSlug = "";
static String dynamicPersonaTransferSlug = "";
static bool dynamicPersonaReady = false;
static bool dynamicPersonaReceiving = false;
static bool dynamicPersonaShowLoading = true;
static DynamicPersonaFormat dynamicPersonaFormat = DYNAMIC_PERSONA_RAW_RGB565;
static uint16_t dynamicPersonaExpectedSeq = 0;
static uint32_t dynamicPersonaReceived = 0;
static uint8_t dynamicPersonaLastProgressPercent = 0;
static uint8_t dynamicPersonaRleTriple[3] = {0, 0, 0};
static uint8_t dynamicPersonaRleIndex = 0;

const char *TEST_STATES[] = {
  "idle", "thinking", "working", "juggling", "building",
  "attention", "notification", "error", "sweeping", "sleeping"
};
const uint8_t TEST_STATE_COUNT = sizeof(TEST_STATES) / sizeof(TEST_STATES[0]);

uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
  return tft.color565(r, g, b);
}

bool isNightTheme() {
  return pet.theme == "night" || pet.theme == "dark";
}

uint16_t screenBg() {
  return isNightTheme() ? TFT_BLACK : rgb(238, 244, 247);
}

uint16_t headerBg() {
  return isNightTheme() ? rgb(13, 16, 22) : rgb(24, 32, 42);
}

uint16_t panelBg() {
  return isNightTheme() ? rgb(24, 29, 38) : TFT_WHITE;
}

uint16_t panelLine() {
  return isNightTheme() ? rgb(54, 62, 78) : rgb(215, 221, 231);
}

uint16_t textInk() {
  return isNightTheme() ? rgb(238, 242, 247) : rgb(38, 50, 65);
}

uint16_t textMuted() {
  return isNightTheme() ? rgb(181, 190, 204) : rgb(83, 93, 110);
}

uint16_t petFace() {
  return isNightTheme() ? rgb(28, 46, 56) : rgb(215, 245, 255);
}

uint32_t hashText(const String &text) {
  uint32_t hash = 2166136261u;
  for (size_t i = 0; i < text.length(); i++) {
    hash ^= static_cast<uint8_t>(text[i]);
    hash *= 16777619u;
  }
  return hash;
}

uint8_t utf8CodepointBytes(uint8_t lead) {
  if ((lead & 0x80) == 0) return 1;
  if ((lead & 0xE0) == 0xC0) return 2;
  if ((lead & 0xF0) == 0xE0) return 3;
  if ((lead & 0xF8) == 0xF0) return 4;
  return 0;
}

bool hasValidUtf8Continuation(const String &text, size_t start, uint8_t byteCount) {
  if (byteCount == 0 || start + byteCount > text.length()) return false;
  for (uint8_t i = 1; i < byteCount; i++) {
    if ((static_cast<uint8_t>(text[start + i]) & 0xC0) != 0x80) return false;
  }
  return true;
}

bool appendUtf8Codepoints(String &out, const String &text, uint8_t maxChars) {
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

String cleanText(const String &input, uint8_t maxLen) {
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

uint16_t colorForState(const String &state) {
  if (state == "thinking") return rgb(211, 139, 31);
  if (state == "working" || state == "typing") return rgb(28, 154, 115);
  if (state == "building") return rgb(221, 104, 52);
  if (state == "juggling") return rgb(111, 98, 201);
  if (state == "attention") return rgb(224, 120, 56);
  if (state == "notification" || state == "permission") return rgb(214, 69, 69);
  if (state == "error") return rgb(185, 33, 44);
  if (state == "sweeping") return rgb(30, 132, 152);
  if (state == "sleeping") return rgb(100, 111, 130);
  return rgb(45, 125, 210);
}

uint16_t personaColor() {
  if (pet.personaSlug == "lulu" || pet.personaSlug == "lulu-capybara-2" || pet.personaName == "Lulu") {
    return rgb(183, 126, 83);
  }
  uint32_t h = hashText(pet.personaSlug + pet.personaName);
  uint8_t r = 80 + ((h >> 0) & 0x7F);
  uint8_t g = 80 + ((h >> 8) & 0x7F);
  uint8_t b = 80 + ((h >> 16) & 0x7F);
  return rgb(r, g, b);
}

String stateLabel() {
  if (pet.stateLabel.length()) return pet.stateLabel;
  if (pet.state == "notification" || pet.state == "permission") return "notify";
  return pet.state.length() ? pet.state : "idle";
}

void markUiDirty() {
  uiDirty = true;
  petDirty = true;
}

void markPetDirty() {
  petDirty = true;
}

bool dynamicPersonaMatchesPet() {
  return dynamicPersonaReady && dynamicPersonaSlug.length() && dynamicPersonaSlug == pet.personaSlug;
}

bool useDynamicPersonaScreen() {
  return (dynamicPersonaReceiving && dynamicPersonaShowLoading) || dynamicPersonaMatchesPet();
}

void drawTextRight(const String &text, int16_t x, int16_t y, uint8_t size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color);
  int16_t width = tft.textWidth(text);
  tft.drawString(text, x - width, y);
}

String fitTextToWidth(String text, int16_t maxWidth, uint8_t textSize) {
  text = cleanText(text, OUTPUT_MAX_CHARS);
  tft.setTextSize(textSize);
  if (tft.textWidth(text) <= maxWidth) return text;
  while (text.length() > 3 && tft.textWidth(text + "...") > maxWidth) {
    text.remove(text.length() - 1);
  }
  text += "...";
  return text;
}

void drawHeader() {
  uint16_t header = headerBg();
  tft.fillRect(0, 0, SCREEN_WIDTH, HEADER_H, header);
  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("Vibe Pet", 12, 12);
  tft.setTextSize(1);
  tft.setTextColor(bleConnected ? rgb(113, 210, 159) : rgb(190, 198, 209));
  drawTextRight(bleConnected ? "BLE connected" : "BLE advertising", 308, 17, 1, bleConnected ? rgb(113, 210, 159) : rgb(190, 198, 209));
}

void drawStatusCard() {
  uint16_t accent = colorForState(pet.state);
  uint16_t panel = panelBg();
  tft.fillRoundRect(12, 58, 296, 42, 8, panel);
  tft.drawRoundRect(12, 58, 296, 42, 8, panelLine());
  tft.setTextSize(2);
  tft.setTextColor(accent);
  tft.drawString(cleanText(stateLabel(), 14), 24, 70);
  tft.setTextSize(1);
  tft.setTextColor(textMuted());
  String right = "active " + String(pet.activeCount);
  drawTextRight(right, 294, 74, 1, textMuted());
}

void drawFooter() {
  uint16_t header = headerBg();
  tft.fillRect(0, FOOTER_Y, SCREEN_WIDTH, FOOTER_H, header);
  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE);
  String line = pet.output.length() ? pet.output : pet.title;
  if (!line.length()) {
    line = pet.agent;
    if (pet.event.length()) line += " / " + pet.event;
  }
  tft.drawString(fitTextToWidth(line, 300, 1), 10, 226);
}

void drawPetBody() {
  const uint16_t bg = screenBg();
  const uint16_t outline = textInk();
  const uint16_t face = petFace();
  const uint16_t body = personaColor();
  const uint16_t accent = colorForState(pet.state);
  const int bob = (pet.state == "sleeping") ? 2 : (frameIndex % 2 == 0 ? 0 : -3);
  const int cx = PET_AREA_X + PET_AREA_W / 2;
  const int faceX = PET_AREA_X + PET_AREA_W / 2 - 66;
  const int faceY = PET_AREA_Y + 22 + bob;
  const int bodyX = PET_AREA_X + PET_AREA_W / 2 - 50;
  const int bodyY = PET_AREA_Y + 92 + bob;

  tft.fillRect(PET_AREA_X, PET_AREA_Y, PET_AREA_W, PET_AREA_H, bg);
  tft.setTextSize(1);
  tft.setTextColor(outline, bg);
  tft.fillRoundRect(bodyX, bodyY, 100, 34, 16, body);
  tft.drawRoundRect(bodyX, bodyY, 100, 34, 16, outline);
  tft.fillRoundRect(faceX, faceY, 132, 76, 16, face);
  tft.drawRoundRect(faceX, faceY, 132, 76, 16, outline);

  tft.drawFastVLine(cx, faceY - 18, 18, outline);
  tft.fillCircle(cx, faceY - 22, 9 + (pet.state == "notification" ? frameIndex % 2 * 3 : 0), accent);

  if (pet.state == "sleeping") {
    tft.fillRoundRect(faceX + 30, faceY + 34, 24, 5, 3, outline);
    tft.fillRoundRect(faceX + 78, faceY + 34, 24, 5, 3, outline);
    tft.drawString("z", faceX + 102, faceY + 14 - frameIndex % 3 * 3);
    tft.drawString("Z", faceX + 118, faceY + 2 - frameIndex % 3 * 3);
  } else if (pet.state == "error") {
    tft.drawLine(faceX + 30, faceY + 28, faceX + 50, faceY + 48, outline);
    tft.drawLine(faceX + 50, faceY + 28, faceX + 30, faceY + 48, outline);
    tft.drawLine(faceX + 82, faceY + 28, faceX + 102, faceY + 48, outline);
    tft.drawLine(faceX + 102, faceY + 28, faceX + 82, faceY + 48, outline);
  } else {
    const int eyeOffset = (pet.state == "thinking") ? (frameIndex % 3 - 1) * 2 : 0;
    tft.fillCircle(faceX + 42 + eyeOffset, faceY + 36, 10, outline);
    tft.fillCircle(faceX + 90 + eyeOffset, faceY + 36, 10, outline);
  }

  if (pet.state == "attention" || pet.state == "working" || pet.state == "building") {
    tft.drawFastHLine(faceX + 50, faceY + 60, 32, outline);
    tft.drawFastHLine(faceX + 50, faceY + 64, 32, outline);
  } else {
    tft.drawRoundRect(faceX + 48, faceY + 56, 36, 14, 7, outline);
    tft.fillRect(faceX + 48, faceY + 56, 36, 7, face);
  }

  if (pet.state == "sweeping") {
    tft.drawLine(bodyX + 82, bodyY + 14, bodyX + 130, bodyY + 38, accent);
    tft.drawFastHLine(bodyX + 112, bodyY + 42, 34, accent);
  }
}

uint8_t dynamicPersonaProgressPercent() {
  uint32_t received = dynamicPersonaReceived;
  if (received > DYNAMIC_PERSONA_BYTES) received = DYNAMIC_PERSONA_BYTES;
  return static_cast<uint8_t>((received * 100U) / DYNAMIC_PERSONA_BYTES);
}

void drawDynamicPersonaLoading() {
  const uint16_t bg = screenBg();
  const uint16_t accent = colorForState(pet.state);
  const uint16_t panel = panelBg();
  const uint16_t track = isNightTheme() ? rgb(36, 42, 54) : rgb(224, 230, 238);
  const uint8_t progress = dynamicPersonaProgressPercent();
  tft.fillRect(0, HEADER_H, SCREEN_WIDTH, FOOTER_Y - HEADER_H, bg);
  tft.fillRoundRect(78, 108, 164, 56, 10, panel);
  tft.drawRoundRect(78, 108, 164, 56, 10, accent);
  tft.setTextSize(1);
  tft.setTextColor(textInk(), panel);
  tft.drawString("Syncing", 90, 121);
  tft.setTextColor(accent, panel);
  drawTextRight(String(progress) + "%", 230, 121, 1, accent);
  tft.fillRoundRect(90, 146, 140, 8, 4, track);
  int16_t fillWidth = (140 * progress) / 100;
  if (fillWidth < 1) fillWidth = 1;
  tft.fillRoundRect(90, 146, fillWidth, 8, 4, accent);
}

void drawDynamicPersona() {
  const int16_t x = (SCREEN_WIDTH - DYNAMIC_PERSONA_WIDTH) / 2;
  const int16_t y = 54;
  tft.fillRect(0, HEADER_H, SCREEN_WIDTH, FOOTER_Y - HEADER_H, screenBg());
  tft.pushImage(x, y, DYNAMIC_PERSONA_WIDTH, DYNAMIC_PERSONA_HEIGHT, reinterpret_cast<uint16_t *>(dynamicPersonaPixels));
}

void renderUi() {
  drawHeader();
  if (!useDynamicPersonaScreen()) drawStatusCard();
  drawFooter();
  uiDirty = false;
}

void renderPetFrame() {
  if (dynamicPersonaReceiving && dynamicPersonaShowLoading) {
    drawDynamicPersonaLoading();
  } else if (dynamicPersonaMatchesPet()) {
    drawDynamicPersona();
  } else {
    drawPetBody();
  }
  petDirty = false;
}

void renderAll() {
  tft.fillScreen(screenBg());
  renderPetFrame();
  renderUi();
}

void abortDynamicPersonaTransfer() {
  dynamicPersonaReceiving = false;
  dynamicPersonaShowLoading = true;
  dynamicPersonaId = "";
  dynamicPersonaTransferSlug = "";
  dynamicPersonaExpectedSeq = 0;
  dynamicPersonaReceived = 0;
  dynamicPersonaLastProgressPercent = 0;
  dynamicPersonaRleIndex = 0;
  markUiDirty();
}

int8_t base64Value(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

bool appendDynamicPersonaDecodedByte(uint8_t value) {
  if (dynamicPersonaFormat == DYNAMIC_PERSONA_RLE_RGB565) {
    dynamicPersonaRleTriple[dynamicPersonaRleIndex++] = value;
    if (dynamicPersonaRleIndex < 3) return true;

    uint8_t lo = dynamicPersonaRleTriple[0];
    uint8_t hi = dynamicPersonaRleTriple[1];
    uint8_t count = dynamicPersonaRleTriple[2];
    dynamicPersonaRleIndex = 0;
    if (count == 0) return false;
    for (uint8_t i = 0; i < count; i++) {
      if (dynamicPersonaReceived + 2 > DYNAMIC_PERSONA_BYTES) return false;
      dynamicPersonaPixels[dynamicPersonaReceived++] = lo;
      dynamicPersonaPixels[dynamicPersonaReceived++] = hi;
    }
    return true;
  }

  if (dynamicPersonaReceived >= DYNAMIC_PERSONA_BYTES) return false;
  dynamicPersonaPixels[dynamicPersonaReceived++] = value;
  return true;
}

bool appendDynamicPersonaBase64(const String &encoded) {
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

void applyDynamicPersonaPayload(JsonVariantConst src) {
  String op = String(src["im"] | "");

  if (op == "s") {
    String id = cleanText(String(src["id"] | ""), 48);
    String slug = cleanText(String(src["p"] | ""), 48);
    String format = String(src["f"] | "");
    int width = src["w"] | 0;
    int height = src["h"] | 0;
    uint32_t size = src["z"] | 0;
    bool showLoading = (src["ld"] | 1) != 0;

    if (!id.length() || !slug.length() ||
        width != DYNAMIC_PERSONA_WIDTH ||
        height != DYNAMIC_PERSONA_HEIGHT ||
        size != DYNAMIC_PERSONA_BYTES ||
        (format != "rgb565" && format != "rgb565-rle")) {
      abortDynamicPersonaTransfer();
      return;
    }

    dynamicPersonaReady = false;
    dynamicPersonaReceiving = true;
    dynamicPersonaShowLoading = showLoading;
    dynamicPersonaId = id;
    dynamicPersonaTransferSlug = slug;
    dynamicPersonaFormat = format == "rgb565-rle" ? DYNAMIC_PERSONA_RLE_RGB565 : DYNAMIC_PERSONA_RAW_RGB565;
    dynamicPersonaExpectedSeq = 0;
    dynamicPersonaReceived = 0;
    dynamicPersonaLastProgressPercent = 0;
    dynamicPersonaRleIndex = 0;
    markUiDirty();
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
      if (dynamicPersonaShowLoading) markPetDirty();
    }
    return;
  }

  if (op == "e") {
    String id = String(src["id"] | "");
    if (dynamicPersonaReceiving && id == dynamicPersonaId &&
        dynamicPersonaReceived == DYNAMIC_PERSONA_BYTES &&
        dynamicPersonaRleIndex == 0) {
      dynamicPersonaReceiving = false;
      dynamicPersonaReady = true;
      dynamicPersonaSlug = dynamicPersonaTransferSlug;
      dynamicPersonaTransferSlug = "";
      dynamicPersonaLastProgressPercent = 100;
      markUiDirty();
    } else {
      abortDynamicPersonaTransfer();
    }
  }
}

void applyPacket(JsonVariantConst src) {
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
                 nextTitle != pet.title || nextOutput != pet.output ||
                 nextPersonaSlug != pet.personaSlug || nextPersonaName != pet.personaName ||
                 nextPersonaKind != pet.personaKind || nextSpriteUrl != pet.spriteUrl ||
                 nextTheme != pet.theme || nextActiveCount != pet.activeCount;

  pet.state = cleanText(nextState, 24);
  pet.stateLabel = cleanText(nextStateLabel, 24);
  pet.agent = cleanText(nextAgent, 24);
  pet.event = cleanText(nextEvent, 40);
  pet.title = cleanText(nextTitle, 40);
  pet.output = cleanText(nextOutput, OUTPUT_MAX_CHARS);
  pet.personaSlug = cleanText(nextPersonaSlug, 48);
  pet.personaName = cleanText(nextPersonaName, 48);
  pet.personaKind = cleanText(nextPersonaKind, 24);
  pet.spriteUrl = nextSpriteUrl;
  nextTheme = cleanText(nextTheme, 12);
  pet.theme = (nextTheme == "night" || nextTheme == "dark") ? nextTheme : "day";
  pet.activeCount = nextActiveCount;
  pet.receivedAt = millis();
  if (changed) markUiDirty();
}

void applyPayload(const String &payload) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    Serial.print("Bad JSON: ");
    Serial.println(error.c_str());
    return;
  }

  if (doc["im"].is<const char *>()) {
    applyDynamicPersonaPayload(doc.as<JsonVariantConst>());
    return;
  }

  applyPacket(doc.as<JsonVariantConst>());
}

void restartAdvertising() {
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void enqueuePayload(const String &payload) {
  uint8_t nextTail = (incomingPayloadTail + 1) % BLE_PAYLOAD_QUEUE_SIZE;
  if (nextTail == incomingPayloadHead) {
    incomingPayloadHead = (incomingPayloadHead + 1) % BLE_PAYLOAD_QUEUE_SIZE;
  }
  incomingPayloadQueue[incomingPayloadTail] = payload;
  incomingPayloadTail = nextTail;
  pendingPayload = true;
}

bool dequeuePayload(String &payload) {
  if (incomingPayloadHead == incomingPayloadTail) {
    pendingPayload = false;
    return false;
  }
  payload = incomingPayloadQueue[incomingPayloadHead];
  incomingPayloadQueue[incomingPayloadHead] = "";
  incomingPayloadHead = (incomingPayloadHead + 1) % BLE_PAYLOAD_QUEUE_SIZE;
  pendingPayload = incomingPayloadHead != incomingPayloadTail;
  return true;
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    (void)server;
    bleConnected = true;
    markUiDirty();
  }

  void onDisconnect(BLEServer *server) override {
    (void)server;
    bleConnected = false;
    markUiDirty();
    restartAdvertising();
  }
};

class StateCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    std::string value = characteristic->getValue();
    if (!value.length()) return;
    enqueuePayload(String(value.c_str()));
  }
};

void setupBle() {
  BLEDevice::init(DEVICE_NAME);
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  BLEService *service = bleServer->createService(SERVICE_UUID);
  stateCharacteristic = service->createCharacteristic(
    STATE_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  stateCharacteristic->setCallbacks(new StateCallbacks());
  service->start();
  restartAdvertising();
}

void setupButtons() {
#ifdef WIO_5S_PRESS
  pinMode(WIO_5S_PRESS, INPUT_PULLUP);
#endif
}

void handleButtons() {
#ifdef WIO_5S_PRESS
  static bool wasDown = false;
  bool down = digitalRead(WIO_5S_PRESS) == LOW;
  if (down && !wasDown) {
    testIndex = (testIndex + 1) % TEST_STATE_COUNT;
    pet.state = TEST_STATES[testIndex];
    pet.stateLabel = "";
    pet.agent = "local";
    pet.event = "button-test";
    pet.title = "";
    pet.output = "";
    pet.activeCount = testIndex == 0 ? 0 : 1;
    dynamicPersonaReceiving = false;
    dynamicPersonaReady = false;
    markUiDirty();
  }
  wasDown = down;
#endif
}

void setup() {
  Serial.begin(115200);
#ifdef LCD_BACKLIGHT
  pinMode(LCD_BACKLIGHT, OUTPUT);
  digitalWrite(LCD_BACKLIGHT, HIGH);
#endif
  tft.begin();
  tft.setRotation(3);
  setupButtons();
  setupBle();
  pet.receivedAt = millis();
  renderAll();
}

void loop() {
  String payload;
  while (dequeuePayload(payload)) {
    applyPayload(payload);
    Serial.println(payload);
  }

  handleButtons();

  if (millis() - lastFrameAt > 450) {
    lastFrameAt = millis();
    frameIndex++;
    petDirty = true;
  }

  if (petDirty) renderPetFrame();
  if (uiDirty) renderUi();
}
