import { describe, expect, it } from 'vitest'
import { transformZoom, transformZoomCpp } from '../transformZoom'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { propertyLabel } from '../../../state/nodeLibrary'

describe("Transform's scale mode", () => {
  it('breathes between double and half size instead of freezing at a clamp', () => {
    // 100 units of phase is one doubling: in, back, out, back.
    expect(transformZoom(0)).toBeCloseTo(1, 12)
    expect(transformZoom(100)).toBeCloseTo(2, 12)
    expect(transformZoom(200)).toBeCloseTo(1, 12)
    expect(transformZoom(300)).toBeCloseTo(0.5, 12)
    expect(transformZoom(400)).toBeCloseTo(1, 12)
    // A negative rate shrinks first.
    expect(transformZoom(-100)).toBeCloseTo(0.5, 12)
    // The old 1 + phase/100 froze at 20x after about 21 s at the default 90 %/s.
    const late = [30, 31, 32, 33].map((s) => transformZoom(90 * s))
    expect(new Set(late.map((v) => v.toFixed(6))).size).toBe(4)
    for (const v of late) expect(v).toBeGreaterThanOrEqual(0.5)
  })

  it('folds the phase the same way on the board', () => {
    const run = compileCppSnippet([transformZoomCpp('ph')], ['ph'], ['_s'])
    for (const phase of [0, 37.5, 100, 160, 250, 300, 399, 1234.5, -20, -100, -333]) {
      expect(Number(run(0, { ph: phase })._s), `phase ${phase}`).toBeCloseTo(transformZoom(phase), 9)
    }
  })

  it("names the rate's unit for the mode", () => {
    expect(propertyLabel('Transform', 'rate', { transform: 'rotate' })).toBe('rate (°/s)')
    expect(propertyLabel('Transform', 'rate', { transform: 'scale' })).toBe('rate (%/s)')
    expect(propertyLabel('Transform', 'rate', { transform: 'translate' })).toBe('rate (px/s)')
  })
})
