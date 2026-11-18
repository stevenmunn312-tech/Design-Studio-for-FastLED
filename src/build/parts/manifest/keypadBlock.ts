// The rules a `keypad` block must meet beyond the shapes in blockSpecs.ts: the
// counts have to agree with each other. Pure, so the manifest validator and the
// keypad type's own reader (state/peripherals/keypad.ts) apply the same rule and
// a registered part can never be known yet unusable.

/**
 * The most rows and columns the keypad type's pin properties and per-key
 * outputs cover, the way a relay's are bounded by `MAX_RELAY_CHANNELS`: the
 * library names a pin before a part is known, and a part uses the first `rows`
 * row pins and the first `columns` column pins.
 */
export const KEYPAD_MAX_ROWS = 4
export const KEYPAD_MAX_COLUMNS = 4

/** Why a keypad block cannot be used, or null when it can. */
export function keypadBlockIssue(block: unknown): string | null {
  if (typeof block !== 'object' || block === null) return 'is not an object'
  const { rows, columns, legends, rowLabels, columnLabels } = block as Record<string, unknown>
  if (typeof rows !== 'number' || !Number.isInteger(rows) || typeof columns !== 'number' || !Number.isInteger(columns)) {
    return 'needs whole row and column counts'
  }
  if (rows < 1 || rows > KEYPAD_MAX_ROWS) return `has ${rows} rows; this version drives 1 to ${KEYPAD_MAX_ROWS}`
  if (columns < 1 || columns > KEYPAD_MAX_COLUMNS) return `has ${columns} columns; this version drives 1 to ${KEYPAD_MAX_COLUMNS}`
  const isText = (list: unknown, count: number) =>
    Array.isArray(list) && list.length === count && list.every((item) => typeof item === 'string' && item !== '')
  if (!isText(legends, rows * columns)) return `needs one legend per key (${rows * columns})`
  if (!isText(rowLabels, rows)) return `needs one label per row (${rows})`
  if (!isText(columnLabels, columns)) return `needs one label per column (${columns})`
  return null
}
