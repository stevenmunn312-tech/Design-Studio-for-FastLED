import { describe, expect, it } from 'vitest'
import { evalTruchet } from '../../nodes/field/evaluate'
import { propertyOptions } from '../nodeLibrary'

describe('Truchet Tiles evaluator', () => {
  const render = (
    id: string,
    overrides: Partial<{
      reroll: boolean; lattice: string; motif: string; cells: number; lineWidth: number
      scroll: number; rotation: number; seed: number; t: number; W: number; H: number
    }> = {},
  ) => evalTruchet(
    id,
    overrides.reroll ?? false,
    overrides.lattice ?? 'square',
    overrides.motif ?? 'arcs',
    overrides.cells ?? 4,
    overrides.lineWidth ?? 0.08,
    overrides.scroll ?? 0,
    overrides.rotation ?? 0,
    overrides.seed ?? 9,
    overrides.t ?? 0.5,
    overrides.W ?? 16,
    overrides.H ?? 16,
  )

  it('renders every valid motif deterministically into a bounded field', () => {
    for (const [lattice, motifs] of [
      ['square', ['arcs', 'diagonals', 'smith', 'tenPrint']],
      ['hex', ['hexArcs']],
    ] as const) {
      for (const motif of motifs) {
        const first = render(`bounded-${lattice}-${motif}`, { lattice, motif })
        const second = render(`bounded-${lattice}-${motif}`, { lattice, motif })
        expect([...first], motif).toEqual([...second])
        expect([...first].every((value) => value >= 0 && value <= 1), motif).toBe(true)
        expect([...first].some((value) => value > 0), motif).toBe(true)
      }
    }
  })

  it('responds to every wireable control and animates only when scrolling', () => {
    const base = [...render('controls-base', { t: 0.6 })]
    for (const overrides of [
      { cells: 2.7 }, { lineWidth: 0.18 }, { scroll: 0.7 }, { rotation: 31 },
    ]) expect([...render(`controls-${Object.keys(overrides)[0]}`, { ...overrides, t: 0.6 })]).not.toEqual(base)

    expect([...render('still-a', { t: 0 })]).toEqual([...render('still-b', { t: 2 })])
    expect([...render('moving-a', { scroll: 0.5, t: 0 })])
      .not.toEqual([...render('moving-b', { scroll: 0.5, t: 2 })])
  })

  it('rerolls once per rising edge', () => {
    const id = 'reroll-edge'
    const initial = [...render(id)]
    const firstRise = [...render(id, { reroll: true })]
    const held = [...render(id, { reroll: true })]
    render(id, { reroll: false })
    const secondRise = [...render(id, { reroll: true })]
    expect(firstRise).not.toEqual(initial)
    expect(held).toEqual(firstRise)
    expect(secondRise).not.toEqual(firstRise)
  })

  it('rebuilds safely for a changed canvas size', () => {
    expect(render('resize', { W: 8, H: 6 })).toHaveLength(48)
    expect(render('resize', { W: 5, H: 3 })).toHaveLength(15)
  })

  it('falls back to lattice-compatible motifs', () => {
    expect([...render('hex-fallback', { lattice: 'hex', motif: 'tenPrint' })])
      .toEqual([...render('hex-explicit', { lattice: 'hex', motif: 'hexArcs' })])
    expect([...render('square-fallback', { lattice: 'square', motif: 'hexArcs' })])
      .toEqual([...render('square-explicit', { lattice: 'square', motif: 'arcs' })])
  })

  it('offers only motifs belonging to the selected lattice', () => {
    expect(propertyOptions('Truchet', 'motif', { lattice: 'hex' })).toEqual(['hexArcs'])
    expect(propertyOptions('Truchet', 'motif', { lattice: 'square' }))
      .toEqual(['arcs', 'diagonals', 'smith', 'tenPrint'])
  })
})
