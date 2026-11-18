import { sanitizePin } from '../hardwarePins'
import { libraryDefaults } from '../../state/nodeLibrary'
import {
  keypadColKeys, keypadColumnCount, keypadDigits, keypadKeyCount, keypadKeyIndex, keypadKeyPort, keypadRowCount, keypadRowKeys,
} from '../../state/peripherals/keypad'

/*
 * A switch-matrix membrane keypad, scanned column by column.
 *
 * Rows are inputs with the internal pull-up, so an open key reads HIGH. Each
 * column in turn is driven LOW while the others float, and a row that reads LOW
 * is a closed key at that row and column. The index is row * columns + column,
 * in the order the keys are printed (a 4x4: 1 2 3 A, 4 5 6 B, 7 8 9 C, * 0 # D).
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

/** The scan function a keypad of this geometry calls: the 4x4 keeps its original name. */
const scanFunction = (rows: number, columns: number) =>
  rows === 4 && columns === 4 ? '_keypadScan' : `_keypadScan${rows}x${columns}`

/** The scan helper for a `rows` x `columns` matrix; the 4x4's is `KEYPAD_HELPER_CPP`, unchanged. */
export function keypadHelperCpp(rows: number, columns: number): readonly string[] {
  if (rows === 4 && columns === 4) return KEYPAD_HELPER_CPP
  return [
    `// ${rows}x${columns} matrix keypad: drive one column low at a time and read the rows.`,
    `static int8_t ${scanFunction(rows, columns)}(const uint8_t *rows, const uint8_t *cols) {`,
    '  int8_t found = -1;',
    `  for (uint8_t c = 0; c < ${columns} && found < 0; ++c) {`,
    '    pinMode(cols[c], OUTPUT); digitalWrite(cols[c], LOW); delayMicroseconds(5);',
    `    for (uint8_t r = 0; r < ${rows}; ++r) { if (digitalRead(rows[r]) == LOW) { found = (int8_t)(r * ${columns} + c); break; } }`,
    '    pinMode(cols[c], INPUT);',
    '  }',
    '  return found;',
    '}',
  ]
}

/**
 * The helpers for every distinct keypad geometry among `partIds`, 4x4 first
 * (as it always was) and the rest in size order; each is emitted once.
 */
export function keypadHelpersFor(partIds: readonly unknown[]): string[] {
  const geometries = new Map<string, readonly [number, number]>()
  for (const partId of partIds) {
    const rows = keypadRowCount(partId)
    const columns = keypadColumnCount(partId)
    if (rows > 0 && columns > 0) geometries.set(`${rows}x${columns}`, [rows, columns])
  }
  const isFourByFour = ([rows, columns]: readonly [number, number]) => rows === 4 && columns === 4
  return [...geometries.values()]
    .sort((a, b) => Number(isFourByFour(b)) - Number(isFourByFour(a)) || a[0] * a[1] - b[0] * b[1] || a[0] - b[0])
    .flatMap(([rows, columns]) => keypadHelperCpp(rows, columns))
}

// A missing pin property falls back to the node's own default for that row or
// column. One shared `13 + index` fallback put rows and columns on the same
// GPIOs, and a column driven low on its own row line reads key 0 every frame.
const pins = (props: Record<string, unknown>, keys: readonly string[]) => {
  const defaults = libraryDefaults('KeypadInput')
  return keys.map((key) => sanitizePin(props[key], Number(defaults[key])))
}

export function keypadSetupCpp(props: Record<string, unknown>): string[] {
  return [
    ...pins(props, keypadRowKeys(props.partId)).map((pin) => `  pinMode(${pin}, INPUT_PULLUP);`),
    ...pins(props, keypadColKeys(props.partId)).map((pin) => `  pinMode(${pin}, INPUT);`),
  ]
}

/** The per-key outputs to publish: those in `ports`, or every one when unknown. */
export function keypadKeysRead(partId: unknown, ports?: ReadonlySet<string>): number[] {
  const keyCount = keypadKeyCount(partId)
  if (!ports) return Array.from({ length: keyCount }, (_, key) => key)
  return [...ports].map((port) => keypadKeyIndex(port, keyCount)).filter((key): key is number => key !== null).sort((a, b) => a - b)
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
  const rows = keypadRowCount(props.partId)
  const columns = keypadColumnCount(props.partId)
  const keyCount = keypadKeyCount(props.partId)
  return [
    `  static const uint8_t _kpRows_${id}[${rows}] = {${pins(props, keypadRowKeys(props.partId)).join(', ')}};`,
    `  static const uint8_t _kpCols_${id}[${columns}] = {${pins(props, keypadColKeys(props.partId)).join(', ')}};`,
    `  static int8_t _kpPrev_${id} = -1, _kpKey_${id} = -1; static float _kpLast_${id} = 0.0f;`,
    `  int8_t _kpNow_${id} = ${scanFunction(rows, columns)}(_kpRows_${id}, _kpCols_${id});`,
    `  if (_kpNow_${id} == _kpPrev_${id}) _kpKey_${id} = _kpNow_${id};`,
    `  _kpPrev_${id} = _kpNow_${id};`,
    `  if (_kpKey_${id} >= 0) _kpLast_${id} = (float)_kpKey_${id};`,
    `  float ${local('key')} = _kpLast_${id};`,
    `  bool ${local('pressed')} = _kpKey_${id} >= 0;`,
    ...(digit ? [
      `  static const int8_t _kpDigits_${id}[${keyCount}] = {${keypadDigits(props.partId).join(', ')}}; static float _kpDigit_${id} = 0.0f;`,
      `  if (_kpKey_${id} >= 0 && _kpDigits_${id}[_kpKey_${id}] >= 0) _kpDigit_${id} = (float)_kpDigits_${id}[_kpKey_${id}];`,
      `  float ${local('digit')} = _kpDigit_${id};`,
    ] : []),
    ...keys.map((key) => `  bool ${local(keypadKeyPort(key))} = _kpKey_${id} == ${key};`),
  ]
}
