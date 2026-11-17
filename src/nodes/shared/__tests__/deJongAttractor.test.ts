import { describe, expect, it } from 'vitest'
import { DE_JONG_MARGIN, DE_JONG_PRESETS, deJongAxis, deJongPresetName } from '../deJongAttractor'

describe('de Jong attractor presets', () => {
  it.each(Object.keys(DE_JONG_PRESETS))('%s fills the frame and stays inside it', (name) => {
    const { coeffs: [a, b, c, d], x, y } = DE_JONG_PRESETS[name]
    const mapX = deJongAxis(x), mapY = deJongAxis(y)
    let ax = 0.1, ay = 0.1
    let minU = 1, maxU = 0, minV = 1, maxV = 0
    for (let i = 0; i < 200_000; i++) {
      const nx = Math.sin(a * ay) - Math.cos(b * ax)
      const ny = Math.sin(c * ax) - Math.cos(d * ay)
      ax = nx; ay = ny
      const u = ax * mapX.scale + mapX.offset
      const v = ay * mapY.scale + mapY.offset
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v)
    }
    // Swirl once reached only u <= 0.5 and v >= 0.25.
    for (const lo of [minU, minV]) expect(lo).toBeLessThan(DE_JONG_MARGIN + 0.03)
    for (const hi of [maxU, maxV]) expect(hi).toBeGreaterThan(1 - DE_JONG_MARGIN - 0.03)
    for (const lo of [minU, minV]) expect(lo).toBeGreaterThanOrEqual(0)
    for (const hi of [maxU, maxV]) expect(hi).toBeLessThanOrEqual(1)
  })

  it('falls back to classic for an unknown or inherited name', () => {
    expect(deJongPresetName('swirl')).toBe('swirl')
    expect(deJongPresetName('toString')).toBe('classic')
    expect(deJongPresetName(undefined)).toBe('classic')
  })
})
