// SenseCAP Indicator hardware shell; shared behavior lives in esp-display-code-pet.

#if defined(CODE_PET_HAS_BLE)
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#endif

#if defined(CODE_PET_USE_LVGL)
#include <FS.h>
#include <SPIFFS.h>
#include <lvgl.h>
#include "persona_assets.h"
#endif

#include "../../esp-display-code-pet/src/main.cpp"
