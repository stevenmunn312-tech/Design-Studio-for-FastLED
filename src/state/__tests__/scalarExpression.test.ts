import { describe, expect, it } from 'vitest'
import { evaluateScalarExpression } from '../scalarExpression'
import { resolveNodeScalarExpressions, supportsScalarExpression } from '../nodeLibrary'

describe('scalar numeric expressions', () => {
  it('exposes matrix geometry and mathematical constants', () => {
    expect(evaluateScalarExpression('w', 10, 6)).toBe(10)
    expect(evaluateScalarExpression('h', 10, 6)).toBe(6)
    expect(evaluateScalarExpression('num_leds', 10, 6)).toBe(60)
    expect(evaluateScalarExpression('max_x + max_y', 10, 6)).toBe(14)
    expect(evaluateScalarExpression('center_x + center_y', 10, 6)).toBe(7)
    expect(evaluateScalarExpression('min_dim + max_dim', 10, 6)).toBe(16)
    expect(evaluateScalarExpression('aspect', 10, 5)).toBe(2)
    expect(evaluateScalarExpression('tau / pi', 10, 6)).toBeCloseTo(2)
  })

  it('supports safe arithmetic and common math helpers', () => {
    expect(evaluateScalarExpression('floor(w / 2) + max(2, h - 5)', 9, 8)).toBe(7)
    expect(evaluateScalarExpression('(w + h) % 5', 9, 8)).toBe(2)
  })

  it('rejects unknown identifiers, invalid syntax, and non-finite results', () => {
    expect(evaluateScalarExpression('window.innerWidth', 10, 6)).toBeNull()
    expect(evaluateScalarExpression('w +', 10, 6)).toBeNull()
    expect(evaluateScalarExpression('w / 0', 10, 6)).toBeNull()
  })

  it('resolves formulas only for free-entry creative numeric properties', () => {
    expect(supportsScalarExpression('Random', 'max')).toBe(true)
    expect(supportsScalarExpression('BeatSin', 'high')).toBe(true)
    expect(supportsScalarExpression('Noise', 'speed')).toBe(false) // bounded slider
    expect(supportsScalarExpression('MatrixOutput', 'width')).toBe(false)

    expect(resolveNodeScalarExpressions('Random', { min: 'h - 2', max: 'w / 2' }, 20, 10))
      .toEqual({ min: 8, max: 10 })
  })

  it('falls back to the library default while invalid source is being edited', () => {
    expect(resolveNodeScalarExpressions('Random', { min: 0, max: 'w +' }, 20, 10))
      .toEqual({ min: 0, max: 1 })
  })
})
