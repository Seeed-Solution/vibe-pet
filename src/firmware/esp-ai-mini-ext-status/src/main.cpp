#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>

// ESP-AI Mini Ext fixed pins from https://espai.fun/skills/esp-ai-mini-ext-1.0.0.md
#define PIN_WS2812 18
#define PIN_KEY 10
#define PIN_BAT_ADC 8

#define DEVICE_NAME "VibePet-ESP-AI-Mini"
#define SERVICE_UUID "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001"
#define STATE_CHAR_UUID "7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002"

Adafruit_NeoPixel pixel(1, PIN_WS2812, NEO_GRB + NEO_KHZ800);

String currentState = "idle";
String currentAgent = "agent";
String incomingPayload = "";
bool pendingPayload = false;
bool bleConnected = false;
unsigned long lastBlinkAt = 0;
bool blinkOn = true;

uint32_t colorForState(const String &state) {
  if (state == "thinking") return pixel.Color(211, 139, 31);
  if (state == "working" || state == "typing") return pixel.Color(28, 154, 115);
  if (state == "building") return pixel.Color(221, 104, 52);
  if (state == "juggling") return pixel.Color(111, 98, 201);
  if (state == "attention") return pixel.Color(224, 120, 56);
  if (state == "notification" || state == "permission") return pixel.Color(214, 69, 69);
  if (state == "error") return pixel.Color(185, 33, 44);
  if (state == "sweeping") return pixel.Color(30, 132, 152);
  if (state == "sleeping") return pixel.Color(40, 54, 72);
  return pixel.Color(45, 125, 210);
}

float readBatteryVoltage() {
  uint16_t raw = analogRead(PIN_BAT_ADC);
  return raw * 3.3f / 4095.0f * 4.0f;
}

void showPixel() {
  uint32_t color = colorForState(currentState);
  uint8_t brightness = 48;

  if (currentState == "notification" || currentState == "error") {
    brightness = blinkOn ? 96 : 8;
  } else if (currentState == "sleeping") {
    brightness = 10;
  } else if (!bleConnected) {
    brightness = blinkOn ? 24 : 3;
  }

  pixel.setBrightness(brightness);
  pixel.setPixelColor(0, color);
  pixel.show();
}

void applyPayload(const String &payload) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    currentState = "error";
    currentAgent = "bad-json";
  } else {
    currentState = String(doc["s"] | "idle");
    currentAgent = String(doc["a"] | "agent");
  }

  Serial.print("state=");
  Serial.print(currentState);
  Serial.print(" agent=");
  Serial.print(currentAgent);
  Serial.print(" battery=");
  Serial.println(readBatteryVoltage(), 2);
  showPixel();
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
    showPixel();
  }

  void onDisconnect(BLEServer *server) override {
    (void)server;
    bleConnected = false;
    restartAdvertising();
    showPixel();
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
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *stateCharacteristic = service->createCharacteristic(
    STATE_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  stateCharacteristic->setCallbacks(new StateCallbacks());
  service->start();
  restartAdvertising();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_KEY, INPUT);
  analogReadResolution(12);
  pixel.begin();
  pixel.clear();
  pixel.show();
  setupBle();
  showPixel();
}

void loop() {
  if (pendingPayload) {
    pendingPayload = false;
    applyPayload(incomingPayload);
  }

  if (millis() - lastBlinkAt > 500) {
    lastBlinkAt = millis();
    blinkOn = !blinkOn;
    showPixel();
  }

  if (digitalRead(PIN_KEY) == HIGH) {
    Serial.print("battery=");
    Serial.println(readBatteryVoltage(), 2);
    delay(250);
  }
}
