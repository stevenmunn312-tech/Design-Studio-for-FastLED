import {
  formatLightSensorAddress,
  lightSensorAddress,
  lightSensorMaxLux,
  lightSensorTransport,
  BH1750_DEFAULT_ADDRESS,
} from '../state/lightSensor'
import { sanitizePin } from './hardwarePins'

/**
 * BH1750 support uses the chip's small command protocol directly. Continuous
 * high-resolution mode produces a fresh 16-bit sample in at most 180 ms and
 * the datasheet's 1.2 divisor converts that sample to lux.
 */
export const LIGHT_SENSOR_HELPER_CPP: readonly string[] = [
  '// BH1750 ambient light sensor: continuous high-resolution readings over I2C.',
  'static void _bh1750Begin(uint8_t addr) {',
  '  Wire.beginTransmission(addr); Wire.write((uint8_t)0x01); Wire.endTransmission();  // power on',
  '  Wire.beginTransmission(addr); Wire.write((uint8_t)0x10); Wire.endTransmission();  // continuous high resolution',
  '}',
  'static bool _bh1750Read(uint8_t addr, float &lux) {',
  '  if (Wire.requestFrom((int)addr, 2) != 2) { lux = 0.0f; return false; }',
  '  uint16_t raw = ((uint16_t)Wire.read() << 8) | (uint16_t)Wire.read();',
  '  lux = (float)raw / 1.2f;',
  '  return true;',
  '}',
]

export function lightSensorAddressCpp(props: Record<string, unknown>): string {
  return formatLightSensorAddress(lightSensorAddress(props) ?? BH1750_DEFAULT_ADDRESS)
}

export function lightSensorSetupCpp(props: Record<string, unknown>): string[] {
  if (lightSensorTransport(props.partId) !== 'i2c') return []
  return [`  _bh1750Begin(${lightSensorAddressCpp(props)});`]
}

export function lightSensorLoopCpp(
  props: Record<string, unknown>,
  nodeId: string,
  local: (port: 'level' | 'lux') => string,
): string[] {
  if (lightSensorTransport(props.partId) !== 'i2c') {
    return [
      `  float ${local('level')} = analogRead(${sanitizePin(props.pin, 4)}) / 4095.0f;`,
      `  float ${local('lux')} = 0.0f;`,
    ]
  }
  const address = lightSensorAddressCpp(props)
  const maxLux = lightSensorMaxLux(props.maxLux).toFixed(1)
  const timer = `_bhLast_${nodeId.replace(/[^a-zA-Z0-9_]/g, '_')}`
  return [
    `  static float ${local('lux')} = 0.0f;`,
    `  static uint32_t ${timer} = 0;`,
    `  if (${timer} == 0 || (uint32_t)(millis() - ${timer}) >= 180u) {`,
    `    ${timer} = millis();`,
    `    _bh1750Read(${address}, ${local('lux')});`,
    '  }',
    `  float ${local('level')} = constrain(${local('lux')} / ${maxLux}f, 0.0f, 1.0f);`,
  ]
}
