import { beforeEach, describe, expect, it } from 'vitest'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import {
  fadeBytesToBlackBy, fadeFrameToBlackBy, TRAIL_HALF_LIFE, trailFadeSteps, trailFromRetention, trailHalfLife, trailKeep,
} from '../trailFade'
import { trailFadeCpp, trailKeepCpp } from '../trailFadeCpp'

/** Fade one channel of brightness 255 for `seconds` at `fps`, returning what is left. */
function fadedAfter(key: string, trail: number, seconds: number, fps: number): number {
  const frame = [[{ r: 255, g: 255, b: 255 }]]
  trailFadeSteps(key, 0, trail)
  for (let i = 1; i <= Math.round(seconds * fps); i++) fadeFrameToBlackBy(frame, trailFadeSteps(key, i / fps, trail))
  return frame[0][0].r
}

describe('trail fade', () => {
  beforeEach(() => resetEvaluatorState())

  it('spans under a frame to 2 s, the same ratio for every equal step', () => {
    expect(trailHalfLife(0)).toBeCloseTo(TRAIL_HALF_LIFE.shortest)
    expect(trailHalfLife(1)).toBeCloseTo(TRAIL_HALF_LIFE.longest)
    const ratios = [0, 0.1, 0.2, 0.5, 0.8].map((v) => trailHalfLife(v + 0.1) / trailHalfLife(v))
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9)
    expect(trailHalfLife(-3)).toBe(trailHalfLife(0))
    expect(trailHalfLife(7)).toBe(trailHalfLife(1))
  })

  it('converts a per-frame share onto the same half-life at 60 fps', () => {
    for (const retain of [0.75, 0.85, 0.9, 0.95]) {
      const perFrame = Math.LN2 / (60 * -Math.log(retain))
      expect(trailHalfLife(trailFromRetention(retain))).toBeCloseTo(perFrame, 9)
    }
    expect(trailFromRetention(0)).toBe(0)
    expect(trailFromRetention(1)).toBe(1)
  })

  it('makes 0.1 to 1 audibly different, where a per-frame fade did not', () => {
    const left = [0.9, 0.6, 0.3, 0].map((v, i) => fadedAfter(`spread-${i}`, v, 0.25, 60))
    expect(left[0]).toBeGreaterThan(200)
    expect(left[1]).toBeGreaterThan(30)
    expect(left[1]).toBeLessThan(160)
    expect(left[2]).toBe(0)
    expect(left[3]).toBe(0)
  })

  it('keeps a long trail close to its half-life although each frame owes under a byte', () => {
    // Trail 1 owes ~1.5 of 256 per frame at 60 fps. Spent a byte at a time,
    // FastLED's flooring left 94 of 255 after one half-life instead of ~127.
    const left = fadedAfter('long', 1, TRAIL_HALF_LIFE.longest, 60)
    expect(left).toBeGreaterThan(115)
    expect(left).toBeLessThan(135)
  })

  it('lets a dim tail linger on a long trail instead of dying in a few frames', () => {
    const frame = [[{ r: 6, g: 6, b: 6 }]]
    trailFadeSteps('tail', 0, 1)
    let frames = 0
    while (frame[0][0].r > 0 && frames < 600) {
      frames++
      fadeFrameToBlackBy(frame, trailFadeSteps('tail', frames / 60, 1))
    }
    expect(frames).toBeGreaterThan(20)
  })

  it('holds the trail length when the frame rate changes', () => {
    const at60 = fadedAfter('fps-60', 0.7, 0.5, 60)
    const at30 = fadedAfter('fps-30', 0.7, 0.5, 30)
    const at120 = fadedAfter('fps-120', 0.7, 0.5, 120)
    expect(Math.abs(at30 - at60)).toBeLessThanOrEqual(8)
    expect(Math.abs(at120 - at60)).toBeLessThanOrEqual(8)
  })

  it('spends the same bytes at 30 fps as at 60, so a short trail is no brighter', () => {
    // One fade a pass floored half as often at 30 fps: a trail of 0.7 kept
    // 7% more light and a quarter more lit pixels than at 60 fps.
    for (const trail of [0.3, 0.5, 0.7, 0.85, 1]) {
      const bytes = (fps: number) => {
        const key = `bytes-${trail}-${fps}`
        trailFadeSteps(key, 0, trail)
        return Array.from({ length: fps }, (_, i) => trailFadeSteps(key, (i + 1) / fps, trail)).flat()
      }
      const at60 = bytes(60)
      expect(bytes(30)).toEqual(at60)
      expect(bytes(120)).toEqual(at60)
      expect(bytes(20)).toEqual(at60)
    }
    expect(trailFadeSteps('two', 0, 0.5)).toEqual([])
    expect(trailFadeSteps('two', 2 / 60, 0.5)).toHaveLength(2)
  })

  it('fades once for the whole gap when a pass is more than four 60ths long', () => {
    trailFadeSteps('slow', 0, 0.5)
    expect(trailFadeSteps('slow', 4 / 60, 0.5)).toHaveLength(4)
    expect(trailFadeSteps('slow', 4 / 60 + 0.5, 0.5)).toHaveLength(1)
  })

  it('does nothing on the first pass, while paused, or for a broken wire', () => {
    expect(trailFadeSteps('first', 5, 0.05)).toEqual([])
    expect(trailFadeSteps('first', 5, 0.05)).toEqual([])
    trailFadeSteps('nan', 0, Number.NaN)
    expect(trailFadeSteps('nan', 1, Number.NaN)).toEqual([])
    expect(trailFadeSteps('nan', 2, 0)).toEqual([255])
  })

  it('dims a pixel with FastLED fadeToBlackBy byte arithmetic', () => {
    const frame = [[{ r: 255, g: 100, b: 1 }]]
    fadeFrameToBlackBy(frame, 64)
    expect(frame[0][0]).toEqual({ r: (255 * 192) >> 8, g: (100 * 192) >> 8, b: 0 })
    fadeFrameToBlackBy(frame, 255)
    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 0 })
    const bytes = new Uint8Array([255, 100, 1])
    fadeBytesToBlackBy(bytes, 64)
    expect([...bytes]).toEqual([(255 * 192) >> 8, (100 * 192) >> 8, 0])
  })

  it('keeps a float trail by the same half-life, 1 on the first pass', () => {
    expect(trailKeep('float', 0, 0.5)).toBe(1)
    expect(trailKeep('float', trailHalfLife(0.5), 0.5)).toBeCloseTo(0.5, 9)
    expect(trailKeep('float', trailHalfLife(0.5), 0.5)).toBe(1)
  })

  it('leaves nothing behind at trail 0, even within a frame', () => {
    expect(trailKeep('none', 0, 0)).toBe(1)
    expect(trailKeep('none', 1 / 60, 0)).toBe(0)
    trailFadeSteps('none', 0, 0)
    expect(trailFadeSteps('none', 1 / 60, 0)).toEqual([255])
  })

  it('emits the same curve and remainder carry in firmware', () => {
    const lines: string[] = []
    trailFadeCpp((line) => lines.push(line), 'j1', '_fd', 'buf_j1')
    const cpp = lines.join('\n')
    expect(cpp).toContain('static double _trail_j1T = -1.0, _trail_j1Owed = 0.0, _trail_j1Frames = 0.0;')
    expect(cpp).toContain('_trail_j1Frames += _trail_j1T < 0.0 ? 0.0 : fmax(0.0, t - _trail_j1T) * 60.0; _trail_j1T = t;')
    expect(cpp).toContain('int32_t _steps = (int32_t)(_trail_j1Frames + 0.001); _trail_j1Frames -= _steps;')
    expect(cpp).toContain('if (_steps > 4) { _dt = _steps / 60.0; _steps = 1; }')
    expect(cpp).toContain('for (; _steps > 0; _steps--) {')
    expect(cpp).toContain('double _keep = ((_fd) <= 0.0f ? 0.0 : pow(2.0, -(_dt) / (2.0 * pow(0.0020833333333333333, 1.0 - constrain((double)(_fd), 0.0, 1.0)))));')
    expect(cpp).toContain('_trail_j1Owed += (1.0 - _keep) * 256.0;')
    expect(cpp).toContain('if (_trail_j1Owed < 8.0) continue;')
    expect(cpp).toContain('fadeToBlackBy(buf_j1, NUM_LEDS, _by);')
    const short: string[] = []
    trailFadeCpp((line) => short.push(line), 's1', '_tr', 'trk', '    ', '_len')
    expect(short.join('\n')).toContain('fadeToBlackBy(trk, _len, _by);')
  })

  it('emits the float keep with the same curve', () => {
    const lines: string[] = []
    const keep = trailKeepCpp((line) => lines.push(line), 'g1', '_tl')
    expect(keep).toBe('_tkeep_g1')
    expect(lines.join('\n')).toContain('((_tl) <= 0.0f ? 0.0f : exp2f(-(fmaxf(0.0f, t - _tkeep_g1T)) / (2.0f * powf(0.00208333f, 1.0f - constrain((_tl), 0.0f, 1.0f)))))')
  })
})
