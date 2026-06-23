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

/**
 * Convert a string into a flat list of vertical column bitmaps (one trailing
 * blank column per glyph as spacing). Each column's bit `r` (0 = top) is set
 * when that pixel is lit. Shared by the evaluator and the C++ generator so
 * scrolling/positioning math matches exactly.
 */
export function textColumns(text: string): number[] {
  const cols: number[] = []
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[' ']
    for (let c = 0; c < FONT_W; c++) {
      let col = 0
      for (let r = 0; r < FONT_H; r++) {
        if (glyph[r] & (1 << (FONT_W - 1 - c))) col |= 1 << r
      }
      cols.push(col)
    }
    cols.push(0) // 1px spacing between glyphs
  }
  return cols
}
