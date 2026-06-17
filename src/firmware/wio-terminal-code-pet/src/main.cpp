#include <Arduino.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <rpcBLEDevice.h>
#include <BLEServer.h>
#include <ArduinoJson.h>

#define DEVICE_NAME "VibePet-Wio"
#define SERVICE_UUID "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001"
#define STATE_CHAR_UUID "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002"

TFT_eSPI tft;
TFT_eSprite petSprite = TFT_eSprite(&tft);

#define SCREEN_BG rgb(238, 244, 247)
#define HEADER_BG rgb(24, 32, 42)
#define PANEL_LINE rgb(215, 221, 231)
#define TEXT_MUTED rgb(83, 93, 110)
#define PET_OUTLINE rgb(38, 50, 65)
#define PET_FACE rgb(215, 245, 255)
#define PET_BODY rgb(247, 208, 112)
#define PET_SPRITE_X 34
#define PET_SPRITE_Y 102
#define PET_SPRITE_W 252
#define PET_SPRITE_H 116

struct PetState {
  String state = "idle";
  String agent = "agent";
  String event = "";
  String message = "";
  int activeCount = 0;
  unsigned long receivedAt = 0;
};

PetState pet;
BLEServer *bleServer = nullptr;
BLECharacteristic *stateCharacteristic = nullptr;

bool bleConnected = false;
bool pendingPayload = false;
bool uiDirty = true;
bool petDirty = true;
bool spriteReady = false;
String incomingPayload = "";
uint8_t testIndex = 0;
unsigned long lastFrameAt = 0;
uint8_t frame = 0;

const char *TEST_STATES[] = {
  "idle", "thinking", "working", "juggling", "building",
  "attention", "notification", "error", "sweeping", "sleeping"
};
const uint8_t TEST_STATE_COUNT = sizeof(TEST_STATES) / sizeof(TEST_STATES[0]);

uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
  return tft.color565(r, g, b);
}

void markUiDirty() {
  uiDirty = true;
  petDirty = true;
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

String labelForState(const String &state) {
  if (state == "notification" || state == "permission") return "notify";
  return state;
}

void drawTextRight(const String &text, int16_t x, int16_t y, uint8_t size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color);
  int16_t width = tft.textWidth(text);
  tft.drawString(text, x - width, y);
}

void drawHeader() {
  tft.fillRect(0, 0, 320, 46, HEADER_BG);
  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("Vibe Pet", 12, 12);
  tft.setTextSize(1);
  tft.setTextColor(bleConnected ? rgb(113, 210, 159) : rgb(190, 198, 209));
  drawTextRight(bleConnected ? "BLE connected" : "BLE advertising", 308, 17, 1, bleConnected ? rgb(113, 210, 159) : rgb(190, 198, 209));
}

void drawPetBodySprite(uint16_t accent) {
  const int bob = (pet.state == "sleeping") ? 2 : (frame % 2 == 0 ? 0 : -3);
  const int cx = PET_SPRITE_W / 2;
  const int faceX = cx - 66;
  const int faceY = 22 + bob;
  const int bodyX = cx - 50;
  const int bodyY = 92 + bob;

  petSprite.setTextSize(1);
  petSprite.setTextColor(PET_OUTLINE, SCREEN_BG);
  petSprite.fillRoundRect(bodyX, bodyY, 100, 34, 16, PET_BODY);
  petSprite.drawRoundRect(bodyX, bodyY, 100, 34, 16, PET_OUTLINE);
  petSprite.fillRoundRect(faceX, faceY, 132, 76, 16, PET_FACE);
  petSprite.drawRoundRect(faceX, faceY, 132, 76, 16, PET_OUTLINE);

  petSprite.drawFastVLine(cx, faceY - 18, 18, PET_OUTLINE);
  petSprite.fillCircle(cx, faceY - 22, 9 + (pet.state == "notification" ? frame % 2 * 3 : 0), accent);

  if (pet.state == "sleeping") {
    petSprite.fillRoundRect(faceX + 30, faceY + 34, 24, 5, 3, PET_OUTLINE);
    petSprite.fillRoundRect(faceX + 78, faceY + 34, 24, 5, 3, PET_OUTLINE);
    petSprite.drawString("z", faceX + 102, faceY + 14 - frame % 3 * 3);
    petSprite.drawString("Z", faceX + 118, faceY + 2 - frame % 3 * 3);
  } else if (pet.state == "error") {
    petSprite.drawLine(faceX + 30, faceY + 28, faceX + 50, faceY + 48, PET_OUTLINE);
    petSprite.drawLine(faceX + 50, faceY + 28, faceX + 30, faceY + 48, PET_OUTLINE);
    petSprite.drawLine(faceX + 82, faceY + 28, faceX + 102, faceY + 48, PET_OUTLINE);
    petSprite.drawLine(faceX + 102, faceY + 28, faceX + 82, faceY + 48, PET_OUTLINE);
  } else {
    const int eyeOffset = (pet.state == "thinking") ? (frame % 3 - 1) * 2 : 0;
    petSprite.fillCircle(faceX + 42 + eyeOffset, faceY + 36, 10, PET_OUTLINE);
    petSprite.fillCircle(faceX + 90 + eyeOffset, faceY + 36, 10, PET_OUTLINE);
  }

  if (pet.state == "attention" || pet.state == "working" || pet.state == "building") {
    petSprite.drawFastHLine(faceX + 50, faceY + 60, 32, PET_OUTLINE);
    petSprite.drawFastHLine(faceX + 50, faceY + 64, 32, PET_OUTLINE);
  } else {
    petSprite.drawRoundRect(faceX + 48, faceY + 56, 36, 14, 7, PET_OUTLINE);
    petSprite.fillRect(faceX + 48, faceY + 56, 36, 7, PET_FACE);
  }

  if (pet.state == "sweeping") {
    petSprite.drawLine(bodyX + 82, bodyY + 14, bodyX + 130, bodyY + 38, accent);
    petSprite.drawFastHLine(bodyX + 112, bodyY + 42, 34, accent);
  }
}

void drawStatusCard() {
  uint16_t accent = colorForState(pet.state);
  tft.fillRoundRect(12, 58, 296, 42, 8, TFT_WHITE);
  tft.drawRoundRect(12, 58, 296, 42, 8, PANEL_LINE);
  tft.setTextSize(2);
  tft.setTextColor(accent);
  tft.drawString(labelForState(pet.state), 24, 70);
  tft.setTextSize(1);
  tft.setTextColor(TEXT_MUTED);
  drawTextRight("active " + String(pet.activeCount), 294, 74, 1, TEXT_MUTED);
}

void drawFooter() {
  tft.fillRect(0, 218, 320, 22, HEADER_BG);
  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE);
  String line = pet.agent;
  if (pet.event.length()) line += " / " + pet.event;
  if (pet.message.length()) line += " / " + pet.message;
  if (line.length() > 42) line = line.substring(0, 39) + "...";
  tft.drawString(line, 10, 226);
}

void renderUi() {
  drawHeader();
  drawStatusCard();
  drawFooter();
  uiDirty = false;
  petDirty = true;
}

void renderPetFrame() {
  if (spriteReady) {
    petSprite.fillSprite(SCREEN_BG);
    drawPetBodySprite(colorForState(pet.state));
    petSprite.pushSprite(PET_SPRITE_X, PET_SPRITE_Y);
  } else {
    tft.fillRect(PET_SPRITE_X, PET_SPRITE_Y, PET_SPRITE_W, PET_SPRITE_H, SCREEN_BG);
    tft.setTextSize(1);
    tft.setTextColor(TEXT_MUTED);
    tft.drawString("sprite alloc failed", PET_SPRITE_X + 70, PET_SPRITE_Y + 52);
  }
  petDirty = false;
}

void renderAll() {
  tft.fillScreen(SCREEN_BG);
  renderUi();
  renderPetFrame();
}

void applyPayload(const String &payload) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    String errorMessage = error.c_str();
    bool changed = pet.state != "error" || pet.event != "bad-json" || pet.message != errorMessage;
    pet.state = "error";
    pet.event = "bad-json";
    pet.message = errorMessage;
    if (changed) markUiDirty();
    return;
  }

  String nextState = String(doc["s"] | "idle");
  String nextAgent = String(doc["a"] | "agent");
  String nextEvent = String(doc["e"] | "");
  String nextMessage = String(doc["m"] | "");
  int nextActiveCount = doc["n"] | 0;
  bool changed = nextState != pet.state || nextAgent != pet.agent || nextEvent != pet.event ||
                 nextMessage != pet.message || nextActiveCount != pet.activeCount;

  pet.state = nextState;
  pet.agent = nextAgent;
  pet.event = nextEvent;
  pet.message = nextMessage;
  pet.activeCount = nextActiveCount;
  pet.receivedAt = millis();
  if (changed) markUiDirty();
}

void restartAdvertising() {
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
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
    incomingPayload = String(value.c_str());
    pendingPayload = true;
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
    pet.agent = "local";
    pet.event = "button-test";
    pet.activeCount = testIndex == 0 ? 0 : 1;
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
  petSprite.setColorDepth(16);
  spriteReady = petSprite.createSprite(PET_SPRITE_W, PET_SPRITE_H) != nullptr;
  setupButtons();
  setupBle();
  pet.receivedAt = millis();
  renderAll();
}

void loop() {
  if (pendingPayload) {
    pendingPayload = false;
    applyPayload(incomingPayload);
    Serial.println(incomingPayload);
  }

  handleButtons();

  if (millis() - lastFrameAt > 450) {
    lastFrameAt = millis();
    frame++;
    petDirty = true;
  }

  if (uiDirty) renderUi();
  if (petDirty) renderPetFrame();
}
