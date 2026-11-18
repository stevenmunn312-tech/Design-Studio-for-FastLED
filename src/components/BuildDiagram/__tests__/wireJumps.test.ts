import { describe, expect, it } from 'vitest'
import { withWireJumps } from '../wireJumps'

describe('withWireJumps', () => {
  it('hops a horizontal run over a vertical wire it crosses', () => {
    expect(withWireJumps('M0 50H100', ['M40 0V100'])).toBe('M0 50H33A7 7 0 0 1 47 50H100')
  })

  it('hops a vertical run, and runs in reverse hop the same side', () => {
    expect(withWireJumps('M50 0V100', ['M0 40H100'])).toBe('M50 0V33A7 7 0 0 1 50 47V100')
    expect(withWireJumps('M100 50H0', ['M40 0V100'])).toBe('M100 50H47A7 7 0 0 0 33 50H0')
  })

  it('hops every crossing in order along a bent run', () => {
    expect(withWireJumps('M0 10H100V100', ['M30 0V50', 'M70 0V50', 'M0 60H200']))
      .toBe('M0 10H23A7 7 0 0 1 37 10H63A7 7 0 0 1 77 10H100V53A7 7 0 0 1 100 67V100')
  })

  it('leaves touching, parallel and non-crossing wires alone, text unchanged', () => {
    const path = 'M0 50.123H100'
    expect(withWireJumps(path, ['M100 0V100', 'M0 60H100', 'M150 0V100', 'M40 60V100'])).toBe(path)
  })

  it('shrinks a hop that sits close to a corner, and skips one with no room', () => {
    expect(withWireJumps('M0 50H100', ['M97 0V100'])).toBe('M0 50H94.5A2.5 2.5 0 0 1 99.5 50H100')
    expect(withWireJumps('M0 50H100', ['M99 0V100'])).toBe('M0 50H100')
  })

  it('returns paths it cannot read unchanged', () => {
    expect(withWireJumps('M0 0L10 10', ['M5 0V10'])).toBe('M0 0L10 10')
  })
})

describe('withWireJumps on a bundle', () => {
  it('clears closely spaced wires with one longer hop', () => {
    expect(withWireJumps('M50 0V100', ['M0 40H100', 'M0 49H100', 'M0 58H100']))
      .toBe('M50 0V33A7 16 0 0 1 50 65V100')
  })
})
