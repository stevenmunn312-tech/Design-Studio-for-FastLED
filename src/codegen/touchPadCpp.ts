import { sanitizePin } from './hardwarePins'
import {
  formatTouchPadAddress, touchPadAddress, touchPadSpec, touchPadThreshold,
} from '../state/touchPad'

/*
 * MPR121 touch reads, straight off the registers over the shared `Wire` bus.
 *
 * No library. Begin soft-resets the chip (0x80 <- 0x63), reads CONFIG2 (0x5D) and
 * accepts it only if it holds the 0x24 reset value, which proves an MPR121 is
 * answering. It then stops the chip (ECR 0x5E <- 0x00), writes the baseline
 * filter, debounce, configuration, auto-configuration limits and the touch and
 * release thresholds for every electrode, and starts it with all twelve electrodes
 * enabled (ECR <- 0x8F). Those values are the ones Adafruit's library ships.
 *
 * One two-byte read from 0x00 holds the touch status: bit n is electrode n.
 *
 * A sensor that does not answer sets `connected` false, reads as untouched, and is
 * retried once a second rather than on every frame. `electrode` is the lowest
 * touched electrode and keeps its last value after release.
 */
export const TOUCH_PAD_HELPER_CPP: readonly string[] = [
  '// MPR121 capacitive touch controller over the shared I2C bus.',
  'static bool _mprWrite(uint8_t addr, uint8_t reg, uint8_t value) {',
  '  Wire.beginTransmission(addr); Wire.write(reg); Wire.write(value);',
  '  return Wire.endTransmission() == 0;',
  '}',
  'static bool _mprBegin(uint8_t addr, uint8_t touch, uint8_t release) {',
  '  if (!_mprWrite(addr, 0x80, 0x63)) return false;',
  '  delay(2);',
  '  Wire.beginTransmission(addr); Wire.write((uint8_t)0x5D);',
  '  if (Wire.endTransmission() != 0 || Wire.requestFrom((int)addr, 1) != 1 || Wire.read() != 0x24) return false;',
  '  static const uint8_t cfg[] = {',
  '    0x2B, 0x01, 0x2C, 0x01, 0x2D, 0x0E, 0x2E, 0x00, 0x2F, 0x01, 0x30, 0x05, 0x31, 0x01, 0x32, 0x00,',
  '    0x33, 0x00, 0x34, 0x00, 0x35, 0x00, 0x5B, 0x00, 0x5C, 0x10, 0x5D, 0x20,',
  '    0x7B, 0x0B, 0x7D, 200, 0x7E, 130, 0x7F, 180};',
  '  bool ok = _mprWrite(addr, 0x5E, 0x00);',
  '  for (uint8_t i = 0; i < sizeof(cfg); i += 2) ok = ok && _mprWrite(addr, cfg[i], cfg[i + 1]);',
  '  for (uint8_t i = 0; i < 12; ++i) ok = ok && _mprWrite(addr, 0x41 + 2 * i, touch) && _mprWrite(addr, 0x42 + 2 * i, release);',
  '  return ok && _mprWrite(addr, 0x5E, 0x8F);',
  '}',
  'static bool _mprRead(uint8_t addr, uint16_t *touched) {',
  '  Wire.beginTransmission(addr); Wire.write((uint8_t)0x00);',
  '  if (Wire.endTransmission() != 0) return false;',
  '  if (Wire.requestFrom((int)addr, 2) != 2) return false;',
  '  uint8_t lo = Wire.read();',
  '  uint8_t hi = Wire.read();',
  '  *touched = (uint16_t)((((uint16_t)hi << 8) | lo) & 0x0FFF);',
  '  return true;',
  '}',
]

export function touchPadAddressCpp(props: Record<string, unknown>): string {
  const spec = touchPadSpec(props.partId)
  return formatTouchPadAddress(touchPadAddress(props) ?? spec.defaultI2cAddress)
}

export function touchPadSetupCpp(props: Record<string, unknown>): string {
  return `  Wire.begin(${sanitizePin(props.sdaPin, 21)}, ${sanitizePin(props.sclPin, 22)});  // MPR121 I2C bus`
}

export function touchPadLoopCpp(
  props: Record<string, unknown>,
  id: string,
  local: (port: 'electrode' | 'touched' | 'count' | 'connected') => string,
): string[] {
  const address = touchPadAddressCpp(props)
  const touch = touchPadThreshold(props, 'touch')
  const release = touchPadThreshold(props, 'release')
  return [
    `  static bool _mprReady_${id} = false, _mprTried_${id} = false; static uint32_t _mprT_${id} = 0;`,
    `  static uint16_t _mprBits_${id} = 0; static float _mprLast_${id} = 0.0f;`,
    `  if (!_mprReady_${id} && (!_mprTried_${id} || millis() - _mprT_${id} >= 1000)) {`,
    `    _mprTried_${id} = true; _mprT_${id} = millis();`,
    `    _mprReady_${id} = _mprBegin(${address}, ${touch}, ${release});`,
    '  }',
    `  if (_mprReady_${id} && !_mprRead(${address}, &_mprBits_${id})) _mprReady_${id} = false;`,
    `  if (!_mprReady_${id}) _mprBits_${id} = 0;`,
    `  uint8_t _mprN_${id} = 0; int8_t _mprFirst_${id} = -1;`,
    `  for (uint8_t i = 0; i < 12; ++i) if (_mprBits_${id} & (1u << i)) { if (_mprFirst_${id} < 0) _mprFirst_${id} = (int8_t)i; ++_mprN_${id}; }`,
    `  if (_mprFirst_${id} >= 0) _mprLast_${id} = (float)_mprFirst_${id};`,
    `  float ${local('electrode')} = _mprLast_${id};`,
    `  bool ${local('touched')} = _mprN_${id} > 0;`,
    `  float ${local('count')} = (float)_mprN_${id};`,
    `  bool ${local('connected')} = _mprReady_${id};`,
  ]
}
