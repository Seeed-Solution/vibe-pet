#include "Indicator_Extender.h"

PCA9555 ioex;
static bool extenderInitDone = false;

void extender_init(void) {
  if (extenderInitDone) return;

  Wire.begin(EXTENDER_SDA, EXTENDER_SCL, EXTENDER_SPEED);
  ioex.attach(Wire);
  ioex.polarity(PCA95x5::Polarity::ORIGINAL_ALL);

  ioex.write(EXPANDER_IO_LCD_RESET, PCA95x5::Level::L);
  ioex.direction(EXPANDER_IO_LCD_RESET, PCA95x5::Direction::OUT);
  ioex.direction(EXPANDER_IO_LCD_INT, PCA95x5::Direction::IN);

  ioex.write(EXPANDER_IO_TP_RESET, PCA95x5::Level::L);
  ioex.direction(EXPANDER_IO_TP_RESET, PCA95x5::Direction::OUT);

  ioex.direction(EXPANDER_IO_RP2040_RESET, PCA95x5::Direction::OUT);
  ioex.write(EXPANDER_IO_RP2040_RESET, PCA95x5::Level::H);

  ioex.direction(EXPANDER_IO_BMP_PWR, PCA95x5::Direction::OUT);
  ioex.write(EXPANDER_IO_BMP_PWR, PCA95x5::Level::H);

  ioex.write(EXPANDER_IO_RADIO_NSS, PCA95x5::Level::H);
  ioex.direction(EXPANDER_IO_RADIO_NSS, PCA95x5::Direction::OUT);
  ioex.direction(EXPANDER_IO_RADIO_RST, PCA95x5::Direction::OUT);
  ioex.direction(EXPANDER_IO_RADIO_BUSY, PCA95x5::Direction::IN);
  ioex.direction(EXPANDER_IO_RADIO_DIO_1, PCA95x5::Direction::IN);

  delay(5);
  ioex.write(EXPANDER_IO_LCD_RESET, PCA95x5::Level::H);
  ioex.write(EXPANDER_IO_TP_RESET, PCA95x5::Level::H);
  delay(5);

  extenderInitDone = true;
}

