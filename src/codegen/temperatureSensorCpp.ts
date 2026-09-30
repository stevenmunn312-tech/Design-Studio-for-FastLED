import { sanitizePin } from './hardwarePins'

/**
 * DS18B20 over a bit-banged 1-Wire bus. A probe needs no library: reset,
 * skip-ROM, convert, then read the nine-byte scratchpad and check its CRC. Only
 * one probe is supported per pin, so the ROM search is never needed.
 *
 * Timing follows the datasheet's standard-speed slots. Each bit runs with
 * interrupts off so Wi-Fi or a timer cannot stretch a slot; the CRC rejects any
 * read a slot error still corrupts.
 */
export const TEMPERATURE_SENSOR_HELPER_CPP: readonly string[] = [
  '// DS18B20 temperature probe on a 1-Wire pin with an external 4.7 kohm pull-up.',
  'static bool _ds18Reset(uint8_t pin) {',
  '  pinMode(pin, OUTPUT); digitalWrite(pin, LOW); delayMicroseconds(480);',
  '  noInterrupts(); pinMode(pin, INPUT); delayMicroseconds(70);',
  '  bool present = digitalRead(pin) == LOW; interrupts();',
  '  delayMicroseconds(410);',
  '  return present;',
  '}',
  'static void _ds18WriteByte(uint8_t pin, uint8_t value) {',
  '  for (uint8_t bit = 0; bit < 8; ++bit) {',
  '    bool one = value & 1; value >>= 1;',
  '    noInterrupts();',
  '    pinMode(pin, OUTPUT); digitalWrite(pin, LOW); delayMicroseconds(one ? 6 : 60);',
  '    pinMode(pin, INPUT); delayMicroseconds(one ? 64 : 10);',
  '    interrupts();',
  '  }',
  '}',
  'static uint8_t _ds18ReadByte(uint8_t pin) {',
  '  uint8_t value = 0;',
  '  for (uint8_t bit = 0; bit < 8; ++bit) {',
  '    noInterrupts();',
  '    pinMode(pin, OUTPUT); digitalWrite(pin, LOW); delayMicroseconds(3);',
  '    pinMode(pin, INPUT); delayMicroseconds(8);',
  '    if (digitalRead(pin)) value |= (uint8_t)(1 << bit);',
  '    delayMicroseconds(50);',
  '    interrupts();',
  '  }',
  '  return value;',
  '}',
  'static bool _ds18Start(uint8_t pin) {',
  '  if (!_ds18Reset(pin)) return false;',
  '  _ds18WriteByte(pin, 0xCC); _ds18WriteByte(pin, 0x44);  // skip ROM, convert T',
  '  return true;',
  '}',
  'static bool _ds18Read(uint8_t pin, float &celsius) {',
  '  if (!_ds18Reset(pin)) return false;',
  '  _ds18WriteByte(pin, 0xCC); _ds18WriteByte(pin, 0xBE);  // skip ROM, read scratchpad',
  '  uint8_t d[9]; uint8_t crc = 0; bool allOnes = true;',
  '  for (uint8_t i = 0; i < 9; ++i) { d[i] = _ds18ReadByte(pin); if (d[i] != 0xFF) allOnes = false; }',
  '  for (uint8_t i = 0; i < 8; ++i) {',
  '    uint8_t in = d[i];',
  '    for (uint8_t bit = 0; bit < 8; ++bit) { uint8_t mix = (crc ^ in) & 1; crc >>= 1; if (mix) crc ^= 0x8C; in >>= 1; }',
  '  }',
  '  if (allOnes || crc != d[8]) return false;',
  '  celsius = (float)(int16_t)(((uint16_t)d[1] << 8) | d[0]) / 16.0f;',
  '  return true;',
  '}',
]

/**
 * Non-blocking: a conversion takes up to 750 ms, so it is started on one pass
 * and read on the first pass after 800 ms rather than waited for. `connected`
 * is false until a read passes its CRC, and again when one fails; a missing
 * probe is retried once a second so a reset does not cost every frame.
 */
export function temperatureSensorLoopCpp(
  props: Record<string, unknown>,
  id: string,
  local: (port: 'temperature' | 'connected') => string,
): string[] {
  const pin = sanitizePin(props.pin, 4)
  return [
    `  static bool _ds18Pending_${id} = false, _ds18Ok_${id} = false;`,
    `  static float _ds18C_${id} = 0.0f; static uint32_t _ds18T_${id} = 0;`,
    '  {',
    '    uint32_t _ds18Now = millis();',
    `    if (_ds18Pending_${id}) {`,
    `      if (_ds18Now - _ds18T_${id} >= 800) {`,
    `        float _ds18Value = 0.0f; _ds18Ok_${id} = _ds18Read(${pin}, _ds18Value);`,
    `        if (_ds18Ok_${id}) _ds18C_${id} = _ds18Value;`,
    `        _ds18Pending_${id} = false;`,
    '      }',
    `    } else if (_ds18Ok_${id} || _ds18Now - _ds18T_${id} >= 1000) {`,
    `      _ds18Pending_${id} = _ds18Start(${pin}); _ds18T_${id} = _ds18Now;`,
    `      if (!_ds18Pending_${id}) _ds18Ok_${id} = false;`,
    '    }',
    '  }',
    `  float ${local('temperature')} = _ds18C_${id};`,
    `  bool ${local('connected')} = _ds18Ok_${id};`,
  ]
}
