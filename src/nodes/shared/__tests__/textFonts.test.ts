import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FONT, DEFAULT_FONT_ID, TEXT_FONTS, TEXT_FONT_IDS, TEXT_FONT_LABELS,
  fontCase, fontColumnCppType, textColumns, textFont, textFontId,
} from '../font'
import { GLYPHS_5X8, GLYPHS_6X8_BOLD, boldGlyphs, glyphRows } from '../fontGlyphs'
import { FONT_CPP_MARKER, fontColCppName, fontCppHelper, fontCppMarker } from '../fontCpp'

const OTHER_FONTS = TEXT_FONT_IDS.filter((id) => id !== DEFAULT_FONT_ID)
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))

describe('the bitmap fonts', () => {
  it('lists every font once, with a label, 3x5 first', () => {
    expect(TEXT_FONT_IDS).toEqual(Object.keys(TEXT_FONTS))
    expect(Object.keys(TEXT_FONT_LABELS)).toEqual(Object.keys(TEXT_FONTS))
    expect(TEXT_FONT_IDS[0]).toBe(DEFAULT_FONT_ID)
    expect(TEXT_FONTS[DEFAULT_FONT_ID]).toBe(DEFAULT_FONT)
    // An id is written into C++ identifiers and so must be a legal tail of one.
    for (const id of TEXT_FONT_IDS) expect(id).toMatch(/^[0-9a-z]+$/)
  })

  it.each(TEXT_FONT_IDS)('%s: every glyph fills its cell and no more', (id) => {
    const font = TEXT_FONTS[id]
    expect(id).toBe(`${font.w}x${font.h}`)
    for (const [ch, rows] of Object.entries(font.glyphs)) {
      expect(ch, 'one character a glyph').toHaveLength(1)
      expect(rows, ch).toHaveLength(font.h)
      for (const row of rows) {
        expect(Number.isInteger(row) && row >= 0 && row < 1 << font.w, `${ch} row ${row}`).toBe(true)
      }
    }
  })

  it.each(TEXT_FONT_IDS)('%s: has everything Clock Display prints', (id) => {
    const { glyphs } = TEXT_FONTS[id]
    for (const ch of '0123456789:.-AMP') {
      expect(glyphs[ch], ch).toBeDefined()
      expect(glyphs[ch].some((row) => row !== 0), ch).toBe(true)
    }
  })

  it.each(OTHER_FONTS)('%s: draws all of printable ASCII, lower case included', (id) => {
    const font = TEXT_FONTS[id]
    expect(Object.keys(font.glyphs).sort()).toEqual([...PRINTABLE].sort())
    expect(font.uppercase).toBeFalsy()
    for (const ch of PRINTABLE) {
      expect(font.glyphs[ch].some((row) => row !== 0), JSON.stringify(ch)).toBe(ch !== ' ')
    }
    // No two letters or digits are the same drawing, apart from the pairs a
    // four-pixel cell cannot tell apart.
    const same = new Map<string, string[]>()
    for (const ch of PRINTABLE) {
      const key = font.glyphs[ch].join(',')
      same.set(key, [...(same.get(key) ?? []), ch])
    }
    const twins = [...same.values()].filter((chars) => chars.length > 1).map((chars) => chars.join(''))
    expect(twins).toEqual(id === '4x6' ? ['0O'] : [])
  })

  it('folds to capitals only for a font without lower case', () => {
    expect(fontCase('aB', DEFAULT_FONT)).toBe('AB')
    expect(textColumns('a')).toEqual(textColumns('A'))
    for (const id of OTHER_FONTS) {
      const font = TEXT_FONTS[id]
      expect(fontCase('aB', font)).toBe('aB')
      expect(textColumns('a', font)).not.toEqual(textColumns('A', font))
    }
    // A font object made elsewhere, with no flag, is not folded either.
    expect(textColumns('a', { w: 1, h: 1, glyphs: { a: [1], A: [0] } }, 0)).toEqual([1])
  })

  it('packs a column a bit per row, the top row lowest, at any width and height', () => {
    const font = TEXT_FONTS['5x8']
    // L: a full-height stem and a foot along row 6.
    expect(textColumns('L', font, 0)).toEqual([0x7f, 0x40, 0x40, 0x40, 0x40])
    // g reaches the descender row, bit 7: the last a byte holds.
    expect(Math.max(...textColumns('g', font, 0))).toBeGreaterThanOrEqual(0x80)
    for (const id of TEXT_FONT_IDS) {
      for (const ch of Object.keys(TEXT_FONTS[id].glyphs)) {
        for (const col of textColumns(ch, TEXT_FONTS[id], 0)) expect(col).toBeLessThan(1 << TEXT_FONTS[id].h)
      }
    }
    // Nine rows of nine columns: wider than a byte each way.
    const tall = { w: 9, h: 9, glyphs: { X: [0x100, 0, 0, 0, 0, 0, 0, 0, 0x1ff] } }
    expect(textColumns('X', tall, 0)).toEqual([0x101, 0x100, 0x100, 0x100, 0x100, 0x100, 0x100, 0x100, 0x100])
  })

  it('sizes the C++ column type by the rows it must hold', () => {
    for (const id of TEXT_FONT_IDS) expect(fontColumnCppType(TEXT_FONTS[id]), id).toBe('uint8_t')
    const of = (h: number) => fontColumnCppType({ w: 5, h, glyphs: {} })
    expect([1, 8, 9, 16, 17].map(of)).toEqual(['uint8_t', 'uint8_t', 'uint16_t', 'uint16_t', 'uint32_t'])
  })

  it('reads a Font property as a known id or the default', () => {
    for (const id of TEXT_FONT_IDS) {
      expect(textFontId(id)).toBe(id)
      expect(textFont(id)).toBe(TEXT_FONTS[id])
    }
    for (const value of [undefined, null, 5, '', '5X8', '5x8 ', 'constructor', '__proto__', 'toString', '5x8"; evil(); //', ['5x8']]) {
      expect(textFontId(value), String(value)).toBe(DEFAULT_FONT_ID)
      expect(textFont(value)).toBe(DEFAULT_FONT)
    }
  })

  it('reads glyph art by rows and refuses a glyph that misses its cell', () => {
    expect(glyphRows({ A: '#.|.#', b: '##|..' }, 2, 2)).toEqual({ A: [2, 1], b: [3, 0] })
    expect(() => glyphRows({ A: '#.|.#' }, 2, 3)).toThrow(/"A" is not 2x3/)
    expect(() => glyphRows({ A: '#..|.#' }, 2, 2)).toThrow()
    expect(() => glyphRows({ A: '#x|.#' }, 2, 2)).toThrow()
  })

  it('makes the bold font by thickening every stroke one column to the right', () => {
    expect(boldGlyphs({ I: [0b00100, 0b10001] })).toEqual({ I: [0b001100, 0b110011] })
    expect(GLYPHS_6X8_BOLD).toEqual(boldGlyphs(GLYPHS_5X8))
  })
})

describe('the wired-text font lookup', () => {
  it('keeps the 3x5 block as every sketch has carried it', () => {
    const cpp = fontCppHelper()
    expect(fontCppHelper(DEFAULT_FONT_ID)).toBe(cpp)
    // Written out in full, as captured before the other fonts existed: this
    // block is in sketches already on boards, and must not move by a byte.
    expect(cpp.split('\n')).toEqual([
      '// Studio 3x5 font',
      'static const uint8_t _fontChars[55] = {48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,33,46,45,63,58,47,39,44,40,41,38,43,95,42,61,34,59,35,37};',
      'static const uint8_t _fontCols[55][3] = {{31,17,31},{18,31,16},{29,21,23},{21,21,31},{7,4,31},{23,21,29},{31,21,29},{1,29,3},{31,21,31},{23,21,31},{31,5,31},{31,21,10},{14,17,17},{31,17,14},{31,21,17},{31,5,1},{14,17,29},{31,4,31},{17,31,17},{8,16,31},{31,4,27},{31,16,16},{31,6,31},{31,14,31},{31,17,31},{31,5,7},{15,9,31},{31,13,23},{23,21,29},{1,31,1},{31,16,31},{15,16,15},{31,12,31},{27,4,27},{3,28,3},{25,21,19},{0,23,0},{0,16,0},{4,4,4},{1,21,3},{0,10,0},{24,4,3},{0,3,0},{16,8,0},{0,14,17},{17,14,0},{10,21,26},{4,14,4},{16,16,16},{10,4,10},{10,10,10},{3,0,3},{16,10,0},{31,10,31},{25,4,19}};',
      '// Column `c` (0-2) of glyph `ch`; blank for a space or an unknown character.',
      'static uint8_t _fontCol(char ch, int c) {',
      `  if (ch >= 'a' && ch <= 'z') ch -= 32;`,
      '  for (int i = 0; i < 55; i++) if (_fontChars[i] == (uint8_t)ch) return _fontCols[i][c];',
      '  return 0;',
      '}',
    ])
    expect(FONT_CPP_MARKER).toBe('// Studio 3x5 font')
    expect(fontColCppName()).toBe('_fontCol')
  })

  it.each(OTHER_FONTS)('indexes the %s table by the character, with no case fold', (id) => {
    const font = TEXT_FONTS[id]
    const cpp = fontCppHelper(id)
    const drawn = PRINTABLE.filter((ch) => ch !== ' ')
    const table = drawn.map((ch) => `{${textColumns(ch, font, 0).join(',')}}`).join(',')
    expect(cpp.split('\n')).toEqual([
      fontCppMarker(id),
      `static const uint8_t _fontCols_${id}[94][${font.w}] = {${table}};`,
      `// Column \`c\` (0-${font.w - 1}) of glyph \`ch\`; blank for a space or an unknown character.`,
      `static uint8_t ${fontColCppName(id)}(char ch, int c) {`,
      '  if (ch < 33 || ch > 126) return 0;',
      `  return _fontCols_${id}[ch - 33][c];`,
      '}',
    ])
    expect(fontColCppName(id)).toBe(`_fontCol_${id}`)
    // Nothing in one font's block can be mistaken for another's.
    for (const other of TEXT_FONT_IDS) {
      if (other !== id) expect(cpp.startsWith(fontCppMarker(other))).toBe(false)
    }
  })
})
