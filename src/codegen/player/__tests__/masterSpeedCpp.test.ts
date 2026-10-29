import { describe, expect, it } from 'vitest'
import { masterClockLoopCpp, masterShowClockLoopCpp, type MasterSpeedEmit } from '../masterSpeedCpp'

const knob = (speedExpr: string | null = null): MasterSpeedEmit =>
  ({ speedExpr, initial: 0.5, present: true, min: 0, max: 4 })

// The accumulator the sketch used to emit, run with float32 arithmetic:
// `_tAnim += ((dt) / 1000.0f) * _tSpeed`, every intermediate rounded to a float.
function oldFloatSecondsClock(startSec: number, frames: number, dtMs: number, speed: number): number {
  let tAnim = Math.fround(startSec)
  for (let i = 0; i < frames; i++) {
    tAnim = Math.fround(tAnim + Math.fround(Math.fround(dtMs / 1000) * speed))
  }
  return tAnim
}

// What the sketch emits now: exact scaled milliseconds plus a float remainder.
function scaledMsClock(startMs: number, frames: number, dtMs: number, speed: number): { ms: number; t: number } {
  let ms = startMs
  let frac = 0
  for (let i = 0; i < frames; i++) {
    const step = Math.fround(Math.fround(dtMs * speed) + frac)
    const whole = Math.trunc(step)
    ms = (ms + whole) >>> 0
    frac = Math.fround(step - whole)
  }
  return { ms, t: Math.fround(Math.fround(ms) / 1000) }
}

describe('masterClockLoopCpp', () => {
  it('keeps the plain millis() clock when there is no knob', () => {
    expect(masterClockLoopCpp({ speedExpr: null, initial: 1, present: false, min: 0, max: 4 }))
      .toEqual(['  float t = millis() / 1000.0f;'])
  })

  it('accumulates scaled milliseconds as an exact integer, not float seconds', () => {
    const cpp = masterClockLoopCpp(knob()).join('\n')
    expect(cpp).toContain('static uint32_t _tAnimMs = 0;')
    expect(cpp).toContain('static float _tAnimFrac = 0.0f;')
    expect(cpp).toContain('const float _tSpeed = 0.5000f;')
    expect(cpp).toContain('uint32_t _tNowMs = millis();')
    expect(cpp).toContain('if (_tLastMs) { float _step = (_tNowMs - _tLastMs) * _tSpeed + _tAnimFrac; uint32_t _whole = (uint32_t)_step; _tAnimMs += _whole; _tAnimFrac = _step - _whole; }')
    expect(cpp).toContain('float t = _tAnimMs / 1000.0f;')
    expect(cpp).not.toContain('static float _tAnim =')
    expect(cpp).not.toContain('/ 1000.0f) * _tSpeed')
  })

  it('gives a wired speed a static and reads the sync clock when asked', () => {
    const cpp = masterClockLoopCpp(knob('n_pot_value'), true).join('\n')
    expect(cpp).toContain('static float _tSpeed = 0.5000f;')
    expect(cpp).toContain('uint32_t _tNowMs = _syncNowMs();')
  })

  it('emits the same integer accumulator for a show, feeding animNow directly', () => {
    const cpp = masterShowClockLoopCpp(knob()).join('\n')
    expect(cpp).toContain('static uint32_t _showAnimMs = 0;')
    expect(cpp).toContain('if (_showAnimLastMs) { float _step = (now - _showAnimLastMs) * _showAnimSpeed + _showAnimFrac; uint32_t _whole = (uint32_t)_step; _showAnimMs += _whole; _showAnimFrac = _step - _whole; }')
    expect(cpp).toContain('uint32_t animNow = _showAnimMs;')
    expect(cpp).not.toContain('_showAnimSec')
    expect(masterShowClockLoopCpp({ ...knob(), present: false })).toEqual([])
  })
})

describe('the scaled clock on a fixture that has been up for weeks', () => {
  // Twenty days in, a float holding seconds resolves to 0.125 s: a 16 ms
  // frame at half speed is 8 ms, which rounds to nothing and the clock
  // freezes. Integer milliseconds carry the same thousand frames exactly.
  const DAY_20_SEC = 20 * 86400
  const FRAMES = 1000
  const DT_MS = 16

  it('the old float-seconds accumulator stops advancing', () => {
    const t = oldFloatSecondsClock(DAY_20_SEC, FRAMES, DT_MS, 0.5)
    expect(t).toBe(Math.fround(DAY_20_SEC))
  })

  it('the integer-millisecond accumulator advances by exactly the scaled time', () => {
    const { ms, t } = scaledMsClock(DAY_20_SEC * 1000, FRAMES, DT_MS, 0.5)
    expect(ms).toBe(DAY_20_SEC * 1000 + FRAMES * DT_MS * 0.5)
    expect(Math.abs(t - (DAY_20_SEC + 8))).toBeLessThanOrEqual(0.25)
  })

  it('carries a fractional speed without drift from the first frame', () => {
    // 0.3 × 16 ms = 4.8 ms a frame: 1000 frames are 4800 ms, give or take the
    // one remainder still waiting below a millisecond.
    const { ms } = scaledMsClock(0, FRAMES, DT_MS, 0.3)
    expect(Math.abs(ms - 4800)).toBeLessThanOrEqual(1)
  })
})
