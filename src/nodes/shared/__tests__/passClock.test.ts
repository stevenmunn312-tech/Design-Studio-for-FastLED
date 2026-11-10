import { beforeEach, describe, expect, it } from 'vitest'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { MAX_PASS_SEC, PASS_FPS, keepOver, passChance, passFrames, passSteps } from '../passClock'
import { keepOverCpp, passChanceCpp, passFramesCpp, passStepsCpp } from '../passClockCpp'

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

  it('reads a tick of exactly a 60th as one frame, not a hair under', () => {
    passFrames('b', 0.5)
    expect(passFrames('b', 0.5 + 1 / 60)).toBe(1)
    expect(passFrames('b', 0.5 + 3 / 60)).toBe(2)
    expect(passFrames('b', 0.5 + 3 / 60 + 0.01)).toBeCloseTo(0.6, 9)
  })

  it('keeps a share, compounds a chance and carries a fraction of a step', () => {
    // At one frame each gives back the per-frame value exactly.
    expect(keepOver(0.92, 1)).toBe(0.92)
    expect(passChance(0.3, 1)).toBe(0.3)
    // Over two frames: the share kept twice, the chance of at least one.
    expect(keepOver(0.92, 2)).toBeCloseTo(0.92 * 0.92, 12)
    expect(passChance(0.3, 2)).toBeCloseTo(1 - 0.7 * 0.7, 12)
    expect(passChance(1, 0.5)).toBe(1)
    expect(passChance(0, 3)).toBe(0)
    // 40 a frame: 40 at 60 fps, 80 at 30, and 1.5 frames alternate 60 and 60.
    expect(passSteps('s', 40, 1)).toBe(40)
    expect(passSteps('s', 40, 2)).toBe(80)
    expect([passSteps('h', 1, 1.5), passSteps('h', 1, 1.5), passSteps('h', 1, 1.5), passSteps('h', 1, 1.5)]).toEqual([1, 2, 1, 2])
    // A run a hair under a 60th a pass still steps once a pass.
    expect(Array.from({ length: 5 }, () => passSteps('j', 1, 0.9999999))).toEqual([1, 1, 1, 1, 1])
  })

  it('emits the share, chance and steps in firmware', () => {
    expect(keepOverCpp('0.97f', '_pf_n')).toBe('powf(0.97f,_pf_n)')
    expect(passChanceCpp('_r', '_pf_n')).toBe('(_pf_n==1.0f?(_r):1.0f-powf(1.0f-(_r),_pf_n))')
    const lines: string[] = []
    expect(passStepsCpp((line) => lines.push(line), 'n', '40.0f', '_pf_n')).toBe('_ps_n')
    expect(lines).toEqual([
      '    static float _ps_nC = 0.0f;',
      '    float _ps_nO = _ps_nC + fmaxf(0.0f, 40.0f) * _pf_n; int _ps_n = (int)floorf(_ps_nO + 0.001f); _ps_nC = _ps_nO - _ps_n;',
    ])
  })

  it('emits the same clock in firmware', () => {
    const lines: string[] = []
    expect(passFramesCpp((line) => lines.push(line), 'sf')).toBe('_pf_sf')
    expect(lines.join('\n')).toContain('float _pf_sf = _pf_sfT < 0.0f ? 1.0f : constrain(t - _pf_sfT, 0.0f, 0.25f) * 60.0f; _pf_sfT = t;')
  })
})
