import { describe, expect, it } from 'vitest'
import { MINIMAP_MIN_FIELD, MINIMAP_WIDTH, minimapFitsField } from '../minimapFit'

describe('minimapFitsField', () => {
  it('draws the minimap on a wide field', () => {
    expect(minimapFitsField(1920, 300, 500)).toBe(true)
  })

  it('hides it when the panels leave only a strip of canvas', () => {
    // 1024 px window with both panels open: about 250 px of graph.
    expect(minimapFitsField(1024, 280, 496)).toBe(false)
  })

  it('judges the field between the panels, not the whole canvas', () => {
    expect(minimapFitsField(900, 0, 0)).toBe(true)
    expect(minimapFitsField(900, 200, 200)).toBe(false)
  })

  it('leaves at least as much room beside the minimap as it takes', () => {
    expect(MINIMAP_MIN_FIELD - MINIMAP_WIDTH).toBeGreaterThanOrEqual(MINIMAP_WIDTH)
  })

  it('draws it before the canvas has been measured', () => {
    expect(minimapFitsField(null, 280, 496)).toBe(true)
  })
})
