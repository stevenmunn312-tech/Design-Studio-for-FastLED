import { partById } from '../../build/parts/partCatalogue'
import type { PartKeypadSpec } from '../../build/parts/partCatalogue'
import type { NodePort } from '../../types'
import { KEYPAD_MAX_COLUMNS, KEYPAD_MAX_ROWS, keypadBlockIssue } from '../../build/parts/manifest/keypadBlock'
import { partIdOrDefault } from './partSpec'

/*
 * A passive switch-matrix keypad. Its geometry (rows, columns), the pad each
 * row and column is printed with, and what each key is printed with all come
 * from the catalogue's `keypad` block; the type owns the scan.
 *
 * The type's pin properties and per-key outputs are bounded by
 * `KEYPAD_MAX_ROWS` and `KEYPAD_MAX_COLUMNS`, the same way a relay's are by
 * `MAX_RELAY_CHANNELS`: the library names a pin before a part is known, and a
 * part uses the first `rows` row pins and the first `columns` column pins.
 */
export const KEYPAD_PART_ID = 'matrix-keypad-4x4'
export { KEYPAD_MAX_ROWS, KEYPAD_MAX_COLUMNS }

/** Every row pin and every column pin any keypad can use, in wiring order: the part-independent superset. */
export const KEYPAD_MAX_ROW_KEYS: readonly string[] = Array.from({ length: KEYPAD_MAX_ROWS }, (_, index) => `row${index + 1}Pin`)
export const KEYPAD_MAX_COL_KEYS: readonly string[] = Array.from({ length: KEYPAD_MAX_COLUMNS }, (_, index) => `col${index + 1}Pin`)

/** The part's keypad block; `null` for an unknown part or an unusable block (a missing id is the default part). */
export function keypadSpec(partId: unknown): PartKeypadSpec | null {
  const spec = partById(partIdOrDefault(partId, KEYPAD_PART_ID))?.keypad
  return spec && keypadBlockIssue(spec) === null ? spec : null
}

export const keypadRowCount = (partId: unknown): number => keypadSpec(partId)?.rows ?? 0
export const keypadColumnCount = (partId: unknown): number => keypadSpec(partId)?.columns ?? 0
export const keypadKeyCount = (partId: unknown): number => {
  const spec = keypadSpec(partId)
  return spec ? spec.rows * spec.columns : 0
}

/** The pin properties in wiring order for this part: its rows, then (separately) its columns. */
export const keypadRowKeys = (partId: unknown): readonly string[] => KEYPAD_MAX_ROW_KEYS.slice(0, keypadRowCount(partId))
export const keypadColKeys = (partId: unknown): readonly string[] => KEYPAD_MAX_COL_KEYS.slice(0, keypadColumnCount(partId))

/** What each key is printed with, indexed row by row: the value the node's Key output takes. */
export const keypadLegends = (partId: unknown): readonly string[] => keypadSpec(partId)?.legends ?? []

/** Whether a pin property is one of this part's row pins. */
export const keypadIsRowKey = (key: string): boolean => KEYPAD_MAX_ROW_KEYS.includes(key)

/** Whether a row or column pin property belongs to a row or column this part has. Other properties stay enabled. */
export function keypadPinPropertyEnabled(key: string, partId: unknown): boolean {
  if (!KEYPAD_MAX_ROW_KEYS.includes(key) && !KEYPAD_MAX_COL_KEYS.includes(key)) return true
  return keypadRowKeys(partId).includes(key) || keypadColKeys(partId).includes(key)
}

/** Preview run-state keys: one button per key, and the last one pressed. */
export const keypadButtonKey = (nodeId: string, key: number) => `${nodeId}:keypad:${key}`
export const keypadLastKey = (nodeId: string) => `${nodeId}:keypad:last`

/** The per-key output for key `index`: true while that key is the one held. */
export const keypadKeyPort = (key: number) => `key${key}`

/** Which key a per-key output reads, or null for any other port or a key beyond `keyCount`. */
export function keypadKeyIndex(port: string, keyCount: number): number | null {
  const match = /^key(\d+)$/.exec(port)
  const key = match ? Number(match[1]) : NaN
  return Number.isInteger(key) && key < keyCount ? key : null
}

/**
 * The outputs a keypad has: the last key as an index, whether one is down, the
 * last number key, then one folded output per key labelled with its legend.
 */
export function keypadOutputs(partId: unknown): NodePort[] {
  const legends = keypadLegends(partId)
  return [
    { id: 'key', label: `Key (0-${legends.length - 1})`, dataType: 'float' },
    { id: 'pressed', label: 'Pressed', dataType: 'bool' },
    { id: 'digit', label: 'Digit (0-9)', dataType: 'float' },
    ...legends.map((legend, key) => ({ id: keypadKeyPort(key), label: `Key ${legend}`, dataType: 'bool' as const })),
  ]
}

/** The number printed on each key, or -1 for a letter, `*` or `#`. */
export const keypadDigits = (partId: unknown): readonly number[] =>
  keypadLegends(partId).map((legend) => (/^\d$/.test(legend) ? Number(legend) : -1))

/** The digit a key carries, or null when it is not a number key. */
export function keypadDigit(partId: unknown, key: number): number | null {
  const digit = keypadDigits(partId)[key]
  return digit === undefined || digit < 0 ? null : digit
}

/**
 * The key the sketch's scan finds with `isDown` keys held: columns in turn,
 * rows within each, first found wins. A matrix with no diodes cannot report
 * two keys at once, so the preview reports the same one.
 */
export function keypadScanKey(partId: unknown, isDown: (key: number) => boolean): number {
  const rows = keypadRowCount(partId)
  const columns = keypadColumnCount(partId)
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const key = row * columns + column
      if (isDown(key)) return key
    }
  }
  return -1
}
