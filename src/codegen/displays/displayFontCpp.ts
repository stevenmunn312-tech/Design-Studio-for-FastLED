// The fixed displays' font as C++, for the OLED and the colour TFT drivers.
//
// Both drivers draw the one `DISPLAY_FONT` the preview draws with, so a glyph
// cannot differ between a panel and its preview, or between the two panels.
// Each driver still declares the table under its own prefix: a sketch can
// carry both panels, and two definitions of one name is a build failure.

import { DISPLAY_FONT } from '../../state/displays/displayFont'
import { cppStringLiteral } from '../../state/displays/displayText'

/**
 * The font as a flat column table: `count` glyphs of `DISPLAY_FONT.w` bytes,
 * bit `r` of a byte lit for row `r`, in the order of `chars`.
 *
 * A byte a column, so the font may be at most eight rows tall.
 */
export function displayFontTableCpp(): { chars: string; table: string; count: number } {
  const { w, h, glyphs } = DISPLAY_FONT
  if (h > 8) throw new Error('The fixed display font must fit a byte per column')
  const chars = Object.keys(glyphs).filter((ch) => ch.length === 1).sort()
  const columns: number[] = []
  for (const ch of chars) {
    const rows = glyphs[ch]
    for (let c = 0; c < w; c++) {
      let column = 0
      for (let r = 0; r < h; r++) {
        if ((rows[r] ?? 0) & (1 << (w - 1 - c))) column |= 1 << r
      }
      columns.push(column)
    }
  }
  return {
    chars: cppStringLiteral(chars.join('')),
    table: columns.map((c) => `0x${c.toString(16).padStart(2, '0')}`).join(', '),
    count: chars.length,
  }
}

/**
 * The line a glyph lookup starts with: fold `c` to capitals when the font has
 * no lower case, nothing when it has. The firmware twin of `fontCase`.
 */
export function displayGlyphFoldCpp(): string {
  return DISPLAY_FONT.uppercase ? "  if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');\n" : ''
}
