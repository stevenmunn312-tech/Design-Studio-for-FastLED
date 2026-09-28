import { describe, expect, it } from 'vitest'
import {
  turingBoxMean, turingFieldValue, turingPrefix, turingPrefixLength, turingRadii, turingScaleStep,
  turingSeed, turingSeedValue, turingStep,
} from '../turing'
import { worleyHash } from '../random'

function seeded(W: number, H: number, seed = 7): Float32Array {
  const a = new Float32Array(W * H)
  turingSeed(a, W, H, 0, seed)
  return a
}

function run(a: Float32Array, W: number, H: number, radii: number[], steps: number, stepSize = 0.05): Float32Array {
  const prefix = new Float32Array(turingPrefixLength(W, H))
  for (let i = 0; i < steps; i++) turingStep(a, prefix, W, H, radii, stepSize)
  return a
}

describe('Turing Field multi-scale step', () => {
  it('leaves a flat field flat', () => {
    for (const value of [-0.4, 0, 0.3]) {
      const a = run(new Float32Array(16 * 16).fill(value), 16, 16, turingRadii(4, 1), 5)
      expect([...a].every((v) => v === a[0]), String(value)).toBe(true)
    }
  })

  it('keeps a seeded field inside -1..1 and stretches it to both ends', () => {
    const a = run(seeded(20, 12), 20, 12, turingRadii(3, 1), 40)
    expect(Math.min(...a)).toBeCloseTo(-1, 5)
    expect(Math.max(...a)).toBeCloseTo(1, 5)
    expect([...a].every((v) => v >= -1 - 1e-6 && v <= 1 + 1e-6)).toBe(true)
  })

  it('draws a different pattern with two scales than with four', () => {
    const two = run(seeded(32, 32), 32, 32, turingRadii(2, 1), 30)
    const four = run(seeded(32, 32), 32, 32, turingRadii(4, 1), 30)
    const differing = [...two].filter((v, i) => Math.abs(v - four[i]) > 0.1).length
    expect(differing).toBeGreaterThan(two.length / 10)
  })

  it('steps each pixel toward the activator of the closest scale', () => {
    // One bright pixel on a dark 9×9 canvas with one 1/2 scale. Its own 3×3
    // box outshines the 5×5 surround, so it rises; the ring two pixels out
    // sees it only in the surround, so it falls; the far corner sees neither
    // and holds. After renormalisation that is max, min and in between.
    const W = 9, H = 9
    const a = new Float32Array(W * H).fill(-1)
    a[4 * W + 4] = 1
    run(a, W, H, [1], 1, 0.1)
    expect(a[4 * W + 4]).toBe(1)
    expect(a[2 * W + 4]).toBeCloseTo(-1, 6)
    expect(a[0]).toBeGreaterThan(-1)
    expect(a[0]).toBeLessThan(1)
  })

  it('reads toroidal box means from the summed-area table', () => {
    const W = 7, H = 5
    const a = seeded(W, H, 3)
    const P = new Float32Array(turingPrefixLength(W, H))
    const mean = turingPrefix(a, P, W, H)
    for (const [rx, ry] of [[0, 0], [1, 1], [3, 2], [2, 0]]) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let sum = 0
        for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
          sum += a[((y + dy + H) % H) * W + ((x + dx + W) % W)]
        }
        const expected = sum / ((2 * rx + 1) * (2 * ry + 1))
        expect(turingBoxMean(P, W, H, x, y, rx, ry) + mean, `${rx},${ry} at ${x},${y}`).toBeCloseTo(expected, 5)
      }
    }
  })

  it('skips scales that clamp to one box on a small canvas instead of freezing', () => {
    // On 6×6 every radius clamps to 2, so radius 2 against 4 compares a box
    // with itself. Alone it moves nothing, leaving only the renormalisation;
    // beside radius 1 it must not win, or no pixel would ever move either.
    const stretchedOnly = run(seeded(6, 6), 6, 6, [2], 4)
    const withFinerScale = run(seeded(6, 6), 6, 6, [1, 2], 4)
    const once = run(seeded(6, 6), 6, 6, [2], 1)
    expect([...stretchedOnly].every((v, i) => Math.abs(v - once[i]) < 1e-5)).toBe(true)
    expect([...withFinerScale].some((v, i) => Math.abs(v - stretchedOnly[i]) > 0.01)).toBe(true)
  })

  it('handles a single-row string and a one-pixel canvas', () => {
    const string = run(seeded(24, 1), 24, 1, turingRadii(3, 1), 10)
    expect([...string].every(Number.isFinite)).toBe(true)
    const dot = run(new Float32Array([0.25]), 1, 1, turingRadii(3, 1), 3)
    expect(dot[0]).toBe(0.25)
  })

  it('bakes radii finest first and clamps both properties', () => {
    expect(turingRadii(3, 1)).toEqual([1, 2, 4])
    expect(turingRadii(4, 1.5)).toEqual([2, 3, 6, 12])
    expect(turingRadii(9, 20)).toEqual([8, 16, 32, 64, 128])
    expect(turingRadii(1, 0)).toEqual([1, 2])
    expect(turingRadii('nope', undefined)).toEqual([1, 2, 4])
  })

  it('gives coarser scales larger steps', () => {
    // Rounded to float32, as the sketch computes it.
    expect(turingScaleStep(0.1, 0, 5)).toBe(Math.fround(0.02))
    expect(turingScaleStep(0.1, 4, 5)).toBe(Math.fround(0.1))
  })

  it('starts from the lattice hash, exact in float32, with a new start per epoch', () => {
    expect(turingSeedValue(3, 5, 0, 11)).toBe(worleyHash(3, 5, 11) * 2 - 1)
    expect(turingSeedValue(3, 5, 2, 11)).toBe(worleyHash(3 + 62, 5 - 34, 11) * 2 - 1)
    expect(Math.fround(turingSeedValue(3, 5, 0, 11))).toBe(turingSeedValue(3, 5, 0, 11))
  })

  it('maps state onto 0..1', () => {
    expect(turingFieldValue(-1)).toBe(0)
    expect(turingFieldValue(1)).toBe(1)
    expect(turingFieldValue(0)).toBe(0.5)
    expect(turingFieldValue(3)).toBe(1)
  })
})
