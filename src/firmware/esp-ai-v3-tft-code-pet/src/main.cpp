// Shared display firmware implementation; board-specific flags live in platformio.ini.

#if defined(CODE_PET_HAS_BLE)
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#endif

#include "../../esp-display-code-pet/src/main.cpp"
