import { describe, it, expect } from 'vitest'
import { FONT, FONT_W, FONT_H, textColumns, textAlignMode } from '../font'

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

  it('honors a custom font (dimensions and glyphs)', () => {
    const font = { w: 2, h: 2, glyphs: { A: [3, 0] } }   // top row lit, bottom blank
    expect(textColumns('A', font)).toEqual([1, 1, 0])    // 2 lit cols + 1 spacing
  })

  it('letterSpacing controls the number of trailing blank columns', () => {
    expect(textColumns('A', undefined, 0)).toHaveLength(FONT_W)
    expect(textColumns('A', undefined, 3)).toHaveLength(FONT_W + 3)
    expect(textColumns('AB', undefined, 2)).toHaveLength((FONT_W + 2) * 2)
  })

  describe('textAlignMode', () => {
    it('maps the start/end labels to start/end, everything else to center', () => {
      expect(textAlignMode('left', 'left', 'right')).toBe('start')
      expect(textAlignMode('right', 'left', 'right')).toBe('end')
      expect(textAlignMode('center', 'left', 'right')).toBe('center')
      expect(textAlignMode(undefined, 'left', 'right')).toBe('center')
    })

    it('uses the axis-appropriate labels (top/bottom vs left/right)', () => {
      expect(textAlignMode('top', 'top', 'bottom')).toBe('start')
      expect(textAlignMode('bottom', 'top', 'bottom')).toBe('end')
      expect(textAlignMode('middle', 'top', 'bottom')).toBe('center')
    })
  })
})
