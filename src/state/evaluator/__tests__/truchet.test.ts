import { describe, expect, it } from 'vitest'
import {
  truchetLineValue, truchetMotifDistance, truchetOrientation,
  truchetOrientationCount,
} from '../truchet'
import { squareCell } from '../lattice'

describe('Truchet geometry', () => {
  it.each(['arcs', 'diagonals', 'smith'] as const)(
    '%s meets every square edge at its midpoint',
    (motif) => {
      for (const [x, y] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) {
        expect(truchetMotifDistance('square', motif, x, y, 0)).toBeCloseTo(0, 7)
      }
    },
  )

  it('hex arcs meet all six edge midpoints', () => {
    const apothem = 1 / Math.sqrt(3)
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3
      expect(truchetMotifDistance(
        'hex', 'hexArcs', apothem * Math.cos(angle), apothem * Math.sin(angle), 0,
      )).toBeCloseTo(0, 7)
    }
  })

  it('keeps 10 PRINT on its selected corner-to-corner diagonal', () => {
    expect(truchetMotifDistance('square', 'tenPrint', -0.5, -0.5, 0)).toBe(0)
    expect(truchetMotifDistance('square', 'tenPrint', -0.5, 0.5, 1)).toBe(0)
  })

  it('chooses deterministic bounded orientations from the lattice hash', () => {
    const cell = squareCell(2.2, -3.1)
    const count = truchetOrientationCount('square', 'arcs')
    const first = truchetOrientation(cell, 4, 17, count)
    expect(truchetOrientation(cell, 4, 17, count)).toBe(first)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(count)
  })

  it('maps distance through a smooth bounded glow width', () => {
    expect(truchetLineValue(0, 0.1)).toBe(1)
    expect(truchetLineValue(0.1, 0.1)).toBe(0)
    expect(truchetLineValue(0.05, 0.1)).toBeCloseTo(0.5, 7)
  })
})
