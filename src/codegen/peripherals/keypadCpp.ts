import { sanitizePin } from '../hardwarePins'
import { libraryDefaults } from '../../state/nodeLibrary'
import {
  KEYPAD_COL_KEYS, KEYPAD_DIGITS, KEYPAD_KEY_COUNT, KEYPAD_ROW_KEYS, keypadKeyIndex, keypadKeyPort,
} from '../../state/peripherals/keypad'

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

// A missing pin property falls back to the node's own default for that row or
// column. One shared `13 + index` fallback put rows and columns on the same
// GPIOs, and a column driven low on its own row line reads key 0 every frame.
const pins = (props: Record<string, unknown>, keys: readonly string[]) => {
  const defaults = libraryDefaults('KeypadInput')
  return keys.map((key) => sanitizePin(props[key], Number(defaults[key])))
}

export function keypadSetupCpp(props: Record<string, unknown>): string[] {
  return [
    ...pins(props, KEYPAD_ROW_KEYS).map((pin) => `  pinMode(${pin}, INPUT_PULLUP);`),
    ...pins(props, KEYPAD_COL_KEYS).map((pin) => `  pinMode(${pin}, INPUT);`),
  ]
}

/** The per-key outputs to publish: those in `ports`, or every one when unknown. */
export function keypadKeysRead(ports?: ReadonlySet<string>): number[] {
  if (!ports) return Array.from({ length: KEYPAD_KEY_COUNT }, (_, key) => key)
  return [...ports].map(keypadKeyIndex).filter((key): key is number => key !== null).sort((a, b) => a - b)
}

/**
 * `keys` are the per-key outputs something reads, each true while the scan
 * holds that key; `digit` adds the last number key pressed, held like Key.
 */
export function keypadLoopCpp(
  props: Record<string, unknown>,
  id: string,
  local: (port: string) => string,
  keys: readonly number[] = [],
  digit = false,
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
    ...(digit ? [
      `  static const int8_t _kpDigits_${id}[16] = {${KEYPAD_DIGITS.join(', ')}}; static float _kpDigit_${id} = 0.0f;`,
      `  if (_kpKey_${id} >= 0 && _kpDigits_${id}[_kpKey_${id}] >= 0) _kpDigit_${id} = (float)_kpDigits_${id}[_kpKey_${id}];`,
      `  float ${local('digit')} = _kpDigit_${id};`,
    ] : []),
    ...keys.map((key) => `  bool ${local(keypadKeyPort(key))} = _kpKey_${id} == ${key};`),
  ]
}
