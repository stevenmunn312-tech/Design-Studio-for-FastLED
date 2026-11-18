import { describe, expect, it } from 'vitest'
import { calibrationCurveIssue, interpolateCurve, MAX_CURVE_POINTS } from '../calibrationCurve'

const rising = [{ volts: 0.5, value: 0 }, { volts: 1.5, value: 10 }, { volts: 3, value: 40 }]

describe('calibration curve', () => {
  it('is linear between points and holds the end values outside them', () => {
    expect(interpolateCurve(rising, 0.5)).toBe(0)
    expect(interpolateCurve(rising, 1)).toBeCloseTo(5, 10)
    expect(interpolateCurve(rising, 1.5)).toBe(10)
    expect(interpolateCurve(rising, 2.25)).toBeCloseTo(25, 10)
    expect(interpolateCurve(rising, 3)).toBe(40)
    expect(interpolateCurve(rising, 0)).toBe(0)
    expect(interpolateCurve(rising, 5)).toBe(40)
  })

  it('reads a falling curve the same way', () => {
    const falling = [{ volts: 1, value: 100 }, { volts: 3, value: 0 }]
    expect(interpolateCurve(falling, 2)).toBeCloseTo(50, 10)
    expect(interpolateCurve(falling, 0.2)).toBe(100)
    expect(interpolateCurve(falling, 3.3)).toBe(0)
  })

  it('never returns NaN for a bad voltage', () => {
    expect(interpolateCurve(rising, Number.NaN)).toBe(0)
    expect(interpolateCurve(rising, Number.POSITIVE_INFINITY)).toBe(40)
    expect(interpolateCurve([], 1)).toBe(0)
  })

  it('accepts rising, falling and level-then-rising curves', () => {
    expect(calibrationCurveIssue(rising)).toBeNull()
    expect(calibrationCurveIssue([{ volts: 0, value: 9 }, { volts: 1, value: 3 }])).toBeNull()
    expect(calibrationCurveIssue([{ volts: 0, value: 0 }, { volts: 1, value: 0 }, { volts: 2, value: 5 }])).toBeNull()
  })

  it.each([
    ['one point', [{ volts: 0, value: 0 }]],
    ['not an array', 'curve'],
    ['volts that do not rise', [{ volts: 1, value: 0 }, { volts: 1, value: 5 }]],
    ['volts that fall', [{ volts: 2, value: 0 }, { volts: 1, value: 5 }]],
    ['a reading that changes direction', [{ volts: 0, value: 0 }, { volts: 1, value: 5 }, { volts: 2, value: 1 }]],
    ['a reading that never changes', [{ volts: 0, value: 2 }, { volts: 1, value: 2 }]],
    ['a non-finite number', [{ volts: 0, value: 0 }, { volts: Number.NaN, value: 5 }]],
    ['a text number', [{ volts: 0, value: 0 }, { volts: '1', value: 5 }]],
    ['a huge number', [{ volts: 0, value: 0 }, { volts: 1, value: 1e12 }]],
    ['too many points', Array.from({ length: MAX_CURVE_POINTS + 1 }, (_, index) => ({ volts: index, value: index }))],
  ])('refuses %s', (_name, curve) => {
    expect(calibrationCurveIssue(curve)).not.toBeNull()
  })
})
