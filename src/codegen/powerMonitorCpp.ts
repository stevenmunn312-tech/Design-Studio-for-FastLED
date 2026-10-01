import { formatI2cAddress, powerMonitorAddress, powerMonitorLimitAmps, powerMonitorSpec } from '../state/powerMonitor'

/*
 * INA219 reads, straight off the registers over the shared `Wire` bus.
 *
 * No library: the two registers needed are read-only and need no calibration.
 * Bus voltage (0x02) is the voltage at Vin- against GND, 4 mV per bit in bits
 * 15..3. Shunt voltage (0x01) is signed, 10 uV per bit; amps are that divided by
 * the fitted shunt, which comes from the catalogue rather than from the
 * calibration register, so nothing here has to agree with a second copy of the
 * shunt value. The chip powers up continuously converting both at 12 bits over
 * a +/-320 mV shunt range, which covers the fitted shunt's full +/-3.2 A; setup
 * rewrites that configuration anyway so a board that was reconfigured by other
 * firmware reads the same way.
 *
 * A monitor that does not answer reads 0 on every output rather than holding a
 * stale value: a measurement nobody made must not look like a real one.
 */
export const POWER_MONITOR_HELPER_CPP: readonly string[] = [
  '// INA219 power monitor: bus and shunt voltage over the shared I2C bus.',
  'static bool _ina219Read(uint8_t addr, uint8_t reg, int16_t &value) {',
  '  Wire.beginTransmission(addr);',
  '  Wire.write(reg);',
  '  if (Wire.endTransmission() != 0) return false;',
  '  if (Wire.requestFrom((int)addr, 2) != 2) return false;',
  '  uint8_t hi = Wire.read();',
  '  uint8_t lo = Wire.read();',
  '  value = (int16_t)((hi << 8) | lo);',
  '  return true;',
  '}',
  'static void _ina219Begin(uint8_t addr) {',
  '  // 32 V bus range, /8 PGA (+/-320 mV shunt), 12-bit, shunt and bus continuous.',
  '  Wire.beginTransmission(addr);',
  '  Wire.write((uint8_t)0x00);',
  '  Wire.write((uint8_t)0x39);',
  '  Wire.write((uint8_t)0x9F);',
  '  Wire.endTransmission();',
  '}',
  'static void _ina219Measure(uint8_t addr, float shuntOhms, float &volts, float &amps) {',
  '  int16_t bus = 0, shunt = 0;',
  '  if (!_ina219Read(addr, 0x02, bus) || !_ina219Read(addr, 0x01, shunt)) {',
  '    volts = 0.0f;',
  '    amps = 0.0f;',
  '    return;',
  '  }',
  '  volts = (float)(((uint16_t)bus) >> 3) * 0.004f;',
  '  amps = ((float)shunt * 0.00001f) / shuntOhms;',
  '}',
]

/*
 * INA226 reads, the same two read-only registers as the INA219 with different
 * scales: bus voltage (0x02) is unsigned at 1.25 mV per bit, shunt voltage (0x01)
 * is signed at 2.5 uV per bit, and amps are that divided by the fitted shunt from
 * the catalogue, so the calibration register is never needed. Setup writes the
 * power-up configuration (0x4127: no averaging, 1.1 ms conversions, shunt and bus
 * continuous) so a board reconfigured by other firmware reads the same way. The
 * shunt range is +/-81.92 mV, which a 2 milliohm shunt turns into +/-40 A, so the
 * module's quoted 20 A is well inside it.
 */
export const POWER_MONITOR_INA226_HELPER_CPP: readonly string[] = [
  '// INA226 power monitor: bus and shunt voltage over the shared I2C bus.',
  'static bool _ina226Read(uint8_t addr, uint8_t reg, int16_t &value) {',
  '  Wire.beginTransmission(addr);',
  '  Wire.write(reg);',
  '  if (Wire.endTransmission() != 0) return false;',
  '  if (Wire.requestFrom((int)addr, 2) != 2) return false;',
  '  uint8_t hi = Wire.read();',
  '  uint8_t lo = Wire.read();',
  '  value = (int16_t)((hi << 8) | lo);',
  '  return true;',
  '}',
  'static void _ina226Begin(uint8_t addr) {',
  '  // Continuous shunt and bus conversion, no averaging (the power-up value).',
  '  Wire.beginTransmission(addr);',
  '  Wire.write((uint8_t)0x00);',
  '  Wire.write((uint8_t)0x41);',
  '  Wire.write((uint8_t)0x27);',
  '  Wire.endTransmission();',
  '}',
  'static void _ina226Measure(uint8_t addr, float shuntOhms, float &volts, float &amps) {',
  '  int16_t bus = 0, shunt = 0;',
  '  if (!_ina226Read(addr, 0x02, bus) || !_ina226Read(addr, 0x01, shunt)) {',
  '    volts = 0.0f;',
  '    amps = 0.0f;',
  '    return;',
  '  }',
  '  volts = (float)((uint16_t)bus) * 0.00125f;',
  '  amps = ((float)shunt * 0.0000025f) / shuntOhms;',
  '}',
]

/** True when this node's part is an INA226 rather than the INA219. */
export function powerMonitorIsIna226(props: Record<string, unknown>): boolean {
  return powerMonitorSpec(props.partId).device === 'INA226'
}

/** The helper for each device that appears, each once however many monitors use it. */
export function powerMonitorHelperCpp(monitors: readonly Record<string, unknown>[]): string[] {
  return [
    ...(monitors.some((props) => !powerMonitorIsIna226(props)) ? POWER_MONITOR_HELPER_CPP : []),
    ...(monitors.some(powerMonitorIsIna226) ? POWER_MONITOR_INA226_HELPER_CPP : []),
  ]
}

/** The address the generated sketch talks to, as a C literal. */
export function powerMonitorAddressCpp(props: Record<string, unknown>): string {
  const spec = powerMonitorSpec(props.partId)
  return formatI2cAddress(powerMonitorAddress(props) ?? spec.defaultI2cAddress)
}

export function powerMonitorSetupCpp(props: Record<string, unknown>): string {
  return `  ${powerMonitorIsIna226(props) ? '_ina226Begin' : '_ina219Begin'}(${powerMonitorAddressCpp(props)});`
}

/**
 * One node's reading, as three locals named by `local(port)`. Watts is derived
 * here, exactly as the preview derives it.
 */
export function powerMonitorLoopCpp(
  props: Record<string, unknown>,
  local: (port: 'volts' | 'amps' | 'watts' | 'overcurrent') => string,
): string[] {
  const ohms = powerMonitorSpec(props.partId).shuntOhms
  return [
    `  float ${local('volts')} = 0.0f, ${local('amps')} = 0.0f;`,
    `  ${powerMonitorIsIna226(props) ? '_ina226Measure' : '_ina219Measure'}(${powerMonitorAddressCpp(props)}, ${ohms.toFixed(4)}f, ${local('volts')}, ${local('amps')});`,
    `  float ${local('watts')} = ${local('volts')} * ${local('amps')};`,
    `  bool ${local('overcurrent')} = ${local('amps')} > ${powerMonitorLimitAmps(props.overcurrentAmps).toFixed(3)}f;`,
  ]
}
