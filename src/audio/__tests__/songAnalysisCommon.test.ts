import { describe, it, expect } from 'vitest'
import { detectSections, normalizeEnergy } from '../songAnalysisCommon'
import type { EnergyPoint } from '../../types/showFile'

// Build an energy envelope sampled every 100ms with a constant `overall` level.
function envelope(levels: number[]): EnergyPoint[] {
  return levels.map((overall, i) => ({ t: i * 100, bass: overall, mids: overall, treble: overall, overall }))
}

describe('normalizeEnergy', () => {
  it('scales each band to a peak of 1 by its own maximum', () => {
    const pts: EnergyPoint[] = [
      { t: 0,   bass: 1, mids: 2, treble: 0.5,  overall: 4 },
      { t: 100, bass: 0.5, mids: 1, treble: 0.25, overall: 2 },
    ]
    normalizeEnergy(pts)
    expect(pts[0]).toMatchObject({ bass: 1, mids: 1, treble: 1, overall: 1 })
    expect(pts[1]).toMatchObject({ bass: 0.5, mids: 0.5, treble: 0.5, overall: 0.5 })
  })

  it('treats an all-zero band as zero (no divide-by-zero)', () => {
    const pts = envelope([0, 0, 0])
    normalizeEnergy(pts)
    expect(pts.every(p => p.overall === 0)).toBe(true)
  })
})

describe('detectSections', () => {
  // 30 s: 10 s quiet, 10 s loud, 10 s quiet.
  const energy = envelope([
    ...Array(100).fill(0.1),
    ...Array(100).fill(0.9),
    ...Array(100).fill(0.1),
  ])
  const sections = detectSections(energy, 30_000)

  it('returns contiguous sections ordered by start time', () => {
    expect(sections.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].startMs).toBeGreaterThan(sections[i - 1].startMs)
    }
  })

  it('labels the opening section intro and the loud middle a high-energy type', () => {
    expect(sections[0].type).toBe('intro')
    expect(sections.some(s => s.type === 'drop' || s.type === 'chorus')).toBe(true)
  })

  it('keeps every section energy within 0–1', () => {
    expect(sections.every(s => s.energy >= 0 && s.energy <= 1)).toBe(true)
  })

  it('returns nothing for an empty envelope', () => {
    expect(detectSections([], 30_000)).toEqual([])
  })
})
