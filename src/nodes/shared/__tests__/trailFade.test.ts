import { beforeEach, describe, expect, it } from 'vitest'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { fadeFrameToBlackBy, TRAIL_HALF_LIFE, trailFadeAmount, trailHalfLife } from '../trailFade'
import { trailFadeCpp } from '../trailFadeCpp'

/** Fade one channel of brightness 255 for `seconds` at `fps`, returning what is left. */
function fadedAfter(key: string, fade: number, seconds: number, fps: number): number {
  const frame = [[{ r: 255, g: 255, b: 255 }]]
  trailFadeAmount(key, 0, fade)
  for (let i = 1; i <= Math.round(seconds * fps); i++) fadeFrameToBlackBy(frame, trailFadeAmount(key, i / fps, fade))
  return frame[0][0].r
}

describe('trail fade', () => {
  beforeEach(() => resetEvaluatorState())

  it('spans 2 s to under a frame, the same ratio for every equal step', () => {
    expect(trailHalfLife(0)).toBeCloseTo(TRAIL_HALF_LIFE.longest)
    expect(trailHalfLife(1)).toBeCloseTo(TRAIL_HALF_LIFE.shortest)
    const ratios = [0, 0.1, 0.2, 0.5, 0.8].map((f) => trailHalfLife(f) / trailHalfLife(f + 0.1))
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9)
    expect(trailHalfLife(-3)).toBe(trailHalfLife(0))
    expect(trailHalfLife(7)).toBe(trailHalfLife(1))
  })

  it('makes 0.1 to 1 audibly different, where a per-frame fade did not', () => {
    const left = [0.1, 0.4, 0.7, 1].map((f, i) => fadedAfter(`spread-${i}`, f, 0.25, 60))
    expect(left[0]).toBeGreaterThan(200)
    expect(left[1]).toBeGreaterThan(30)
    expect(left[1]).toBeLessThan(160)
    expect(left[2]).toBe(0)
    expect(left[3]).toBe(0)
  })

  it('keeps a long trail close to its half-life although each frame owes under a byte', () => {
    // Fade 0 owes ~1.5 of 256 per frame at 60 fps. Spent a byte at a time,
    // FastLED's flooring left 94 of 255 after one half-life instead of ~127.
    const left = fadedAfter('long', 0, TRAIL_HALF_LIFE.longest, 60)
    expect(left).toBeGreaterThan(115)
    expect(left).toBeLessThan(135)
  })

  it('lets a dim tail linger on a long trail instead of dying in a few frames', () => {
    const frame = [[{ r: 6, g: 6, b: 6 }]]
    trailFadeAmount('tail', 0, 0)
    let frames = 0
    while (frame[0][0].r > 0 && frames < 600) {
      frames++
      fadeFrameToBlackBy(frame, trailFadeAmount('tail', frames / 60, 0))
    }
    expect(frames).toBeGreaterThan(20)
  })

  it('holds the trail length when the frame rate changes', () => {
    const at60 = fadedAfter('fps-60', 0.3, 0.5, 60)
    const at30 = fadedAfter('fps-30', 0.3, 0.5, 30)
    const at120 = fadedAfter('fps-120', 0.3, 0.5, 120)
    expect(Math.abs(at30 - at60)).toBeLessThanOrEqual(8)
    expect(Math.abs(at120 - at60)).toBeLessThanOrEqual(8)
  })

  it('does nothing on the first pass, while paused, or for a broken wire', () => {
    expect(trailFadeAmount('first', 5, 1)).toBe(0)
    expect(trailFadeAmount('first', 5, 1)).toBe(0)
    trailFadeAmount('nan', 0, Number.NaN)
    expect(trailFadeAmount('nan', 1, Number.NaN)).toBe(0)
    expect(trailFadeAmount('nan', 2, 1)).toBe(255)
  })

  it('dims a pixel with FastLED fadeToBlackBy byte arithmetic', () => {
    const frame = [[{ r: 255, g: 100, b: 1 }]]
    fadeFrameToBlackBy(frame, 64)
    expect(frame[0][0]).toEqual({ r: (255 * 192) >> 8, g: (100 * 192) >> 8, b: 0 })
    fadeFrameToBlackBy(frame, 255)
    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('emits the same curve and remainder carry in firmware', () => {
    const lines: string[] = []
    trailFadeCpp((line) => lines.push(line), 'j1', '_fd', 'buf_j1')
    const cpp = lines.join('\n')
    expect(cpp).toContain('static float _trail_j1T = -1.0f, _trail_j1Owed = 0.0f;')
    expect(cpp).toContain('exp2f(-_dt / (2.0f * powf(0.00208333f, constrain((_fd), 0.0f, 1.0f))))')
    expect(cpp).toContain('_trail_j1Owed += (1.0f - _keep) * 256.0f;')
    expect(cpp).toContain('if (_trail_j1Owed >= 8.0f) {')
    expect(cpp).toContain('fadeToBlackBy(buf_j1, NUM_LEDS, _by);')
  })
})
