import { beforeEach, describe, expect, it } from 'vitest'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { MAX_PASS_SEC, PASS_FPS, passFrames } from '../passClock'
import { passFramesCpp } from '../passClockCpp'

describe('pass clock', () => {
  beforeEach(() => resetEvaluatorState())

  it('counts 60ths of a second since the previous pass, one on the first', () => {
    expect(passFrames('a', 5)).toBe(1)
    expect(passFrames('a', 5 + 1 / 60)).toBeCloseTo(1, 9)
    expect(passFrames('a', 5 + 1 / 60 + 1 / 30)).toBeCloseTo(2, 9)
    // Paused, nothing moves; a long stall counts as a quarter second at most.
    expect(passFrames('a', 5 + 1 / 60 + 1 / 30)).toBe(0)
    expect(passFrames('a', 60)).toBeCloseTo(MAX_PASS_SEC * PASS_FPS, 9)
  })

  it('emits the same clock in firmware', () => {
    const lines: string[] = []
    expect(passFramesCpp((line) => lines.push(line), 'sf')).toBe('_pf_sf')
    expect(lines.join('\n')).toContain('float _pf_sf = _pf_sfT < 0.0f ? 1.0f : constrain(t - _pf_sfT, 0.0f, 0.25f) * 60.0f; _pf_sfT = t;')
  })
})
