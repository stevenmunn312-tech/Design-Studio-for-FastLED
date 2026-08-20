import { describe, it, expect } from 'vitest'
import { placeFloating } from '../floatingPlacement'

// A 1280x720 window, the supported desktop minimum.
const VIEW = { width: 1280, height: 720 }

/** A toolbar button roughly mid-window, as Add Hardware sits. */
const button = { left: 600, top: 560, right: 760, bottom: 592 }

describe('placeFloating, below an anchor', () => {
  it('hangs under the anchor and centres on it when there is room', () => {
    const at = placeFloating(button, { width: 240, height: 100 }, VIEW, 'below')
    expect(at.top).toBe(598) // 592 + gap
    expect(at.left).toBe(560) // centred on the button's 680 midpoint
  })

  it('aligns to the left edge when asked, for a menu opened at a point', () => {
    const at = placeFloating(button, { width: 240, height: 100 }, VIEW, 'below', 'start')
    expect(at.left).toBe(600)
  })

  /*
   * The reported bug. The hardware pane is the lower half of the window, so a
   * menu opening below a toolbar button had very little room under it and was
   * clipped — the last entry could only be reached by resizing the panes.
   */
  it('flips above the anchor when the space below is smaller', () => {
    const at = placeFloating(button, { width: 240, height: 400 }, VIEW, 'below')
    expect(at.top).toBeLessThan(button.top)
    expect(at.top).toBeGreaterThanOrEqual(8)
  })

  it('caps the height to the side it chose, so a tall menu scrolls', () => {
    const at = placeFloating(button, { width: 240, height: 4000 }, VIEW, 'below')
    expect(at.maxHeight).toBe(button.top - 6 - 8) // the roomier side, above
    expect(at.top + at.maxHeight).toBeLessThanOrEqual(VIEW.height)
  })

  it('never lets a wide menu run off either edge', () => {
    const nearLeft = { left: 10, top: 100, right: 60, bottom: 132 }
    expect(placeFloating(nearLeft, { width: 400, height: 50 }, VIEW, 'below').left).toBe(8)

    const nearRight = { left: 1220, top: 100, right: 1270, bottom: 132 }
    const at = placeFloating(nearRight, { width: 400, height: 50 }, VIEW, 'below')
    expect(at.left + 400).toBeLessThanOrEqual(VIEW.width - 8)
  })
})

describe('placeFloating, with a panel-requested cap', () => {
  /*
   * The part popup. It has a lot to say, and without a cap it filled the
   * tallest side it could find and read as a full-height column rather than a
   * popup beside the part you clicked.
   */
  const part = { left: 1100, top: 700, right: 1160, bottom: 750 }

  it('caps the height the panel is given', () => {
    const at = placeFloating(part, { width: 300, height: 2000 }, VIEW, 'below', 'center', 440)
    expect(at.maxHeight).toBe(440)
  })

  /*
   * The cap decides the side too. Judging by uncapped content would flip a
   * capped panel above an anchor it would have fitted under.
   */
  it('stays below when the capped panel fits there', () => {
    const high = { left: 600, top: 40, right: 700, bottom: 90 }
    const at = placeFloating(high, { width: 300, height: 2000 }, VIEW, 'below', 'center', 300)
    expect(at.top).toBe(96) // below the anchor, not flipped above it
    expect(at.maxHeight).toBe(300)
  })

  it('still respects the viewport when that is the tighter limit', () => {
    const at = placeFloating(part, { width: 300, height: 2000 }, VIEW, 'beside', 'center', 5000)
    expect(at.maxHeight).toBeLessThanOrEqual(VIEW.height)
  })
})

describe('placeFloating, beside an anchor', () => {
  const row = { left: 560, top: 300, right: 800, bottom: 344 }

  it('flies out to the right of the row', () => {
    const at = placeFloating(row, { width: 240, height: 200 }, VIEW, 'beside')
    expect(at.left).toBe(806) // 800 + gap
    expect(at.top).toBe(300) // level with the row
  })

  it('flips to the left when the right would overflow', () => {
    const nearRight = { left: 1000, top: 300, right: 1200, bottom: 344 }
    const at = placeFloating(nearRight, { width: 240, height: 200 }, VIEW, 'beside')
    expect(at.left).toBe(754) // 1000 - gap - width, on the row's left
    expect(at.left + 240).toBeLessThanOrEqual(nearRight.left)
  })

  it('lifts a tall submenu so its bottom stays on screen', () => {
    const low = { left: 560, top: 640, right: 800, bottom: 684 }
    const at = placeFloating(low, { width: 240, height: 300 }, VIEW, 'beside')
    expect(at.top).toBeLessThan(low.top)
    expect(at.top + Math.min(300, at.maxHeight)).toBeLessThanOrEqual(VIEW.height)
  })

  it('caps a submenu taller than the whole window', () => {
    const at = placeFloating(row, { width: 240, height: 5000 }, VIEW, 'beside')
    expect(at.top).toBe(8)
    expect(at.maxHeight).toBe(VIEW.height - 8 - 8)
  })
})
