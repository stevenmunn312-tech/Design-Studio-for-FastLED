import { describe, it, expect } from 'vitest'
import { denormRate, rateCpp, SPEED_MAX, SCALE_MAX } from '../speedRange'

describe('speedRange', () => {
  it('denormRate maps a 0–1 slider onto [0, max] and clamps out-of-range input', () => {
    expect(denormRate(0, 2)).toBe(0)
    expect(denormRate(0.5, 2)).toBe(1)
    expect(denormRate(1, 3)).toBe(3)
    expect(denormRate(1.5, 2)).toBe(2)   // clamps above 1
    expect(denormRate(-1, 2)).toBe(0)    // clamps below 0
  })

  it('rateCpp emits a clamped, scaled C++ expression', () => {
    expect(rateCpp('x', 2)).toBe('(constrain((x), 0.0f, 1.0f) * 2.000f)')
    expect(rateCpp('_v', 1.5)).toBe('(constrain((_v), 0.0f, 1.0f) * 1.500f)')
  })

  it('a preserved-default slider reproduces the legacy rate', () => {
    // Plasma's old default speed 1.0 → new 0.5, which denormalizes back to 1.0.
    expect(denormRate(0.5, SPEED_MAX.Plasma)).toBe(1)
    // Blobs old scale default 0.22 → new 0.44, denormalizing to ~0.22.
    expect(denormRate(0.44, SCALE_MAX.Blobs)).toBeCloseTo(0.22, 5)
  })
})
