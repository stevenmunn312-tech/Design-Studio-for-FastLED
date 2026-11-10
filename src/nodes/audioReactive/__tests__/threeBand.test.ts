import { beforeEach, describe, expect, it } from 'vitest'
import { AUDIO_REACTIVE_EVALUATORS } from '../evaluate'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { isPropertyEnabled } from '../../../state/nodeLibrary'
import type { Frame } from '../../../state/palettes/ledColor'

const W = 8, H = 16

/** Lit rows in the leftmost (bass) column, one pass at `ms` with every spectrum bin at `level`. */
function bassBar(props: Record<string, unknown>, ms: number, level: number, wired: Record<string, number> = {}): number {
  const audio = { active: true, micActive: true, spectrum: Array(32).fill(level), detectorSpectrum: Array(32).fill(level), previewSpectrum: Array(32).fill(level) }
  const ctx = {
    t: ms / 1000, elapsedT: ms / 1000, W, H,
    stateKey: (id: string) => `tb:${id}`,
    incoming: new Map(Object.keys(wired).map((port) => [`n:${port}`, { srcId: 'x', srcPort: 'y' }])),
    input: (_id: string, key: string, fallback: unknown) => (key === 'audio' ? audio : fallback),
    num: (_id: string, key: string, p: Record<string, unknown>, prop: string, fallback: number) =>
      key in wired ? wired[key] : Number(p[prop] ?? fallback),
    pal: () => 'rainbow',
  }
  const frame = AUDIO_REACTIVE_EVALUATORS.SpectrumVisualizer(ctx as never, 'n', props, {} as never, '').frame as Frame
  return frame.filter((row) => row[0].r + row[0].g + row[0].b > 0).length
}

const props = { style: 'Three Band', gain: 1, smoothing: 0.8, reactivity: 0, speed: 0, mirror: false }

beforeEach(() => resetEvaluatorState())

describe('Spectrum Visualizer · Three Band smoothing', () => {
  it('eases an unwired band toward its spectrum third instead of jumping', () => {
    const quiet = bassBar(props, 1000, 0)
    const first = bassBar(props, 1000 + 1000 / 60, 1)
    const later = bassBar(props, 1000 + 1000, 1)
    expect(quiet).toBe(0)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(later)
    // Full bass at no reactivity fills about 0.45 of the height.
    expect(later).toBeGreaterThanOrEqual(5)
  })

  it('follows a wired band at once', () => {
    bassBar(props, 1000, 0, { bass: 0 })
    expect(bassBar(props, 1000 + 1000 / 60, 0, { bass: 1 })).toBe(bassBar(props, 1100, 0, { bass: 1 }))
  })

  it('offers Smoothing on Three Band, and still no Tilt', () => {
    expect(isPropertyEnabled('SpectrumVisualizer', 'smoothing', { style: 'Three Band' })).toBe(true)
    expect(isPropertyEnabled('SpectrumVisualizer', 'tilt', { style: 'Three Band' })).toBe(false)
  })
})
