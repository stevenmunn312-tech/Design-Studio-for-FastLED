/*
 * PCA9685 writes, straight to the registers over the shared `Wire` bus.
 *
 * No library. Begin puts the chip to sleep, writes the prescale, selects the
 * totem-pole output stage (MODE2 OUTDRV), wakes it with register auto-increment
 * on, waits for the oscillator (skipped when the chip does not answer, so an absent
 * board costs no delay), and restarts it (MODE1 RESTART). Every output
 * is explicitly set fully off before sleep, so a controller-only reboot or a
 * new graph cannot resume the chip's retained duty on an unwired channel.
 *
 * A channel is four bytes from LED0_ON_L + 4 * channel: ON and OFF counts out of
 * 4096. A level of zero sets the full-off bit and a full level sets the full-on
 * bit, which is how the chip reaches a true 0% and 100% rather than a 1/4096
 * glitch; anything between is ON = 0 and OFF = the count.
 *
 * The prescale is computed here from the part's 25 MHz nominal oscillator and the
 * node's frequency; the chip's real clock is only good to a few percent.
 */
export const PWM_DRIVER_HELPER_CPP: readonly string[] = [
  '// PCA9685 PWM driver over the shared I2C bus.',
  'static bool _pcaWrite(uint8_t addr, uint8_t reg, uint8_t value) {',
  '  Wire.beginTransmission(addr); Wire.write(reg); Wire.write(value);',
  '  return Wire.endTransmission() == 0;',
  '}',
  'static bool _pcaBegin(uint8_t addr, uint8_t prescale) {',
  '  // ALL_LED_OFF_H fills every channel\'s OFF register, including retained PWM.',
  '  bool ok = _pcaWrite(addr, 0xFD, 0x10);',
  '  ok = ok && _pcaWrite(addr, 0x00, 0x10);',
  '  ok = ok && _pcaWrite(addr, 0xFE, prescale);',
  '  ok = ok && _pcaWrite(addr, 0x01, 0x04);',
  '  ok = ok && _pcaWrite(addr, 0x00, 0x20);',
  '  if (!ok) return false;',
  '  delay(5);',
  '  return ok && _pcaWrite(addr, 0x00, 0xA0);',
  '}',
  'static bool _pcaSet(uint8_t addr, uint8_t channel, uint16_t duty) {',
  '  uint16_t on = 0, off = duty;',
  '  if (duty >= 4095) { on = 0x1000; off = 0; }',
  '  else if (duty == 0) { off = 0x1000; }',
  '  Wire.beginTransmission(addr);',
  '  Wire.write((uint8_t)(0x06 + 4 * channel));',
  '  Wire.write((uint8_t)(on & 0xFF)); Wire.write((uint8_t)(on >> 8));',
  '  Wire.write((uint8_t)(off & 0xFF)); Wire.write((uint8_t)(off >> 8));',
  '  return Wire.endTransmission() == 0;',
  '}',
]
