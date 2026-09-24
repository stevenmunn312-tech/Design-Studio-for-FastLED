import { presenceSensorSpec, PRESENCE_UART_PORT } from '../state/presenceSensor'

/*
 * LD2410-family radar frames, read straight off the UART.
 *
 * No library: the module streams a report frame about ten times a second with
 * no setup, and reading it is a small state machine. A frame is
 *
 *   F4 F3 F2 F1 | length (2, little-endian) | type (0x02 basic, 0x01 engineering)
 *   | 0xAA | state | moving cm (2) | moving energy | still cm (2) | still energy
 *   | detection cm (2) | [engineering gates] | 0x55 0x00 | F8 F7 F6 F5
 *
 * so it is `length + 10` bytes long, and the state and detection distance sit
 * at fixed offsets in both types. State bit 0 is a moving target, bit 1 a still
 * one. All four header bytes are matched before a frame is committed to: a lone
 * 0xF4 is also the low byte of a 244 cm distance, and a reader that syncs on it
 * loses frames whenever someone stands there.
 *
 * One sensor per sketch, on `Serial1` (UART1), so the reader's state is plain
 * statics and its functions take no arguments — a generated function taking a
 * struct by reference meets the `.ino` prototype hoist. Validation refuses a
 * second sensor, and a DMX512 input left on the same UART.
 *
 * A sensor that stops talking reads as nobody there after a second, rather than
 * holding its last report: a presence nobody measured must not look real.
 */
export const PRESENCE_SENSOR_HELPER_CPP: readonly string[] = [
  '// LD2410 radar presence sensor: report frames over UART1.',
  'static uint8_t _ldFrame[64];',
  'static uint8_t _ldPos = 0;',
  'static uint16_t _ldLen = 0;',
  'static uint8_t _ldState = 0;',
  'static uint16_t _ldDistanceCm = 0;',
  'static uint32_t _ldLastFrameMs = 0;',
  'static const uint8_t _LD_HEAD[4] = {0xF4, 0xF3, 0xF2, 0xF1};',
  'static const uint8_t _LD_FOOT[4] = {0xF8, 0xF7, 0xF6, 0xF5};',
  'static void _ldAccept() {',
  '  if (_ldFrame[6] != 0x01 && _ldFrame[6] != 0x02) return;',
  '  if (_ldFrame[7] != 0xAA || _ldFrame[_ldLen + 4] != 0x55 || _ldFrame[_ldLen + 5] != 0x00) return;',
  '  _ldState = _ldFrame[8] & 0x03;',
  '  _ldDistanceCm = (uint16_t)_ldFrame[15] | ((uint16_t)_ldFrame[16] << 8);',
  '  _ldLastFrameMs = millis();',
  '}',
  'static void _ldPoll() {',
  '#if defined(ESP32)',
  `  while (Serial${PRESENCE_UART_PORT}.available() > 0) {`,
  `    uint8_t b = (uint8_t)Serial${PRESENCE_UART_PORT}.read();`,
  '    if (_ldPos < 4) {',
  '      if (b == _LD_HEAD[_ldPos]) {',
  '        _ldFrame[_ldPos++] = b;',
  '      } else {',
  '        _ldPos = (b == _LD_HEAD[0]) ? 1 : 0;',
  '        _ldFrame[0] = b;',
  '      }',
  '      continue;',
  '    }',
  '    _ldFrame[_ldPos++] = b;',
  '    if (_ldPos == 6) {',
  '      _ldLen = (uint16_t)_ldFrame[4] | ((uint16_t)_ldFrame[5] << 8);',
  '      if (_ldLen < 13 || _ldLen + 10 > sizeof(_ldFrame)) { _ldPos = 0; continue; }',
  '    }',
  '    if (_ldPos > 6 && _ldPos == _ldLen + 10) {',
  '      bool footer = true;',
  '      for (uint8_t i = 0; i < 4; i++) if (_ldFrame[_ldLen + 6 + i] != _LD_FOOT[i]) footer = false;',
  '      if (footer) _ldAccept();',
  '      _ldPos = 0;',
  '    }',
  '  }',
  '#endif',
  '}',
]

/** Opens the UART on the sensor's TX line; the sketch never talks back. */
export function presenceSensorSetupCpp(props: Record<string, unknown>, rxPin: number): string[] {
  const baud = presenceSensorSpec(props.partId).baud
  return [
    '#if defined(ESP32)',
    `  Serial${PRESENCE_UART_PORT}.setRxBufferSize(512);`,
    `  Serial${PRESENCE_UART_PORT}.begin(${baud}, SERIAL_8N1, ${rxPin}, -1);`,
    '#endif',
  ]
}

/** One node's readings, as four locals named by `local(port)`. */
export function presenceSensorLoopCpp(
  local: (port: 'presence' | 'moving' | 'still' | 'distance') => string,
): string[] {
  return [
    '  _ldPoll();',
    `  uint8_t ${local('presence')}_state = (_ldLastFrameMs != 0 && millis() - _ldLastFrameMs < 1000u) ? _ldState : 0;`,
    `  bool ${local('presence')} = ${local('presence')}_state != 0;`,
    `  bool ${local('moving')} = (${local('presence')}_state & 0x01) != 0;`,
    `  bool ${local('still')} = (${local('presence')}_state & 0x02) != 0;`,
    `  float ${local('distance')} = ${local('presence')} ? _ldDistanceCm / 100.0f : 0.0f;`,
  ]
}
