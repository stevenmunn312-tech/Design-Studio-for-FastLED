import { beforeEach, describe, expect, it } from 'vitest'
import { speedPhase } from '../speedClock'
import { phaseTag, speedPhaseCpp } from '../speedClockCpp'
import { resetEvaluatorState } from '../../../state/evaluator/memory'

beforeEach(() => resetEvaluatorState())

describe('speedPhase', () => {
  it('reproduces t * rate exactly while the rate is constant, from any first tick', () => {
    expect(speedPhase('k', 7.5, 2)).toBe(15)
    expect(speedPhase('k', 9, 2)).toBeCloseTo(18, 12)
    expect(speedPhase('k', 100.25, 2)).toBeCloseTo(200.5, 12)
  })

  it('stays continuous when the rate changes, instead of jumping by t × Δrate', () => {
    speedPhase('k', 600, 1)
    const before = speedPhase('k', 600.0167, 1)
    const after = speedPhase('k', 600.0333, 0.2)
    // t * rate would have dropped from ~600 to ~120 between these two frames.
    expect(Math.abs(after - before)).toBeLessThan(0.02)
    expect(after).toBeGreaterThan(before)
  })

  it('keeps separate terms and separate nodes apart', () => {
    speedPhase('a', 0, 1, 'x'); speedPhase('a', 0, 3, 'y'); speedPhase('b', 0, 5)
    expect(speedPhase('a', 1, 1, 'x')).toBeCloseTo(1)
    expect(speedPhase('a', 1, 3, 'y')).toBeCloseTo(3)
    expect(speedPhase('b', 1, 5)).toBeCloseTo(5)
  })
})

describe('speedPhaseCpp', () => {
  it('emits a seeded static accumulator and returns its name', () => {
    const lines: string[] = []
    const name = speedPhaseCpp((line) => lines.push(line), phaseTag('n-1', 'tex'), '_spd')
    expect(name).toBe('_phase_n_1_tex')
    expect(lines).toEqual([
      '    static float _phase_n_1_tex = 0.0f, _phase_n_1_texT = -1.0f;',
      '    _phase_n_1_tex = (_phase_n_1_texT < 0.0f) ? t * (_spd) : _phase_n_1_tex + (t - _phase_n_1_texT) * (_spd); _phase_n_1_texT = t;',
    ])
  })
})
