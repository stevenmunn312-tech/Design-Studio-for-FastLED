import { describe, expect, it } from 'vitest'
import { signalScopeSamples } from '../scope'
import { SIGNAL_EVALUATORS } from '../evaluate'

describe('signal node scopes', () => {
  it('draw only the nodes whose shape is the point', () => {
    for (const type of ['Wave', 'NoiseSignal', 'Envelope']) expect(signalScopeSamples(type, {}), type).toHaveLength(64)
    for (const type of ['Random', 'TimeNode', 'Interval', 'Clock']) expect(signalScopeSamples(type, {}), type).toBeNull()
  })

  it('trace an Envelope from rest up through its attack and back to 0', () => {
    const trace = signalScopeSamples('Envelope', { attack: 0.5, decay: 1 })!
    expect(trace[0]).toBe(0)
    expect(Math.max(...trace)).toBeCloseTo(1, 1)
    expect(trace[trace.length - 1]).toBe(0)
    const peak = trace.indexOf(Math.max(...trace))
    expect(peak).toBeGreaterThan(0)
    expect(peak).toBeLessThan(trace.length - 1)
  })

  it('trace the same drift the Noise LFO sends, within its range', () => {
    const props = { speed: 0.3, min: 0.2, max: 0.8, octaves: 2, seed: 5 }
    const trace = signalScopeSamples('NoiseSignal', props)!
    for (const v of trace) { expect(v).toBeGreaterThanOrEqual(0.2); expect(v).toBeLessThanOrEqual(0.8) }
    // The node's first output, at time 0, is the trace's first point.
    const first = SIGNAL_EVALUATORS.NoiseSignal!({
      num: (_id: string, _port: string, p: Record<string, unknown>, key: string, def: number) => Number(p[key] ?? def),
      elapsedT: 0, stateKey: () => 'scope-noise',
    } as never, 'n', props, {} as never, 'NoiseSignal').value as number
    expect(first).toBeCloseTo(trace[0], 9)
  })
})
