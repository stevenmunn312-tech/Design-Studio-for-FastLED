import { beforeEach, describe, expect, it } from 'vitest'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { MAX_PASS_SEC, MAX_STEP_FRAMES, PASS_FPS, keepOver, passFrames, passStepFrames, passSteps } from '../passClock'
import { keepOverCpp, passFramesCpp, passStepFramesCpp, passStepsCpp } from '../passClockCpp'

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

  it('keeps a share and carries a fraction of a step', () => {
    // At one frame each gives back the per-frame value exactly.
    expect(keepOver(0.92, 1)).toBe(0.92)
    // Over two frames: the share kept twice.
    expect(keepOver(0.92, 2)).toBeCloseTo(0.92 * 0.92, 12)
    // 40 a frame: 40 at 60 fps, 80 at 30, and 1.5 frames alternate 60 and 60.
    expect(passSteps('s', 40, 1)).toBe(40)
    expect(passSteps('s', 40, 2)).toBe(80)
    expect([passSteps('h', 1, 1.5), passSteps('h', 1, 1.5), passSteps('h', 1, 1.5), passSteps('h', 1, 1.5)]).toEqual([1, 2, 1, 2])
    // A run a hair under a 60th a pass still steps once a pass.
    expect(Array.from({ length: 5 }, () => passSteps('j', 1, 0.9999999))).toEqual([1, 1, 1, 1, 1])
  })

  it('tries a per-frame chance once in each whole frame owed', () => {
    // Rate 0.3 a frame: about 18 spawns a second at 60, 30 and 144 passes a
    // second, where one chance of at least one a pass gave 15.3 at 30 fps.
    let seed = 1
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    const spawnsPerSecond = (fps: number) => {
      let spawns = 0
      for (let pass = 0; pass < fps * 200; pass++) {
        const owed = passSteps(`rate${fps}`, 1, PASS_FPS / fps)
        for (let k = 0; k < owed; k++) if (rnd() < 0.3) spawns++
      }
      return spawns / 200
    }
    for (const fps of [60, 30, 144]) expect(spawnsPerSecond(fps), `${fps} fps`).toBeCloseTo(18, 0)
  })

  it('repeats a whole step once a frame owed, at most MAX_STEP_FRAMES a pass', () => {
    expect([passStepFrames('f', 1), passStepFrames('f', 2), passStepFrames('f', 0.5), passStepFrames('f', 0.5)]).toEqual([1, 2, 0, 1])
    // A stall owes fifteen frames; the step catches up four and drops the rest.
    expect(passStepFrames('g', MAX_PASS_SEC * PASS_FPS)).toBe(MAX_STEP_FRAMES)
    expect(passStepFrames('g', 1)).toBe(1)
    expect([passStepFrames('k', 2.5), passStepFrames('k', 2.5)]).toEqual([2, 3])
  })

  it('emits the share, the steps and the capped steps in firmware', () => {
    expect(keepOverCpp('0.97f', '_pf_n')).toBe('powf(0.97f,_pf_n)')
    const lines: string[] = []
    expect(passStepsCpp((line) => lines.push(line), 'n', '40.0f', '_pf_n')).toBe('_ps_n')
    expect(lines).toEqual([
      '    static float _ps_nC = 0.0f;',
      '    float _ps_nO = _ps_nC + fmaxf(0.0f, 40.0f) * _pf_n; int _ps_n = (int)floorf(_ps_nO + 0.001f); _ps_nC = _ps_nO - _ps_n;',
    ])
    const capped: string[] = []
    expect(passStepFramesCpp((line) => capped.push(line), 'n', '_pf_n')).toBe('_psf_n')
    expect(capped).toEqual([
      '    static float _psf_nC = 0.0f;',
      `    float _psf_nO = _psf_nC + _pf_n; int _psf_n = (int)floorf(_psf_nO + 0.001f); _psf_nC = _psf_nO - _psf_n; if (_psf_n > ${MAX_STEP_FRAMES}) _psf_n = ${MAX_STEP_FRAMES};`,
    ])
  })

  it('emits the same clock in firmware', () => {
    const lines: string[] = []
    expect(passFramesCpp((line) => lines.push(line), 'sf')).toBe('_pf_sf')
    expect(lines.join('\n')).toContain('float _pf_sf = _pf_sfT < 0.0f ? 1.0f : constrain(t - _pf_sfT, 0.0f, 0.25f) * 60.0f; _pf_sfT = t;')
  })
})
