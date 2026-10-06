import { sanitizePin } from '../hardwarePins'
import {
  formatMotionVectorAddress, motionVectorAccelCode, motionVectorAddress, motionVectorGyroCode, motionVectorSpec,
} from '../../state/peripherals/motionVector'

/*
 * MPU-6050 reads, straight off the registers over the shared `Wire` bus.
 *
 * No library. Setup wakes the chip (PWR_MGMT_1 0x6B: clear SLEEP, take the gyro
 * X PLL as the clock) and writes the full-scale ranges. One 14-byte burst from
 * ACCEL_XOUT_H (0x3B) then holds accel X/Y/Z, temperature and gyro X/Y/Z as
 * big-endian signed 16-bit counts. Counts divide by 32768 / full scale to give g
 * and degrees per second (16384 LSB/g at +/-2 g, 131 LSB/deg/s at +/-250).
 *
 * A sensor that does not answer sets `connected` false and keeps its last good
 * values, and is retried once a second rather than on every frame.
 */
export const MOTION_VECTOR_HELPER_CPP: readonly string[] = [
  '// MPU-6050 accelerometer and gyroscope over the shared I2C bus.',
  'static bool _mpuWrite(uint8_t addr, uint8_t reg, uint8_t value) {',
  '  Wire.beginTransmission(addr); Wire.write(reg); Wire.write(value);',
  '  return Wire.endTransmission() == 0;',
  '}',
  'static bool _mpuBegin(uint8_t addr, uint8_t accelCode, uint8_t gyroCode) {',
  '  return _mpuWrite(addr, 0x6B, 0x01) && _mpuWrite(addr, 0x1C, (uint8_t)(accelCode << 3)) && _mpuWrite(addr, 0x1B, (uint8_t)(gyroCode << 3));',
  '}',
  'static bool _mpuRead(uint8_t addr, float accelLsb, float gyroLsb, float *out) {',
  '  Wire.beginTransmission(addr); Wire.write((uint8_t)0x3B);',
  '  if (Wire.endTransmission() != 0) return false;',
  '  if (Wire.requestFrom((int)addr, 14) != 14) return false;',
  '  uint8_t b[14];',
  '  for (uint8_t i = 0; i < 14; ++i) b[i] = Wire.read();',
  '  for (uint8_t i = 0; i < 3; ++i) out[i] = (float)(int16_t)(((uint16_t)b[i * 2] << 8) | b[i * 2 + 1]) / accelLsb;',
  '  for (uint8_t i = 0; i < 3; ++i) out[3 + i] = (float)(int16_t)(((uint16_t)b[8 + i * 2] << 8) | b[9 + i * 2]) / gyroLsb;',
  '  return true;',
  '}',
]

export function motionVectorAddressCpp(props: Record<string, unknown>): string {
  const spec = motionVectorSpec(props.partId)
  return formatMotionVectorAddress(motionVectorAddress(props) ?? spec.defaultI2cAddress)
}

export function motionVectorSetupCpp(props: Record<string, unknown>): string {
  return `  Wire.begin(${sanitizePin(props.sdaPin, 21)}, ${sanitizePin(props.sclPin, 22)});  // MPU-6050 I2C bus`
}

export function motionVectorLoopCpp(
  props: Record<string, unknown>,
  id: string,
  local: (port: 'accelX' | 'accelY' | 'accelZ' | 'gyroX' | 'gyroY' | 'gyroZ' | 'connected') => string,
): string[] {
  const spec = motionVectorSpec(props.partId)
  const address = motionVectorAddressCpp(props)
  const accelLsb = (32768 / spec.accelRangeG).toFixed(1)
  const gyroLsb = (32768 / spec.gyroRangeDps).toFixed(3)
  return [
    `  static bool _mpuReady_${id} = false, _mpuTried_${id} = false; static uint32_t _mpuT_${id} = 0;`,
    `  static float _mpuV_${id}[6] = {0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f};`,
    `  if (!_mpuReady_${id} && (!_mpuTried_${id} || millis() - _mpuT_${id} >= 1000)) {`,
    `    _mpuTried_${id} = true; _mpuT_${id} = millis();`,
    `    _mpuReady_${id} = _mpuBegin(${address}, ${motionVectorAccelCode(spec.accelRangeG)}, ${motionVectorGyroCode(spec.gyroRangeDps)});`,
    '  }',
    `  if (_mpuReady_${id} && !_mpuRead(${address}, ${accelLsb}f, ${gyroLsb}f, _mpuV_${id})) _mpuReady_${id} = false;`,
    `  float ${local('accelX')} = _mpuV_${id}[0], ${local('accelY')} = _mpuV_${id}[1], ${local('accelZ')} = _mpuV_${id}[2];`,
    `  float ${local('gyroX')} = _mpuV_${id}[3], ${local('gyroY')} = _mpuV_${id}[4], ${local('gyroZ')} = _mpuV_${id}[5];`,
    `  bool ${local('connected')} = _mpuReady_${id};`,
  ]
}
