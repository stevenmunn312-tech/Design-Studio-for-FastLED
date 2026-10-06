import { sanitizePin } from './hardwarePins'
import { KEYPAD_COL_KEYS, KEYPAD_ROW_KEYS } from '../state/peripherals/keypad'

/*
 * A 4x4 membrane matrix keypad, scanned column by column.
 *
 * Rows are inputs with the internal pull-up, so an open key reads HIGH. Each
 * column in turn is driven LOW while the others float, and a row that reads LOW
 * is a closed key at that row and column. The index is row * 4 + column, in the
 * order the keys are printed: 1 2 3 A, 4 5 6 B, 7 8 9 C, * 0 # D.
 *
 * The matrix has no diodes, so two keys down can make a third read as closed;
 * the scan reports the first key it finds. A key counts once two reads in a row
 * agree, which at the sketch's frame rate is a debounce of a frame or two, and
 * the last key stays available after its release.
 */
export const KEYPAD_HELPER_CPP: readonly string[] = [
  '// 4x4 matrix keypad: drive one column low at a time and read the rows.',
  'static int8_t _keypadScan(const uint8_t *rows, const uint8_t *cols) {',
  '  int8_t found = -1;',
  '  for (uint8_t c = 0; c < 4 && found < 0; ++c) {',
  '    pinMode(cols[c], OUTPUT); digitalWrite(cols[c], LOW); delayMicroseconds(5);',
  '    for (uint8_t r = 0; r < 4; ++r) { if (digitalRead(rows[r]) == LOW) { found = (int8_t)(r * 4 + c); break; } }',
  '    pinMode(cols[c], INPUT);',
  '  }',
  '  return found;',
  '}',
]

const pins = (props: Record<string, unknown>, keys: readonly string[]) =>
  keys.map((key, index) => sanitizePin(props[key], 13 + index))

export function keypadSetupCpp(props: Record<string, unknown>): string[] {
  return [
    ...pins(props, KEYPAD_ROW_KEYS).map((pin) => `  pinMode(${pin}, INPUT_PULLUP);`),
    ...pins(props, KEYPAD_COL_KEYS).map((pin) => `  pinMode(${pin}, INPUT);`),
  ]
}

export function keypadLoopCpp(
  props: Record<string, unknown>,
  id: string,
  local: (port: 'key' | 'pressed') => string,
): string[] {
  return [
    `  static const uint8_t _kpRows_${id}[4] = {${pins(props, KEYPAD_ROW_KEYS).join(', ')}};`,
    `  static const uint8_t _kpCols_${id}[4] = {${pins(props, KEYPAD_COL_KEYS).join(', ')}};`,
    `  static int8_t _kpPrev_${id} = -1, _kpKey_${id} = -1; static float _kpLast_${id} = 0.0f;`,
    `  int8_t _kpNow_${id} = _keypadScan(_kpRows_${id}, _kpCols_${id});`,
    `  if (_kpNow_${id} == _kpPrev_${id}) _kpKey_${id} = _kpNow_${id};`,
    `  _kpPrev_${id} = _kpNow_${id};`,
    `  if (_kpKey_${id} >= 0) _kpLast_${id} = (float)_kpKey_${id};`,
    `  float ${local('key')} = _kpLast_${id};`,
    `  bool ${local('pressed')} = _kpKey_${id} >= 0;`,
  ]
}
