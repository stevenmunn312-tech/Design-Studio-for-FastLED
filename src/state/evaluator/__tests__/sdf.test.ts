import { describe, expect, it } from 'vitest'
import { ellipseSd, morphPolygonSd, polygonSd, rectSd } from '../sdf'

describe('shared signed-distance helpers', () => {
  it('keeps the established rectangle and ellipse sign convention', () => {
    expect(rectSd(0, 0, 2, 1)).toBeLessThan(0)
    expect(rectSd(2, 0, 2, 1)).toBeCloseTo(0)
    expect(rectSd(3, 0, 2, 1)).toBeGreaterThan(0)
    expect(ellipseSd(0, 0, 2, 1)).toBeCloseTo(-1)
    expect(ellipseSd(2, 0, 2, 1)).toBeCloseTo(0)
  })

  it('matches integer polygons and blends fractional side counts', () => {
    const square = polygonSd(1.4, 0.2, 4, 2)
    const pentagon = polygonSd(1.4, 0.2, 5, 2)
    expect(morphPolygonSd(1.4, 0.2, 4, 2)).toBeCloseTo(square)
    expect(morphPolygonSd(1.4, 0.2, 4.5, 2)).toBeCloseTo((square + pentagon) / 2)
  })
})
