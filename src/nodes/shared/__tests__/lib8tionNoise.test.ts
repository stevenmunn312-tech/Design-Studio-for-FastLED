import { describe, expect, it } from 'vitest'
import { inoise8x3, scale8 } from '../lib8tion'

// The plain transcription of FastLED 3.10.5's 3-D `inoise8` (noise.cpp.hpp),
// one line per line of the C. `inoise8x3` in lib8tion.ts is the same function
// written for speed, since a field node calls it for every octave of every LED
// on every frame; this is what it must keep agreeing with, bit for bit.

const NOISE_P = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,151]

const i8 = (v: number) => (v << 24) >> 24

function ease8InOutQuad(i: number): number {
  let j = i
  if (j & 0x80) j = 255 - j
  let jj2 = (scale8(j, j) << 1) & 0xff
  if (i & 0x80) jj2 = 255 - jj2
  return jj2
}

const avg7 = (i: number, j: number) => i8((i >> 1) + (j >> 1) + (i & 1))

function grad8(hash: number, x: number, y: number, z: number): number {
  const n = (v: number) => i8(-v)
  switch (hash & 0xf) {
    case 0: return avg7(x, y)
    case 1: return avg7(n(x), y)
    case 2: return avg7(x, n(y))
    case 3: return avg7(n(x), n(y))
    case 4: return avg7(x, z)
    case 5: return avg7(n(x), z)
    case 6: return avg7(x, n(z))
    case 7: return avg7(n(x), n(z))
    case 8: return avg7(y, z)
    case 9: return avg7(n(y), z)
    case 10: return avg7(y, n(z))
    case 11: return avg7(n(y), n(z))
    case 12: return avg7(x, y)
    case 13: return avg7(n(x), y)
    case 14: return avg7(x, n(y))
    default: return avg7(n(x), n(y))
  }
}

function lerp7by8(a: number, b: number, frac: number): number {
  return b > a ? i8(a + scale8((b - a) & 0xff, frac)) : i8(a - scale8((a - b) & 0xff, frac))
}

function reference(x: number, y: number, z: number): number {
  x &= 0xffff; y &= 0xffff; z &= 0xffff
  const X = x >> 8, Y = y >> 8, Z = z >> 8
  const A = (NOISE_P[X] + Y) & 0xff, AA = (NOISE_P[A] + Z) & 0xff, AB = (NOISE_P[A + 1] + Z) & 0xff
  const B = (NOISE_P[X + 1] + Y) & 0xff, BA = (NOISE_P[B] + Z) & 0xff, BB = (NOISE_P[B + 1] + Z) & 0xff
  const u = ease8InOutQuad(x & 0xff), v = ease8InOutQuad(y & 0xff), w = ease8InOutQuad(z & 0xff)
  const xx = (x & 0xff) >> 1, yy = (y & 0xff) >> 1, zz = (z & 0xff) >> 1
  const xn = i8(xx - 128), yn = i8(yy - 128), zn = i8(zz - 128)
  const X1 = lerp7by8(grad8(NOISE_P[AA], xx, yy, zz), grad8(NOISE_P[BA], xn, yy, zz), u)
  const X2 = lerp7by8(grad8(NOISE_P[AB], xx, yn, zz), grad8(NOISE_P[BB], xn, yn, zz), u)
  const X3 = lerp7by8(grad8(NOISE_P[AA + 1], xx, yy, zn), grad8(NOISE_P[BA + 1], xn, yy, zn), u)
  const X4 = lerp7by8(grad8(NOISE_P[AB + 1], xx, yn, zn), grad8(NOISE_P[BB + 1], xn, yn, zn), u)
  const n = i8(lerp7by8(lerp7by8(X1, X2, v), lerp7by8(X3, X4, v), w) + 64) & 0xff
  return Math.min(255, n + n)
}

/** Counts the inputs where the two disagree, and keeps the first. */
function mismatches(inputs: Iterable<[number, number, number]>): { count: number; first: string | null } {
  let count = 0
  let first: string | null = null
  for (const [x, y, z] of inputs) {
    const want = reference(x, y, z)
    const got = inoise8x3(x, y, z)
    if (want === got) continue
    count += 1
    first ??= `inoise8(${x}, ${y}, ${z}) is ${want}, got ${got}`
  }
  return { count, first }
}

describe('inoise8x3', () => {
  it('equals the plain transcription on a lattice that reaches every cell edge', () => {
    function* lattice(): Generator<[number, number, number]> {
      // Low bytes that cross each ease and sign boundary, high bytes that wrap.
      const low = [0, 1, 2, 63, 64, 126, 127, 128, 129, 191, 192, 254, 255]
      const high = [0, 1, 37, 127, 128, 200, 254, 255]
      const values = high.flatMap((h) => low.map((l) => (h << 8) | l))
      for (const x of values) for (const y of values) for (let k = 0; k < values.length; k += 7) yield [x, y, values[k]]
    }
    expect(mismatches(lattice())).toEqual({ count: 0, first: null })
  })

  it('equals it on a million scattered inputs, beyond 16 bits and below zero included', () => {
    function* scattered(): Generator<[number, number, number]> {
      let seed = 0x9e3779b9
      const next = () => {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
        return seed
      }
      // The callers pass whatever (x * freq) >> n comes to: any 32-bit integer.
      for (let i = 0; i < 1_000_000; i++) yield [next() >> (i % 13), next() >> (i % 7), next() & 0xffff]
    }
    expect(mismatches(scattered())).toEqual({ count: 0, first: null })
  }, 30_000)
})
