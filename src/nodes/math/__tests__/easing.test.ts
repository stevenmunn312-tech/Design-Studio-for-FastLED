import { describe, expect, it } from 'vitest'
import { applyEase, EASE_TYPES } from '../easing'

const EASING_MODES = EASE_TYPES.filter((type) =>
  !['triwave', 'quadwave', 'cubicwave'].includes(type),
)

describe('Ease curves', () => {
  it('keeps every easing mode bounded and monotonic across the byte domain', () => {
    for (const type of EASING_MODES) {
      let previous = -1
      for (let i = 0; i <= 255; i++) {
        const value = applyEase(type, i / 255)
        expect(value, `${type} at ${i}`).toBeGreaterThanOrEqual(0)
        expect(value, `${type} at ${i}`).toBeLessThanOrEqual(1)
        expect(value, `${type} at ${i}`).toBeGreaterThanOrEqual(previous)
        previous = value
      }
      expect(applyEase(type, 0), `${type} start`).toBe(0)
      expect(applyEase(type, 1), `${type} end`).toBe(1)
    }
  })

  it('mirrors FastLED ease8InOutApprox around its branch boundaries', () => {
    const expectedBytes = new Map([
      [63, 31],
      [64, 32],
      [128, 128],
      [191, 222],
      [192, 224],
      [193, 224],
    ])
    for (const [input, expected] of expectedBytes) {
      expect(Math.round(applyEase('inOutApprox', input / 255) * 255), `${input}`).toBe(expected)
    }
  })

  it('uses FastLED fixed-scale semantics for quadratic ease-in', () => {
    expect(Math.round(applyEase('inQuad', 15 / 255) * 255)).toBe(0)
    expect(Math.round(applyEase('inQuad', 127 / 255) * 255)).toBe(63)
    expect(Math.round(applyEase('inQuad', 255 / 255) * 255)).toBe(255)
  })

  it('keeps matching in/out families complementary within one byte', () => {
    for (const [inType, outType] of [
      ['inQuad', 'outQuad'],
      ['inCubic', 'outCubic'],
      ['inSine', 'outSine'],
    ] as const) {
      for (let i = 0; i <= 255; i++) {
        const sum = applyEase(inType, i / 255) + applyEase(outType, (255 - i) / 255)
        expect(sum, `${inType}/${outType} at ${i}`).toBeCloseTo(1, 2)
      }
    }
  })

  it('keeps wave shapers folded while easing curves finish at one', () => {
    for (const type of ['triwave', 'quadwave', 'cubicwave']) {
      expect(applyEase(type, 0)).toBe(0)
      expect(applyEase(type, 0.5)).toBe(1)
      expect(applyEase(type, 1)).toBe(0)
    }
    expect(applyEase('inOutSine', 1)).toBe(1)
  })

  it('clamps inputs and preserves the historical cubic fallback', () => {
    expect(applyEase('linear', -1)).toBe(0)
    expect(applyEase('linear', 2)).toBe(1)
    expect(applyEase('unknown', 0.25)).toBe(applyEase('inOutCubic', 0.25))
  })
})
