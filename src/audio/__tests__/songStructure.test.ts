import { describe, expect, it } from 'vitest'
import type { EnergyPoint, SongSection } from '../../types/showFile'
import { alignSectionsToMusic, nearestBeatIndex, songGrid, structureChanges } from '../songStructure'

// A level per 100 ms frame, the same in every band.
function energyOf(durationMs: number, level: (t: number) => number): EnergyPoint[] {
  const points: EnergyPoint[] = []
  for (let t = 0; t <= durationMs; t += 100) {
    const v = level(t)
    points.push({ t, bass: v, mids: v, treble: v, overall: v })
  }
  return points
}

describe('songGrid', () => {
  it('continues tracked beats over the quiet ends at their median period', () => {
    const tracked = Array.from({ length: 20 }, (_, i) => 1200 + i * 400)
    const grid = songGrid(tracked, 150, 10000)
    expect(grid.periodMs).toBe(400)
    expect(grid.beats[0]).toBe(0)
    expect(grid.beats[grid.beats.length - 1]).toBe(10000)
    expect(grid.beats).toContain(1200)
  })

  it('lays an even grid at the tempo when too few beats were tracked', () => {
    const grid = songGrid([500, 1000], 120, 2000)
    expect(grid.beats).toEqual([0, 500, 1000, 1500, 2000])
    expect(nearestBeatIndex(grid, 1240)).toBe(2)
    expect(nearestBeatIndex(grid, 1260)).toBe(3)
  })
})

describe('alignSectionsToMusic', () => {
  const grid = songGrid(Array.from({ length: 80 }, (_, i) => i * 500), 120, 40000)
  const sections = (boundary: number): SongSection[] => [
    { startMs: 0, endMs: boundary, type: 'verse', energy: 0.2 },
    { startMs: boundary, endMs: 40000, type: 'drop', energy: 0.9 },
  ]

  it('moves an early boundary onto the beat of the step, once', () => {
    const energy = energyOf(40000, (t) => (t >= 20500 ? 0.9 : 0.2))
    const aligned = alignSectionsToMusic(sections(19100), energy, grid)
    expect(aligned.map((s) => [s.startMs, s.endMs])).toEqual([[0, 20500], [20500, 40000]])
    expect(alignSectionsToMusic(aligned, energy, grid)).toEqual(aligned)
  })

  it('leaves a boundary alone where the music does not step', () => {
    const flat = energyOf(40000, () => 0.5)
    expect(alignSectionsToMusic(sections(19100), flat, grid)).toEqual(sections(19100))
    // A step out of reach is another boundary's business.
    const far = energyOf(40000, (t) => (t >= 26000 ? 0.9 : 0.2))
    expect(alignSectionsToMusic(sections(19100), far, grid)).toEqual(sections(19100))
    expect(alignSectionsToMusic(sections(19100), [], grid)).toEqual(sections(19100))
  })
})

describe('structureChanges', () => {
  const grid = songGrid(Array.from({ length: 80 }, (_, i) => i * 500), 120, 40000)

  it('reports the beat a change lands on and ignores a steady song', () => {
    const energy = energyOf(40000, (t) => (t >= 12000 && t < 28000 ? 0.8 : 0.3))
    expect(structureChanges(energy, grid, 0.5).map((c) => c.t)).toEqual([12000, 28000])
    expect(structureChanges(energyOf(40000, () => 0.6), grid, 0.5)).toEqual([])
  })

  it('needs a bigger change at a higher threshold', () => {
    const energy = energyOf(40000, (t) => (t >= 12000 ? 0.45 : 0.3) + (t >= 28000 ? 0.4 : 0))
    expect(structureChanges(energy, grid, 0.5).map((c) => c.t)).toEqual([12000, 28000])
    expect(structureChanges(energy, grid, 1).map((c) => c.t)).toEqual([28000])
  })
})
