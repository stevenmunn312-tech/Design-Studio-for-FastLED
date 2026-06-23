import { describe, it, expect } from 'vitest'
import { FONT, FONT_W, FONT_H, textColumns } from '../font'

describe('font', () => {
  it('every glyph has exactly FONT_H rows within 3 bits', () => {
    for (const [ch, rows] of Object.entries(FONT)) {
      expect(rows, ch).toHaveLength(FONT_H)
      for (const r of rows) expect(r).toBeLessThanOrEqual(7)
    }
  })

  it('textColumns emits FONT_W + 1 columns per character', () => {
    expect(textColumns('A')).toHaveLength(FONT_W + 1)
    expect(textColumns('AB')).toHaveLength((FONT_W + 1) * 2)
  })

  it('falls back to blank columns for unknown characters', () => {
    expect(textColumns('~')).toEqual([0, 0, 0, 0])
  })
})
