// The beta support matrix, read rather than retyped.
//
// Help used to enumerate the validated hardware in a sentence of its own, and
// the sentence went stale as rows were added to
// `docs/release/beta-support-matrix.md`. The matrix is the authority for what
// is supported, so Help derives its summary from the matrix's own tables: the
// rows whose status is Supported, and the boards they name.

export interface SupportMatrixSummary {
  /** Supported rows in the LED-output table. */
  ledRows: number
  /** Supported rows in the auxiliary-display table. */
  displayRows: number
  /** The distinct controller boards those rows name, in first-seen order. */
  boards: string[]
}

const LED_TABLE_HEADING = '## Supported end-to-end combo'
const DISPLAY_TABLE_HEADING = '## Auxiliary display hardware validation'

/** The cells of one markdown table row, trimmed. */
function cells(line: string): string[] {
  return line.split('|').slice(1, -1).map((cell) => cell.trim())
}

/**
 * The table rows under a heading whose first cell is `Supported`, up to the
 * next heading. The header row itself names the columns, so a cell is found by
 * its column name rather than its position.
 */
function supportedRows(markdown: string, heading: string): Record<string, string>[] {
  const start = markdown.indexOf(heading)
  if (start < 0) return []
  const section = markdown.slice(start + heading.length).split(/\n## /)[0]
  const lines = section.split('\n').filter((line) => line.startsWith('|'))
  if (lines.length === 0) return []
  const columns = cells(lines[0])
  return lines.slice(1)
    .map(cells)
    .filter((row) => row[0] === 'Supported')
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ''])))
}

/**
 * A board cell reduced to the board: the first phrase before a parenthesis or
 * a `+` that adds a part. "ESP32-S3 (OPI PSRAM enabled) + INMP441" is the S3.
 */
export function boardName(cell: string): string {
  return cell.split(/\s[(+]/)[0].trim()
}

export function summarizeSupportMatrix(markdown: string): SupportMatrixSummary {
  const led = supportedRows(markdown, LED_TABLE_HEADING)
  const display = supportedRows(markdown, DISPLAY_TABLE_HEADING)
  const boards: string[] = []
  for (const row of [...led, ...display]) {
    const name = boardName(row.Board ?? '')
    if (name && !boards.includes(name)) boards.push(name)
  }
  return { ledRows: led.length, displayRows: display.length, boards }
}

/** The matrix itself, fetched as a chunk of its own the first time Help asks. */
export async function loadSupportMatrixSummary(): Promise<SupportMatrixSummary> {
  const module = await import('../../docs/release/beta-support-matrix.md?raw')
  return summarizeSupportMatrix(module.default)
}
