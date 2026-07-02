// Shared display firmware implementation; board-specific flags live in platformio.ini.

#if defined(CODE_PET_HAS_RPC_BLE)
#include <rpcBLEDevice.h>
#include <BLEServer.h>
#endif

#include "../../esp-display-code-pet/src/main.cpp"
