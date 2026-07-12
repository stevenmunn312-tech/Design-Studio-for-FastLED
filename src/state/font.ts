// Compact 3×5 bitmap font shared by the live evaluator and the C++ generator,
// so the Text node renders identically in preview and on hardware.
//
// Each glyph is 5 rows (top → bottom); a row's low 3 bits are the pixels with
// bit 2 = left column, bit 1 = middle, bit 0 = right (e.g. "#.#" = 5).
//
// The font is plain data: swapping in a different glyph table (a custom font)
// requires no changes to the Text node, evaluator, or codegen.

export const FONT_W = 3
export const FONT_H = 5
export const TEXT_LINE_GAP = 1

/** A bitmap font: glyphs are `h` rows of `w`-bit pixels (see FONT comment). */
export interface BitmapFont {
  w: number
  h: number
  glyphs: Record<string, number[]>
}

export interface TextLineLayout {
  text: string
  cols: number[]
}

export interface TextBlockLayout {
  lines: TextLineLayout[]
  width: number
  height: number
}

export const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0],
  A: [7, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 3], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [5, 7, 7, 7, 5], O: [7, 5, 5, 5, 7], P: [7, 5, 7, 4, 4],
  Q: [7, 5, 5, 7, 1], R: [7, 5, 7, 6, 5], S: [7, 4, 7, 1, 7], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 7, 1, 7],
  '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
  '!': [2, 2, 2, 0, 2], '.': [0, 0, 0, 0, 2], '-': [0, 0, 7, 0, 0],
  '?': [7, 1, 2, 0, 2], ':': [0, 2, 0, 2, 0],
}

/** The built-in 3×5 font as a BitmapFont. */
export const DEFAULT_FONT: BitmapFont = { w: FONT_W, h: FONT_H, glyphs: FONT }

/**
 * Maps a Text node's user-facing alignment property ('left'/'right' on the
 * x axis, 'top'/'bottom' on y) to the generic start/center/end axis mode
 * shared by the evaluator and the C++ generator's positioning math.
 */
export function textAlignMode(value: unknown, startLabel: string, endLabel: string): 'start' | 'center' | 'end' {
  if (value === startLabel) return 'start'
  if (value === endLabel) return 'end'
  return 'center'
}

/** A value is a usable custom font if it has positive dims and a glyph map. */
export function asFont(value: unknown): BitmapFont {
  const f = value as Partial<BitmapFont> | undefined
  if (f && typeof f.w === 'number' && f.w > 0 && typeof f.h === 'number' && f.h > 0 &&
      f.glyphs && typeof f.glyphs === 'object') {
    return f as BitmapFont
  }
  return DEFAULT_FONT
}

/**
 * Convert a string into a flat list of vertical column bitmaps (`letterSpacing`
 * trailing blank columns per glyph, default 1). Each column's bit `r` (0 = top)
 * is set when that pixel is lit. Shared by the evaluator and the C++ generator
 * so scrolling/positioning math matches exactly.
 */
export function textColumns(text: string, font: BitmapFont = DEFAULT_FONT, letterSpacing = 1): number[] {
  const { w, h, glyphs } = font
  const blank = glyphs[' '] ?? new Array(h).fill(0)
  const cols: number[] = []
  for (const ch of text.toUpperCase()) {
    const glyph = glyphs[ch] ?? blank
    for (let c = 0; c < w; c++) {
      let col = 0
      for (let r = 0; r < h; r++) {
        if ((glyph[r] ?? 0) & (1 << (w - 1 - c))) col |= 1 << r
      }
      cols.push(col)
    }
    for (let s = 0; s < letterSpacing; s++) cols.push(0)
  }
  return cols
}

/** Split a Text node string into logical lines, normalising CRLF/CR to LF. */
export function textLines(text: string): string[] {
  return String(text).replace(/\r\n?/g, '\n').split('\n')
}

/**
 * Shared multiline text layout: precompute each line's bitmap columns plus the
 * block width/height so the preview and firmware place the same text block.
 */
export function textBlockLayout(
  text: string,
  font: BitmapFont = DEFAULT_FONT,
  letterSpacing = 1,
  lineGap = TEXT_LINE_GAP,
): TextBlockLayout {
  const lines = textLines(text).map((line) => ({ text: line, cols: textColumns(line, font, letterSpacing) }))
  const width = lines.reduce((max, line) => Math.max(max, line.cols.length), 0)
  const height = lines.length > 0 ? font.h + (lines.length - 1) * (font.h + Math.max(0, lineGap)) : 0
  return { lines, width, height }
}
