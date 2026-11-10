// Compact 3×5 bitmap font shared by the live evaluator and the C++ generator,
// so the Text node renders identically in preview and on hardware.
//
// Each glyph is 5 rows (top → bottom); a row's low 3 bits are the pixels with
// bit 2 = left column, bit 1 = middle, bit 0 = right (e.g. "#.#" = 5).
//
// A font is plain data: Text and Clock Display pick one of `TEXT_FONTS` by
// their Font property, and the evaluator and the generator read whichever
// table that names, so the choice can never draw differently on hardware.
// The tables with lower case live in fontGlyphs.ts.

import { GLYPHS_4X6, GLYPHS_5X8, GLYPHS_6X8_BOLD } from './fontGlyphs'

export const FONT_W = 3
export const FONT_H = 5
export const TEXT_LINE_GAP = 1

/** A bitmap font: glyphs are `h` rows of `w`-bit pixels (see FONT comment). */
export interface BitmapFont {
  w: number
  h: number
  glyphs: Record<string, number[]>
  /** The table has no lower case, so text is folded to capitals before the lookup. */
  uppercase?: boolean
  /**
   * Blank columns Clock Display leaves after each glyph. The 3x5 digits have
   * always been drawn touching, which is what lets HH:MM fit a 16-wide
   * matrix; a font whose glyphs fill their cell needs the column to stay
   * readable.
   */
  clockGap?: number
}

export interface TextLineLayout {
  text: string
  /** One bitmap per font column, at size 1. */
  cols: number[]
  /** Drawn width in pixels: `cols.length * scale`. */
  width: number
}

export interface TextBlockLayout {
  lines: TextLineLayout[]
  /** Drawn width and height in pixels, at `scale`. */
  width: number
  height: number
  /** Pixels a font pixel is drawn across and down. */
  scale: number
  /** Pixels from one line's top to the next's. */
  lineStep: number
}

/**
 * Text and Clock Display's Size: each font pixel drawn as a square this many
 * pixels across, gaps and line spacing included, so size 2 is the size-1
 * text upscaled exactly. Whole numbers only, so a glyph never smears.
 */
export const TEXT_SIZE = { min: 1, max: 4, default: 1 } as const

/** A Size property as the whole pixel scale both sides draw at. */
export function textSize(value: unknown): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(TEXT_SIZE.min, Math.min(TEXT_SIZE.max, n)) : TEXT_SIZE.default
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
  // Punctuation a *title* contains, as opposed to one someone typed into a
  // Text node. Track names arrive from a stranger's ID3 tags full of
  // apostrophes, commas and brackets, and every glyph missing here renders as
  // a question mark — an elapsed/duration row read "0:00?7:49" on a bench
  // before '/' existed.
  '/': [1, 1, 2, 4, 4], "'": [2, 2, 0, 0, 0], ',': [0, 0, 0, 2, 4],
  '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '&': [2, 5, 2, 5, 3],
  '+': [0, 2, 7, 2, 0], '_': [0, 0, 0, 0, 7], '*': [0, 5, 2, 5, 0],
  '=': [0, 7, 0, 7, 0], '"': [5, 5, 0, 0, 0], ';': [0, 2, 0, 2, 4],
  '#': [5, 7, 5, 7, 5], '%': [5, 1, 2, 4, 5],
}

/** The built-in 3×5 font as a BitmapFont. */
export const DEFAULT_FONT: BitmapFont = { w: FONT_W, h: FONT_H, glyphs: FONT, uppercase: true }

/**
 * Every font Text and Clock Display offer, by the id their Font property
 * saves. The ids are a closed set: the generator writes one into C++
 * identifiers, so nothing a user typed may ever become one (`textFontId`).
 */
export const TEXT_FONTS: Readonly<Record<TextFontId, BitmapFont>> = {
  '3x5': DEFAULT_FONT,
  '4x6': { w: 4, h: 6, glyphs: GLYPHS_4X6, clockGap: 1 },
  '5x8': { w: 5, h: 8, glyphs: GLYPHS_5X8, clockGap: 1 },
  '6x8': { w: 6, h: 8, glyphs: GLYPHS_6X8_BOLD, clockGap: 1 },
}

export type TextFontId = '3x5' | '4x6' | '5x8' | '6x8'

/** The font every graph drew with before Font existed, and still does unless told otherwise. */
export const DEFAULT_FONT_ID: TextFontId = '3x5'

export const TEXT_FONT_IDS: readonly TextFontId[] = ['3x5', '4x6', '5x8', '6x8']

export const TEXT_FONT_LABELS: Readonly<Record<TextFontId, string>> = {
  '3x5': '3×5 capitals',
  '4x6': '4×6',
  '5x8': '5×8',
  '6x8': '6×8 bold',
}

/** A Font property as one of the known ids; anything else is the default. */
export function textFontId(value: unknown): TextFontId {
  return (TEXT_FONT_IDS as readonly unknown[]).includes(value) ? value as TextFontId : DEFAULT_FONT_ID
}

/** A Font property as the table both sides draw from. */
export function textFont(value: unknown): BitmapFont {
  return TEXT_FONTS[textFontId(value)]
}

/** `text` as the font looks it up: folded to capitals when it has no lower case. */
export function fontCase(text: string, font: BitmapFont): string {
  return font.uppercase ? text.toUpperCase() : text
}

/**
 * The C++ type one column bitmap needs. A column holds a bit per row, so a
 * font taller than eight rows would lose its lower rows in a byte.
 */
export function fontColumnCppType(font: BitmapFont): 'uint8_t' | 'uint16_t' | 'uint32_t' {
  return font.h <= 8 ? 'uint8_t' : font.h <= 16 ? 'uint16_t' : 'uint32_t'
}

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

/**
 * Convert a string into a flat list of vertical column bitmaps (`letterSpacing`
 * trailing blank columns per glyph, default 1). Each column's bit `r` (0 = top)
 * is set when that pixel is lit. Shared by the evaluator and the C++ generator
 * so scrolling/positioning math matches exactly. Lower case is kept only by a
 * font that has it (`fontCase`).
 */
export function textColumns(text: string, font: BitmapFont = DEFAULT_FONT, letterSpacing = 1): number[] {
  const { w, h, glyphs } = font
  const blank = glyphs[' '] ?? new Array(h).fill(0)
  const cols: number[] = []
  for (const ch of fontCase(text, font)) {
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
 * `scale` is the Size (`textSize`): the columns stay at size 1, and every
 * pixel measure is that many times the size-1 one.
 */
export function textBlockLayout(
  text: string,
  font: BitmapFont = DEFAULT_FONT,
  letterSpacing = 1,
  lineGap = TEXT_LINE_GAP,
  scale = 1,
): TextBlockLayout {
  const lines = textLines(text).map((line) => {
    const cols = textColumns(line, font, letterSpacing)
    return { text: line, cols, width: cols.length * scale }
  })
  const width = lines.reduce((max, line) => Math.max(max, line.width), 0)
  const lineStep = (font.h + Math.max(0, lineGap)) * scale
  const height = lines.length > 0 ? font.h * scale + (lines.length - 1) * lineStep : 0
  return { lines, width, height, scale, lineStep }
}
