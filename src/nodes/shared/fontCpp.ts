/**
 * A font as a C++ lookup, for a Text node whose text arrives on a wire and so
 * cannot be baked into column bitmaps at generation time. Built from the same
 * table the preview renders with, so a wired title draws the glyphs the typed
 * one does. Emitted once per sketch for each font a wired Text there uses,
 * and never for a font none does.
 */
import {
  DEFAULT_FONT_ID, FONT_H, FONT_W, TEXT_FONTS, fontColumnCppType, textColumns,
  type BitmapFont, type TextFontId,
} from './font'

/** The line a font's block opens with, which is how a sketch is known to hold it. */
export function fontCppMarker(id: TextFontId = DEFAULT_FONT_ID): string {
  return `// Studio ${id} font`
}

export const FONT_CPP_MARKER = fontCppMarker()

/**
 * The lookup a wired Text calls. The 3x5 font keeps the bare names every
 * sketch has carried; the others are told apart by their id, which is one of
 * `TEXT_FONTS`' keys and so always a legal identifier tail.
 */
export function fontColCppName(id: TextFontId = DEFAULT_FONT_ID): string {
  return id === DEFAULT_FONT_ID ? '_fontCol' : `_fontCol_${id}`
}

/** Characters of a wired string the sketch draws; a longer one is cut here. */
export const WIRED_TEXT_MAX = 64

/** Column bitmaps of one glyph (no trailing gap), bit r = row r. */
function glyphColumns(ch: string, font: BitmapFont): number[] {
  return textColumns(ch, font, 0)
}

export function fontCppHelper(id: TextFontId = DEFAULT_FONT_ID): string {
  const font = TEXT_FONTS[id]
  const drawn = Object.keys(font.glyphs).filter((ch) => ch.length === 1 && ch !== ' ')
  const type = fontColumnCppType(font)
  const table = (chars: string[]) => chars.map((ch) => `{${glyphColumns(ch, font).join(',')}}`).join(',')
  const comment = `// Column \`c\` (0-${font.w - 1}) of glyph \`ch\`; blank for a space or an unknown character.`
  if (id === DEFAULT_FONT_ID) {
    const codes = drawn.map((ch) => ch.charCodeAt(0))
    return [
      FONT_CPP_MARKER,
      `static const uint8_t _fontChars[${codes.length}] = {${codes.join(',')}};`,
      `static const ${type} _fontCols[${codes.length}][${font.w}] = {${table(drawn)}};`,
      comment,
      `static ${type} _fontCol(char ch, int c) {`,
      `  if (ch >= 'a' && ch <= 'z') ch -= 32;`,
      `  for (int i = 0; i < ${codes.length}; i++) if (_fontChars[i] == (uint8_t)ch) return _fontCols[i][c];`,
      `  return 0;`,
      `}`,
    ].join('\n')
  }
  const chars = [...drawn].sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0))
  const codes = chars.map((ch) => ch.charCodeAt(0))
  const first = codes[0], last = codes[codes.length - 1]
  const fold = font.uppercase ? [`  if (ch >= 'a' && ch <= 'z') ch -= 32;`] : []
  const cols = `_fontCols_${id}`
  // A table covering an unbroken run of ASCII is indexed by the character
  // itself, which saves the list of codes and the search through it. `char`
  // may be signed, and the lower bound turns a byte above 127 away too.
  const lookup = last - first + 1 === codes.length && last < 128
    ? [
      `static const ${type} ${cols}[${codes.length}][${font.w}] = {${table(chars)}};`,
      comment,
      `static ${type} ${fontColCppName(id)}(char ch, int c) {`,
      ...fold,
      `  if (ch < ${first} || ch > ${last}) return 0;`,
      `  return ${cols}[ch - ${first}][c];`,
      `}`,
    ]
    : [
      `static const uint8_t _fontChars_${id}[${codes.length}] = {${codes.join(',')}};`,
      `static const ${type} ${cols}[${codes.length}][${font.w}] = {${table(chars)}};`,
      comment,
      `static ${type} ${fontColCppName(id)}(char ch, int c) {`,
      ...fold,
      `  for (int i = 0; i < ${codes.length}; i++) if (_fontChars_${id}[i] == (uint8_t)ch) return ${cols}[i][c];`,
      `  return 0;`,
      `}`,
    ]
  return [fontCppMarker(id), ...lookup].join('\n')
}

export { FONT_H, FONT_W }
