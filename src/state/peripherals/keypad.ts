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
