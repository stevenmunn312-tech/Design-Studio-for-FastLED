import { environmentAddress, environmentSensorSpec, formatEnvironmentAddress } from '../../state/peripherals/environmentSensor'

/**
 * Ahead of the hoisted prototypes. The .ino preprocessor inserts a prototype
 * for `_bmeBegin` and `_bmeMeasure` above this struct, so the type has to be
 * named before any function or those prototypes fail to compile.
 */
export const ENVIRONMENT_SENSOR_CPP_FORWARD = 'struct _Bme280Calibration;'

/**
 * BME280 register reads and Bosch's floating-point compensation formulas.
 * Keeping this small driver in the generated sketch avoids adding three
 * transitive Arduino libraries for one I2C part.
 */
export const ENVIRONMENT_SENSOR_HELPER_CPP: readonly string[] = [
  '// BME280 temperature, humidity and pressure over the shared I2C bus.',
  'struct _Bme280Calibration {',
  '  uint16_t t1, p1; int16_t t2, t3, p2, p3, p4, p5, p6, p7, p8, p9;',
  '  uint8_t h1, h3; int16_t h2, h4, h5; int8_t h6; float tFine;',
  '};',
  'static bool _bmeReadBytes(uint8_t addr, uint8_t reg, uint8_t *out, uint8_t count) {',
  '  Wire.beginTransmission(addr); Wire.write(reg);',
  '  if (Wire.endTransmission() != 0) return false;',
  '  if (Wire.requestFrom((int)addr, (int)count) != count) return false;',
  '  for (uint8_t i = 0; i < count; ++i) out[i] = Wire.read();',
  '  return true;',
  '}',
  'static bool _bmeRead8(uint8_t addr, uint8_t reg, uint8_t &value) { return _bmeReadBytes(addr, reg, &value, 1); }',
  'static bool _bmeRead16LE(uint8_t addr, uint8_t reg, uint16_t &value) {',
  '  uint8_t b[2]; if (!_bmeReadBytes(addr, reg, b, 2)) return false;',
  '  value = (uint16_t)b[0] | ((uint16_t)b[1] << 8); return true;',
  '}',
  'static bool _bmeWrite8(uint8_t addr, uint8_t reg, uint8_t value) {',
  '  Wire.beginTransmission(addr); Wire.write(reg); Wire.write(value); return Wire.endTransmission() == 0;',
  '}',
  'static bool _bmeBegin(uint8_t addr, _Bme280Calibration &c) {',
  '  uint8_t chip = 0; if (!_bmeRead8(addr, 0xD0, chip) || chip != 0x60) return false;',
  '  uint16_t u = 0;',
  '  if (!_bmeRead16LE(addr, 0x88, c.t1) || !_bmeRead16LE(addr, 0x8A, u)) return false; c.t2 = (int16_t)u;',
  '  if (!_bmeRead16LE(addr, 0x8C, u)) return false; c.t3 = (int16_t)u;',
  '  if (!_bmeRead16LE(addr, 0x8E, c.p1)) return false;',
  '  int16_t *p[] = { &c.p2, &c.p3, &c.p4, &c.p5, &c.p6, &c.p7, &c.p8, &c.p9 };',
  '  for (uint8_t i = 0; i < 8; ++i) { if (!_bmeRead16LE(addr, 0x90 + i * 2, u)) return false; *p[i] = (int16_t)u; }',
  '  if (!_bmeRead8(addr, 0xA1, c.h1) || !_bmeRead16LE(addr, 0xE1, u)) return false; c.h2 = (int16_t)u;',
  '  uint8_t e4 = 0, e5 = 0, e6 = 0, h6 = 0;',
  '  if (!_bmeRead8(addr, 0xE3, c.h3) || !_bmeRead8(addr, 0xE4, e4) || !_bmeRead8(addr, 0xE5, e5) || !_bmeRead8(addr, 0xE6, e6) || !_bmeRead8(addr, 0xE7, h6)) return false;',
  '  c.h4 = (int16_t)(((int16_t)e4 << 4) | (e5 & 0x0F)); if (c.h4 & 0x0800) c.h4 |= (int16_t)0xF000;',
  '  c.h5 = (int16_t)(((int16_t)e6 << 4) | (e5 >> 4)); if (c.h5 & 0x0800) c.h5 |= (int16_t)0xF000;',
  '  c.h6 = (int8_t)h6;',
  '  // Humidity x1, temperature x1, pressure x1, normal mode; one-second standby.',
  '  return _bmeWrite8(addr, 0xF2, 0x01) && _bmeWrite8(addr, 0xF5, 0xA0) && _bmeWrite8(addr, 0xF4, 0x27);',
  '}',
  'static bool _bmeMeasure(uint8_t addr, _Bme280Calibration &c, float &temperature, float &humidity, float &pressureHpa) {',
  '  uint8_t b[8]; if (!_bmeReadBytes(addr, 0xF7, b, 8)) return false;',
  '  int32_t rawP = ((int32_t)b[0] << 12) | ((int32_t)b[1] << 4) | (b[2] >> 4);',
  '  int32_t rawT = ((int32_t)b[3] << 12) | ((int32_t)b[4] << 4) | (b[5] >> 4);',
  '  int32_t rawH = ((int32_t)b[6] << 8) | b[7];',
  '  if (rawT == 0x80000 || rawP == 0x80000 || rawH == 0x8000) return false;',
  '  float v1 = ((float)rawT / 16384.0f - (float)c.t1 / 1024.0f) * (float)c.t2;',
  '  float v2 = ((float)rawT / 131072.0f - (float)c.t1 / 8192.0f);',
  '  v2 = v2 * v2 * (float)c.t3; c.tFine = v1 + v2; temperature = c.tFine / 5120.0f;',
  '  v1 = c.tFine / 2.0f - 64000.0f;',
  '  v2 = v1 * v1 * (float)c.p6 / 32768.0f + v1 * (float)c.p5 * 2.0f;',
  '  v2 = v2 / 4.0f + (float)c.p4 * 65536.0f;',
  '  v1 = ((float)c.p3 * v1 * v1 / 524288.0f + (float)c.p2 * v1) / 524288.0f;',
  '  v1 = (1.0f + v1 / 32768.0f) * (float)c.p1; if (v1 == 0.0f) return false;',
  '  float p = 1048576.0f - (float)rawP; p = (p - v2 / 4096.0f) * 6250.0f / v1;',
  '  v1 = (float)c.p9 * p * p / 2147483648.0f; v2 = p * (float)c.p8 / 32768.0f;',
  '  pressureHpa = (p + (v1 + v2 + (float)c.p7) / 16.0f) / 100.0f;',
  '  float h = c.tFine - 76800.0f;',
  '  h = ((float)rawH - ((float)c.h4 * 64.0f + (float)c.h5 / 16384.0f * h)) *',
  '      ((float)c.h2 / 65536.0f * (1.0f + (float)c.h6 / 67108864.0f * h * (1.0f + (float)c.h3 / 67108864.0f * h)));',
  '  h *= 1.0f - (float)c.h1 * h / 524288.0f; humidity = constrain(h, 0.0f, 100.0f);',
  '  return true;',
  '}',
]

export function environmentAddressCpp(props: Record<string, unknown>): string {
  const spec = environmentSensorSpec(props.partId)
  return formatEnvironmentAddress(environmentAddress(props) ?? spec.defaultI2cAddress)
}

export function environmentSensorLoopCpp(
  props: Record<string, unknown>,
  id: string,
  local: (port: 'temperature' | 'humidity' | 'pressure') => string,
): string[] {
  const address = environmentAddressCpp(props)
  return [
    `  static _Bme280Calibration _bmeCal_${id} = {};`,
    `  static bool _bmeReady_${id} = false;`,
    `  if (!_bmeReady_${id}) _bmeReady_${id} = _bmeBegin(${address}, _bmeCal_${id});`,
    `  float ${local('temperature')} = 0.0f, ${local('humidity')} = 0.0f, ${local('pressure')} = 0.0f;`,
    `  if (_bmeReady_${id} && !_bmeMeasure(${address}, _bmeCal_${id}, ${local('temperature')}, ${local('humidity')}, ${local('pressure')})) _bmeReady_${id} = false;`,
  ]
}
