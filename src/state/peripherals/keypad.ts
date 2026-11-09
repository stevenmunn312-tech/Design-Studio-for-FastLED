export const KEYPAD_PART_ID = 'matrix-keypad-4x4'
export const KEYPAD_ROWS = 4
export const KEYPAD_COLUMNS = 4
export const KEYPAD_KEY_COUNT = KEYPAD_ROWS * KEYPAD_COLUMNS

/** The pin properties in wiring order: R1 to R4, then C1 to C4. */
export const KEYPAD_ROW_KEYS = ['row1Pin', 'row2Pin', 'row3Pin', 'row4Pin'] as const
export const KEYPAD_COL_KEYS = ['col1Pin', 'col2Pin', 'col3Pin', 'col4Pin'] as const

/** What each key is printed with, indexed row by row: the value the node's Key output takes. */
export const KEYPAD_LEGENDS: readonly string[] = [
  '1', '2', '3', 'A',
  '4', '5', '6', 'B',
  '7', '8', '9', 'C',
  '*', '0', '#', 'D',
]

/** Preview run-state keys: one button per key, and the last one pressed. */
export const keypadButtonKey = (nodeId: string, key: number) => `${nodeId}:keypad:${key}`
export const keypadLastKey = (nodeId: string) => `${nodeId}:keypad:last`

/** The per-key output for key `index`: true while that key is the one held. */
export const keypadKeyPort = (key: number) => `key${key}`

/** Which key a per-key output reads, or null for any other port. */
export function keypadKeyIndex(port: string): number | null {
  const match = /^key(\d+)$/.exec(port)
  const key = match ? Number(match[1]) : NaN
  return Number.isInteger(key) && key < KEYPAD_KEY_COUNT ? key : null
}

/** The number printed on each key, or -1 for a letter, `*` or `#`. */
export const KEYPAD_DIGITS: readonly number[] = KEYPAD_LEGENDS.map((legend) => (/^\d$/.test(legend) ? Number(legend) : -1))

/** The digit a key carries, or null when it is not a number key. */
export function keypadDigit(key: number): number | null {
  const digit = KEYPAD_DIGITS[key]
  return digit === undefined || digit < 0 ? null : digit
}

/**
 * The key the sketch's scan finds with `isDown` keys held: columns in turn,
 * rows within each, first found wins. A matrix with no diodes cannot report
 * two keys at once, so the preview reports the same one.
 */
export function keypadScanKey(isDown: (key: number) => boolean): number {
  for (let column = 0; column < KEYPAD_COLUMNS; column += 1) {
    for (let row = 0; row < KEYPAD_ROWS; row += 1) {
      const key = row * KEYPAD_COLUMNS + column
      if (isDown(key)) return key
    }
  }
  return -1
}
