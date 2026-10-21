import { describe, expect, it } from 'vitest'
import { TRUCHET_MOTIFS, truchetOrientationCount } from '../truchet'
import { latticeHashBits } from '../lattice'
import { latticeCellQ12, truchetDistanceQ12, truchetLineQ16 } from '../../../nodes/shared/integerPatterns'

// The integer geometry works in 1/4096 cell, so a join lands within a couple
// of units (an integer square root and a rounded hex centre).
const q = (v: number) => Math.round(v * 4096)
const motif = (name: typeof TRUCHET_MOTIFS[number]) => TRUCHET_MOTIFS.indexOf(name)

describe('Truchet geometry', () => {
  it.each(['arcs', 'diagonals', 'smith'] as const)(
    '%s meets every square edge at its midpoint',
    (name) => {
      for (const [x, y] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) {
        expect(truchetDistanceQ12(0, motif(name), q(x), q(y), 0)).toBeLessThanOrEqual(2)
      }
    },
  )

  it('hex arcs meet all six edge midpoints', () => {
    const apothem = 1 / Math.sqrt(3)
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3
      expect(truchetDistanceQ12(1, motif('hexArcs'), q(apothem * Math.cos(angle)), q(apothem * Math.sin(angle)), 0)).toBeLessThanOrEqual(2)
    }
  })

  it('keeps 10 PRINT on its selected corner-to-corner diagonal', () => {
    expect(truchetDistanceQ12(0, motif('tenPrint'), -2048, -2048, 0)).toBe(0)
    expect(truchetDistanceQ12(0, motif('tenPrint'), -2048, 2048, 1)).toBe(0)
  })

  it('chooses deterministic bounded orientations from the lattice hash', () => {
    const cell = latticeCellQ12(q(2.2), q(-3.1), false)
    expect([cell.a, cell.b]).toEqual([2, -3])
    const count = truchetOrientationCount('square', 'arcs')
    const orientation = (seed: number) => Math.floor(latticeHashBits(cell.a + 4 * 31, cell.b - 4 * 17, seed) * count / 16777216)
    expect(orientation(17)).toBe(orientation(17))
    expect(orientation(17)).toBeGreaterThanOrEqual(0)
    expect(orientation(17)).toBeLessThan(count)
  })

  it('maps distance through a smooth bounded glow width', () => {
    expect(truchetLineQ16(0, q(0.1))).toBe(65536)
    expect(truchetLineQ16(q(0.1), q(0.1))).toBe(0)
    expect(Math.abs(truchetLineQ16(q(0.05), q(0.1)) - 32768)).toBeLessThanOrEqual(64)
  })
})
