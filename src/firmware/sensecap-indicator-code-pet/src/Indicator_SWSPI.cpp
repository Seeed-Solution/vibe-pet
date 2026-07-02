#include "Indicator_SWSPI.h"
#include "Indicator_Extender.h"

Indicator_SWSPI::Indicator_SWSPI(int8_t dc, int8_t cs, int8_t sck, int8_t mosi, int8_t miso)
    : _dc(dc), _cs(cs), _sck(sck), _mosi(mosi), _miso(miso) {}

bool Indicator_SWSPI::begin(int32_t, int8_t) {
  extender_init();

  if (_cs != GFX_NOT_DEFINED) {
    ioex.write(static_cast<PCA95x5::Port::Port>(_cs), PCA95x5::Level::L);
    ioex.direction(static_cast<PCA95x5::Port::Port>(_cs), PCA95x5::Direction::OUT);
  }
  if (_dc != GFX_NOT_DEFINED) {
    pinMode(_dc, OUTPUT);
    digitalWrite(_dc, HIGH);
  }
  if (_cs != GFX_NOT_DEFINED) ioex.write(static_cast<PCA95x5::Port::Port>(_cs), PCA95x5::Level::H);

  pinMode(_sck, OUTPUT);
  digitalWrite(_sck, LOW);
  pinMode(_mosi, OUTPUT);
  digitalWrite(_mosi, LOW);
  if (_miso != GFX_NOT_DEFINED) pinMode(_miso, INPUT);
  return true;
}

void Indicator_SWSPI::beginWrite() {
  if (_dc != GFX_NOT_DEFINED) dcHigh();
  csLow();
}

void Indicator_SWSPI::endWrite() {
  csHigh();
}

void Indicator_SWSPI::writeCommand(uint8_t c) {
  if (_dc == GFX_NOT_DEFINED) {
    write9BitCommand(c);
  } else {
    dcLow();
    write8(c);
    dcHigh();
  }
}

void Indicator_SWSPI::writeCommand16(uint16_t c) {
  if (_dc == GFX_NOT_DEFINED) {
    _data16.value = c;
    write9BitCommand(_data16.msb);
    write9BitCommand(_data16.lsb);
  } else {
    dcLow();
    write16Raw(c);
    dcHigh();
  }
}

void Indicator_SWSPI::writeCommandBytes(uint8_t *data, uint32_t len) {
  if (_dc == GFX_NOT_DEFINED) {
    while (len--) write9BitCommand(*data++);
  } else {
    dcLow();
    while (len--) write8(*data++);
    dcHigh();
  }
}

void Indicator_SWSPI::write(uint8_t d) {
  if (_dc == GFX_NOT_DEFINED) write9BitData(d);
  else write8(d);
}

void Indicator_SWSPI::write16(uint16_t d) {
  if (_dc == GFX_NOT_DEFINED) {
    _data16.value = d;
    write9BitData(_data16.msb);
    write9BitData(_data16.lsb);
  } else {
    write16Raw(d);
  }
}

void Indicator_SWSPI::writeRepeat(uint16_t p, uint32_t len) {
  if (_dc == GFX_NOT_DEFINED) write9BitRepeat(p, len);
  else writeRepeatRaw(p, len);
}

void Indicator_SWSPI::writePixels(uint16_t *data, uint32_t len) {
  while (len--) write16Raw(*data++);
}

#if !defined(LITTLE_FOOT_PRINT)
void Indicator_SWSPI::writeBytes(uint8_t *data, uint32_t len) {
  while (len--) write8(*data++);
}
#endif

GFX_INLINE void Indicator_SWSPI::write9BitCommand(uint8_t c) {
  mosiLow();
  sckHigh();
  sckLow();
  for (uint8_t bit = 0x80; bit; bit >>= 1) {
    if (c & bit) mosiHigh();
    else mosiLow();
    sckHigh();
    sckLow();
  }
}

GFX_INLINE void Indicator_SWSPI::write9BitData(uint8_t d) {
  mosiHigh();
  sckHigh();
  sckLow();
  for (uint8_t bit = 0x80; bit; bit >>= 1) {
    if (d & bit) mosiHigh();
    else mosiLow();
    sckHigh();
    sckLow();
  }
}

GFX_INLINE void Indicator_SWSPI::write8(uint8_t d) {
  for (uint8_t bit = 0x80; bit; bit >>= 1) {
    if (d & bit) mosiHigh();
    else mosiLow();
    sckHigh();
    sckLow();
  }
}

GFX_INLINE void Indicator_SWSPI::write16Raw(uint16_t d) {
  for (uint16_t bit = 0x8000; bit; bit >>= 1) {
    if (d & bit) mosiHigh();
    else mosiLow();
    sckHigh();
    sckLow();
  }
}

GFX_INLINE void Indicator_SWSPI::write9BitRepeat(uint16_t p, uint32_t len) {
  if (p == 0xffff) {
    mosiHigh();
    len *= 18;
    while (len--) {
      sckHigh();
      sckLow();
    }
    return;
  }
  _data16.value = p;
  while (len--) {
    write9BitData(_data16.msb);
    write9BitData(_data16.lsb);
  }
}

GFX_INLINE void Indicator_SWSPI::writeRepeatRaw(uint16_t p, uint32_t len) {
  if (p == 0x0000 || p == 0xffff) {
    if (p) mosiHigh();
    else mosiLow();
    len *= 16;
    while (len--) {
      sckHigh();
      sckLow();
    }
    return;
  }
  while (len--) write16Raw(p);
}

GFX_INLINE void Indicator_SWSPI::dcHigh(void) { digitalWrite(_dc, HIGH); }
GFX_INLINE void Indicator_SWSPI::dcLow(void) { digitalWrite(_dc, LOW); }

GFX_INLINE void Indicator_SWSPI::csHigh(void) {
  if (_cs != GFX_NOT_DEFINED) ioex.write(static_cast<PCA95x5::Port::Port>(_cs), PCA95x5::Level::H);
}

GFX_INLINE void Indicator_SWSPI::csLow(void) {
  if (_cs != GFX_NOT_DEFINED) ioex.write(static_cast<PCA95x5::Port::Port>(_cs), PCA95x5::Level::L);
}

GFX_INLINE void Indicator_SWSPI::mosiHigh(void) { digitalWrite(_mosi, HIGH); }
GFX_INLINE void Indicator_SWSPI::mosiLow(void) { digitalWrite(_mosi, LOW); }
GFX_INLINE void Indicator_SWSPI::sckHigh(void) { digitalWrite(_sck, HIGH); }
GFX_INLINE void Indicator_SWSPI::sckLow(void) { digitalWrite(_sck, LOW); }

