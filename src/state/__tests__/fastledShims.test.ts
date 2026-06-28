import { describe, it, expect } from 'vitest'
import { makeShims, cppRewriteShims, usesShims, SHIM_NAMES, CPP_SHIM_HELPERS } from '../fastledShims'

describe('makeShims', () => {
  const s = makeShims(0)

  it('sin8 follows a sine centred at 128', () => {
    expect(s.sin8(0)).toBe(128)    // sin(0)   → mid
    expect(s.sin8(64)).toBe(255)   // sin(π/2) → peak (clamped)
    expect(s.sin8(128)).toBe(128)  // sin(π)   → mid
    expect(s.sin8(192)).toBe(0)    // sin(3π/2)→ trough
  })

  it('cos8 leads sin8 by a quarter turn', () => {
    expect(s.cos8(0)).toBe(255)    // cos(0) → peak
    expect(s.cos8(64)).toBe(128)
  })

  it('sin8 wraps its argument at 256', () => {
    expect(s.sin8(256)).toBe(s.sin8(0))
    expect(s.sin8(320)).toBe(s.sin8(64))
  })

  it('scale8 is an 8-bit scale (v*s >> 8)', () => {
    expect(s.scale8(255, 128)).toBe(127)
    expect(s.scale8(255, 255)).toBe(254)
    expect(s.scale8(0, 200)).toBe(0)
  })

  it('qadd8 / qsub8 saturate at the byte bounds', () => {
    expect(s.qadd8(200, 100)).toBe(255)
    expect(s.qadd8(10, 20)).toBe(30)
    expect(s.qsub8(50, 100)).toBe(0)
    expect(s.qsub8(100, 40)).toBe(60)
  })

  it('beatsin8 sits mid-range at t=0 and respects lo/hi', () => {
    expect(makeShims(0).beatsin8(60)).toBe(128)        // mid of 0..255
    expect(makeShims(0).beatsin8(60, 0, 100)).toBe(50) // mid of 0..100
  })

  it('beatsin8 advances with time', () => {
    // Quarter beat at 60bpm = 0.25s → sine peak.
    expect(makeShims(0.25).beatsin8(60, 0, 100)).toBe(100)
  })

  it('triwave8 ramps up then down across the byte domain', () => {
    expect(s.triwave8(0)).toBe(0)
    expect(s.triwave8(64)).toBe(128)
    expect(s.triwave8(128)).toBe(255)   // peak at the midpoint
    expect(s.triwave8(192)).toBe(127)
    expect(s.triwave8(255)).toBe(1)
  })

  it('quadwave8 / cubicwave8 keep the triangle endpoints', () => {
    expect(s.quadwave8(0)).toBe(0)
    expect(s.quadwave8(128)).toBe(255)
    expect(s.cubicwave8(0)).toBe(0)
    expect(s.cubicwave8(128)).toBe(255)
  })

  it('ease8InOutCubic is smoothstep (0→0, 128→128, 255→255)', () => {
    expect(s.ease8InOutCubic(0)).toBe(0)
    expect(s.ease8InOutCubic(128)).toBe(128)
    expect(s.ease8InOutCubic(255)).toBe(255)
  })

  it('ease8InOutQuad pins the endpoints', () => {
    expect(s.ease8InOutQuad(0)).toBe(0)
    expect(s.ease8InOutQuad(255)).toBe(255)
  })

  it('blend8 mixes two bytes by a 0–255 fraction', () => {
    expect(s.blend8(0, 255, 0)).toBe(0)
    expect(s.blend8(0, 255, 255)).toBe(254)
    expect(s.blend8(0, 255, 128)).toBe(127)
  })

  it('lerp8by8 interpolates up and down', () => {
    expect(s.lerp8by8(0, 255, 128)).toBe(127)
    expect(s.lerp8by8(100, 200, 128)).toBe(150)
    expect(s.lerp8by8(200, 100, 128)).toBe(150)
  })

  it('lerp16by16 interpolates over the 16-bit domain', () => {
    expect(s.lerp16by16(0, 65535, 32768)).toBe(32767)
    expect(s.lerp16by16(0, 1000, 65535)).toBe(999)
  })

  it('sqrt16 is an integer square root', () => {
    expect(s.sqrt16(256)).toBe(16)
    expect(s.sqrt16(255)).toBe(15)
    expect(s.sqrt16(65535)).toBe(255)
  })

  it('nscale8 scales a byte like scale8', () => {
    expect(s.nscale8(255, 128)).toBe(127)
    expect(s.nscale8(255, 255)).toBe(254)
  })
})

describe('cppRewriteShims', () => {
  it('rewrites shim calls to the float wrappers', () => {
    expect(cppRewriteShims('sin8(x) + cos8(y)')).toBe('_fsin8(x) + _fcos8(y)')
    expect(cppRewriteShims('scale8(v, s)')).toBe('_fscale8(v, s)')
  })

  it('does not clip beatsin8 with the sin8 rule', () => {
    expect(cppRewriteShims('beatsin8(60, 0, 255)')).toBe('_fbeatsin8(60, 0, 255)')
    // and a later sin8 pass must not touch the already-rewritten name
    expect(cppRewriteShims('beatsin8(60) + sin8(x)')).toBe('_fbeatsin8(60) + _fsin8(x)')
  })

  it('leaves non-shim trig alone', () => {
    expect(cppRewriteShims('sin(x) + cos(y)')).toBe('sin(x) + cos(y)')
  })

  it('rewrites nscale8 without the scale8 rule clipping it', () => {
    expect(cppRewriteShims('nscale8(v, s)')).toBe('_fnscale8(v, s)')
    expect(cppRewriteShims('scale8(v, s) + nscale8(a, b)')).toBe('_fscale8(v, s) + _fnscale8(a, b)')
  })

  it('rewrites the new wave/easing/blend shims', () => {
    expect(cppRewriteShims('cubicwave8(t) + triwave8(x)')).toBe('_fcubicwave8(t) + _ftriwave8(x)')
    expect(cppRewriteShims('lerp8by8(a, b, f)')).toBe('_flerp8by8(a, b, f)')
  })
})

describe('usesShims', () => {
  it('detects shim usage', () => {
    expect(usesShims('sin8(r*200)')).toBe(true)
    expect(usesShims('beatsin16(60)')).toBe(true)
  })
  it('is false for plain Math expressions', () => {
    expect(usesShims('sin(x*6+t)*0.5+0.5')).toBe(false)
  })
})

describe('CPP_SHIM_HELPERS', () => {
  it('defines a float wrapper for every shim', () => {
    for (const name of SHIM_NAMES) {
      expect(CPP_SHIM_HELPERS).toContain(`_f${name}(`)
    }
  })
})
