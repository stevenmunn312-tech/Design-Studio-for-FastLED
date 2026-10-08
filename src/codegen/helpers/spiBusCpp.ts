/**
 * The default `SPI` host, started once for every client that shares it.
 *
 * A colour panel, an XPT2046 on the panel's own lines, an SD card, SD Video and
 * (on a one-host C3 or C6) the W5500 all use the core's `SPI` object. On the
 * ESP32 core `SPIClass::begin` returns at once if the bus is already running,
 * so the first caller's pins are the only ones ever routed. Every TFT began the
 * bus with MISO -1, because a write-only panel never reads, and the panel is
 * started first. That left everything behind it deaf: an SD card on the same
 * clock and data lines mounted nothing, and a touch read returned zeros.
 *
 * Every caller now states the lines it needs and the bus starts with them. A
 * reader arriving after a write-only client restarts the host with its MISO
 * added, keeping the clock and data pins the bus was first given: the bus
 * is one set of wires; clients must use the same clock and data pins.
 * Restarting cannot repair inconsistent wiring. Restarting is safe
 * because every caller runs in setup or before its first transfer, never
 * inside another client's transaction.
 *
 * Guarded so that each emitter can carry it. The TFT driver, the screen-design
 * panel, the SD player, SD Video and Ethernet can appear in any combination,
 * and a guard is the one dedupe that needs none of them to know about the
 * others.
 */
export const SPI_BUS_CPP = `#ifndef FLS_SPI_BUS
#define FLS_SPI_BUS
// ── SPI host ─────────────────────────────────────────────────────────────────
// One bus, begun once with every line its clients need. -2 means not begun.
static int8_t _spiBusSck = -2, _spiBusMiso = -2, _spiBusMosi = -2;
static void _spiBusBegin(int8_t sck, int8_t miso, int8_t mosi) {
#if defined(ESP32)
  if (_spiBusSck != -2) {
    // Running already. Only a MISO the bus was begun without changes anything.
    if (miso < 0 || _spiBusMiso >= 0) return;
    SPI.end();
    sck = _spiBusSck;
    mosi = _spiBusMosi;
  }
  SPI.begin(sck, miso, mosi, -1);
#elif defined(ESP8266)
  // Fixed HSPI pins: selecting them once is the whole of the setup.
  if (_spiBusSck != -2) return;
  SPI.pins(sck, MISO, mosi, -1);
  SPI.begin();
#else
  if (_spiBusSck != -2) return;
  SPI.begin();
#endif
  _spiBusSck = sck; _spiBusMiso = miso; _spiBusMosi = mosi;
}
#endif`
