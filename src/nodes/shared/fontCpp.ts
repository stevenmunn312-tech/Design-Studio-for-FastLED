/**
 * The built-in 3×5 font as a C++ lookup, for a Text node whose text arrives
 * on a wire and so cannot be baked into column bitmaps at generation time.
 * Built from the same FONT table the preview renders with, so a wired title
 * draws the glyphs the typed one does. Emitted once per sketch.
 */
import { FONT, FONT_H, FONT_W, textColumns } from './font'

export const FONT_CPP_MARKER = '// Studio 3x5 font'

/** Characters of a wired string the sketch draws; a longer one is cut here. */
export const WIRED_TEXT_MAX = 64

/** Column bitmaps of one glyph (no trailing gap), bit r = row r. */
function glyphColumns(ch: string): number[] {
  return textColumns(ch, undefined, 0)
}

export function fontCppHelper(): string {
  const chars = Object.keys(FONT).filter((ch) => ch.length === 1 && ch !== ' ')
  const codes = chars.map((ch) => ch.charCodeAt(0))
  const cols = chars.map((ch) => glyphColumns(ch))
  return [
    FONT_CPP_MARKER,
    `static const uint8_t _fontChars[${codes.length}] = {${codes.join(',')}};`,
    `static const uint8_t _fontCols[${codes.length}][${FONT_W}] = {${cols.map((c) => `{${c.join(',')}}`).join(',')}};`,
    `// Column \`c\` (0-${FONT_W - 1}) of glyph \`ch\`; blank for a space or an unknown character.`,
    `static uint8_t _fontCol(char ch, int c) {`,
    `  if (ch >= 'a' && ch <= 'z') ch -= 32;`,
    `  for (int i = 0; i < ${codes.length}; i++) if (_fontChars[i] == (uint8_t)ch) return _fontCols[i][c];`,
    `  return 0;`,
    `}`,
  ].join('\n')
}

export { FONT_H, FONT_W }
