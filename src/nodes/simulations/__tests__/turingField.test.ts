import { describe, expect, it } from 'vitest'
import { evalTuringField } from '../../field/evaluate'
import { isPropertyEnabled, libraryDefaults } from '../../../state/nodeLibrary'

describe('Turing Field evaluator', () => {
  type Overrides = Partial<{
    reset: boolean; speed: number; stepSize: number; scales: number; baseRadius: number
    seed: number; W: number; H: number
  }>
  const render = (id: string, overrides: Overrides = {}) => evalTuringField(
    id,
    overrides.reset ?? false,
    overrides.speed ?? 2,
    overrides.stepSize ?? 0.05,
    overrides.scales ?? 3,
    overrides.baseRadius ?? 1,
    overrides.seed ?? 5,
    overrides.W ?? 16,
    overrides.H ?? 16,
  )
  const frames = (id: string, count: number, overrides: Overrides = {}) => {
    let field = render(id, overrides)
    for (let i = 1; i < count; i++) field = render(id, overrides)
    return [...field]
  }

  it('renders the same bounded field for the same history', () => {
    const first = frames('same-a', 6)
    expect(frames('same-b', 6)).toEqual(first)
    expect(first.every((value) => value >= 0 && value <= 1)).toBe(true)
    expect(Math.min(...first)).toBe(0)
    expect(Math.max(...first)).toBe(1)
  })

  it('keeps evolving from frame to frame', () => {
    const id = 'evolves'
    const early = [...render(id)]
    for (let i = 0; i < 8; i++) render(id)
    expect([...render(id)]).not.toEqual(early)
  })

  it('responds to every control', () => {
    const base = frames('controls-base', 6)
    for (const overrides of [
      { speed: 4 }, { stepSize: 0.15 }, { scales: 2 }, { baseRadius: 2 }, { seed: 6 },
    ] satisfies Overrides[]) {
      expect(frames(`controls-${Object.keys(overrides)[0]}`, 6, overrides)).not.toEqual(base)
    }
  })

  it('restarts from a fresh deterministic start once per rising reset edge', () => {
    const id = 'reset-edge'
    const initial = [...render(id)]
    const firstRise = [...render(id, { reset: true })]
    render(id, { reset: true })
    render(id, { reset: false })
    const secondRise = [...render(id, { reset: true })]
    expect(firstRise).not.toEqual(initial)
    expect(secondRise).not.toEqual(firstRise)

    // The same edges on a fresh instance give the same pattern.
    render('reset-twin')
    expect([...render('reset-twin', { reset: true })]).toEqual(firstRise)
  })

  it('reseeds when the canvas size changes', () => {
    expect(render('resize', { W: 8, H: 6 })).toHaveLength(48)
    expect(render('resize', { W: 5, H: 3 })).toHaveLength(15)
    expect([...render('resize', { W: 16, H: 16 })]).toEqual([...render('resize-fresh', { W: 16, H: 16 })])
  })

  it('draws along a single-row string', () => {
    const string = frames('string', 10, { W: 30, H: 1 })
    expect(string).toHaveLength(30)
    expect(string.every(Number.isFinite)).toBe(true)
    expect(new Set(string).size).toBeGreaterThan(2)
  })
})

describe('Reaction Diffusion presets', () => {
  it('defaults to Custom with the original feed and kill', () => {
    expect(libraryDefaults('ReactionDiffusion')).toMatchObject({ rdPreset: 'custom', feed: 0.055, kill: 0.062 })
  })

  it('dims Feed and Kill while a named preset fixes them', () => {
    expect(isPropertyEnabled('ReactionDiffusion', 'feed', { rdPreset: 'custom' })).toBe(true)
    expect(isPropertyEnabled('ReactionDiffusion', 'kill', {})).toBe(true)
    expect(isPropertyEnabled('ReactionDiffusion', 'feed', { rdPreset: 'coral' })).toBe(false)
    expect(isPropertyEnabled('ReactionDiffusion', 'kill', { rdPreset: 'worms' })).toBe(false)
    expect(isPropertyEnabled('ReactionDiffusion', 'speed', { rdPreset: 'worms' })).toBe(true)
  })
})
