import { describe, expect, it } from 'vitest'
import { CUSTOM_PATH_SAMPLES, customPathPoint, customPathTable } from '../customPath'
import { pathPoint } from '../pathShapes'

describe('custom Path outline', () => {
  const square = '0.8,0.8 -0.8,0.8 -0.8,-0.8 0.8,-0.8'

  it('bakes a closed, evenly resampled table of the documented size', () => {
    const table = customPathTable(square)!
    expect(table).toHaveLength(CUSTOM_PATH_SAMPLES)
    expect(table.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
    // Starts on the first point and wraps: turn 1 is turn 0.
    expect(table[0].x).toBeCloseTo(0.8, 6)
    expect(table[0].y).toBeCloseTo(0.8, 6)
    expect(customPathPoint(table, 1)).toEqual(customPathPoint(table, 0))
  })

  it('is a smooth curve through the author\'s points', () => {
    const table = customPathTable(square)!
    for (const [x, y] of [[0.8, 0.8], [-0.8, 0.8], [-0.8, -0.8], [0.8, -0.8]]) {
      const nearest = Math.min(...table.map((p) => Math.hypot(p.x - x, p.y - y)))
      expect(nearest).toBeLessThan(0.05)
    }
    // Rounded corners: the curve bulges past the chord between points.
    const step = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y)
    const steps = table.map((p, i) => step(p, table[(i + 1) % table.length]))
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.5)
  })

  it('reads the same text Fourier Epicycles does and rejects the same text', () => {
    expect(customPathTable('0,0 1,0 1,1')).not.toBeNull()
    expect(customPathTable('0,0 1,0')).toBeNull()
    expect(customPathTable('0,0 1,0 1')).toBeNull()
    expect(customPathTable('a,b c,d e,f')).toBeNull()
    expect(customPathTable('1,1 1,1 1,1')).toBeNull()
    expect(customPathTable(undefined)).toBeNull()
    expect(pathPoint('circle', 0)).toEqual({ x: 1, y: 0 })
  })

  it('interpolates linearly between samples', () => {
    const table = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    expect(customPathPoint(table, 0.125)).toEqual({ x: 0.5, y: 0 })
    expect(customPathPoint(table, 0.875)).toEqual({ x: 0, y: 0.5 })
  })
})
