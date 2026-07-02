#ifndef CODE_PET_INDICATOR_SWSPI_H
#define CODE_PET_INDICATOR_SWSPI_H

#include <Arduino_DataBus.h>

#ifndef GFX_INLINE
#define GFX_INLINE inline
#endif

class Indicator_SWSPI : public Arduino_DataBus {
public:
  Indicator_SWSPI(int8_t dc, int8_t cs, int8_t sck, int8_t mosi, int8_t miso = GFX_NOT_DEFINED);

  bool begin(int32_t speed = GFX_NOT_DEFINED, int8_t dataMode = GFX_NOT_DEFINED) override;
  void beginWrite() override;
  void endWrite() override;
  void writeCommand(uint8_t c) override;
  void writeCommand16(uint16_t c) override;
  void writeCommandBytes(uint8_t *data, uint32_t len) override;
  void write(uint8_t d) override;
  void write16(uint16_t d) override;
  void writeRepeat(uint16_t p, uint32_t len) override;
  void writePixels(uint16_t *data, uint32_t len) override;

#if !defined(LITTLE_FOOT_PRINT)
  void writeBytes(uint8_t *data, uint32_t len) override;
#endif

private:
  GFX_INLINE void write9BitCommand(uint8_t c);
  GFX_INLINE void write9BitData(uint8_t d);
  GFX_INLINE void write8(uint8_t d);
  GFX_INLINE void write16Raw(uint16_t d);
  GFX_INLINE void write9BitRepeat(uint16_t p, uint32_t len);
  GFX_INLINE void writeRepeatRaw(uint16_t p, uint32_t len);
  GFX_INLINE void dcHigh(void);
  GFX_INLINE void dcLow(void);
  GFX_INLINE void csHigh(void);
  GFX_INLINE void csLow(void);
  GFX_INLINE void mosiHigh(void);
  GFX_INLINE void mosiLow(void);
  GFX_INLINE void sckHigh(void);
  GFX_INLINE void sckLow(void);

  int8_t _dc;
  int8_t _cs;
  int8_t _sck;
  int8_t _mosi;
  int8_t _miso;
};

#endif
