import { describe, expect, it } from 'vitest'
import { blankFrame } from '../evaluator/frames'
import {
  WAVE_SAMPLES,
  WAVE_STYLES,
  createWaveformState,
  decimateWave,
  drawWaveform,
} from '../evaluator/waveform'
import type { RGB } from '../ledColor'

const WHITE: RGB[] = [{ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 }]
const W = 16
const H = 16

function render(style: string, samples: readonly number[] | undefined, extra: { gain?: number; thickness?: number } = {}) {
  const frame = blankFrame(W, H)
  const state = createWaveformState(W, H)
  drawWaveform(frame, state, samples, { style, gain: extra.gain ?? 1, thickness: extra.thickness ?? 1, smoothing: 0 }, WHITE, 0, W, H)
  return frame
}
const lit = (frame: ReturnType<typeof blankFrame>) => frame.flat().filter((px) => px.r > 0).length
const sine = (amp: number) => Array.from({ length: WAVE_SAMPLES }, (_, i) => amp * Math.sin((2 * Math.PI * i) / WAVE_SAMPLES))

describe('decimateWave', () => {
  it('keeps the sample furthest from zero in each block, first on a tie', () => {
    const pcm = new Float32Array(512)
    pcm[1] = 0.3
    pcm[2] = -0.6
    pcm[4] = 0.5
    pcm[5] = -0.5
    const out = new Float32Array(WAVE_SAMPLES)
    decimateWave(pcm, out)
    expect(out[0]).toBeCloseTo(-0.6, 6)
    expect(out[1]).toBeCloseTo(0.5, 6)
    expect(out[2]).toBe(0)
  })

  it('pads a short chunk with silence and passes a 128-sample chunk straight through', () => {
    const out = new Float32Array(WAVE_SAMPLES)
    decimateWave([0.25, -0.5], out)
    expect(out[0]).toBe(0.25)
    expect(out[1]).toBe(-0.5)
    expect(out[2]).toBe(0)
    const straight = Float32Array.from({ length: WAVE_SAMPLES }, (_, i) => i / 200)
    decimateWave(straight, out)
    expect(Array.from(out)).toEqual(Array.from(straight))
  })
})

describe('drawWaveform', () => {
  it('draws a flat centre line for silence and for missing samples', () => {
    for (const samples of [undefined, new Array(WAVE_SAMPLES).fill(0)]) {
      const frame = render('line', samples)
      // A 16-row canvas has its centre between rows 7 and 8, so both light.
      expect(frame[7].every((px) => px.r === 255) || frame[8].every((px) => px.r === 255)).toBe(true)
      expect(lit(frame)).toBeLessThanOrEqual(W * 2)
    }
  })

  it('every style changes with the samples, and unlit pixels keep the base', () => {
    for (const style of WAVE_STYLES) {
      const quiet = render(style, sine(0.05))
      const loud = render(style, sine(0.9))
      expect(lit(loud), style).not.toBe(lit(quiet))
    }
    const base = blankFrame(W, H)
    base[0][0] = { r: 9, g: 8, b: 7 }
    const state = createWaveformState(W, H)
    drawWaveform(base, state, sine(0.05), { style: 'line', gain: 1, thickness: 1, smoothing: 0 }, WHITE, 0, W, H)
    expect(base[0][0]).toEqual({ r: 9, g: 8, b: 7 })
  })

  it('draws filled and mirror styles heavier than a line, and a mirror symmetric about the centre', () => {
    const samples = sine(0.8)
    expect(lit(render('filled', samples))).toBeGreaterThan(lit(render('line', samples)))
    const mirror = render('mirror', samples)
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) expect(mirror[y][x].r).toBe(mirror[H - 1 - y][x].r)
  })

  it('draws a ring whose radius follows the samples and is periodic in angle', () => {
    const flat = render('ring', new Array(WAVE_SAMPLES).fill(0))
    const swollen = render('ring', new Array(WAVE_SAMPLES).fill(0.9))
    const centroid = (frame: ReturnType<typeof blankFrame>) => {
      let sum = 0
      let count = 0
      frame.forEach((row, y) => row.forEach((px, x) => {
        if (px.r > 0) {
          sum += Math.hypot(x - 7.5, y - 7.5)
          count++
        }
      }))
      return sum / count
    }
    expect(centroid(swollen)).toBeGreaterThan(centroid(flat))
    expect(lit(flat)).toBeGreaterThan(8)
  })

  it('applies gain, clamped, and thickens the line', () => {
    const quiet = render('line', sine(0.1), { gain: 1 })
    const boosted = render('line', sine(0.1), { gain: 8 })
    expect(lit(boosted)).toBeGreaterThan(lit(quiet))
    expect(lit(render('line', sine(0.1), { gain: 99 }))).toBe(lit(boosted))
    expect(lit(render('line', sine(0.5), { thickness: 3 }))).toBeGreaterThan(lit(render('line', sine(0.5), { thickness: 1 })))
  })

  it('smooths over time and stays deterministic at a fixed time', () => {
    const state = createWaveformState(W, H)
    const params = { style: 'line', gain: 1, thickness: 1, smoothing: 0.9 }
    drawWaveform(blankFrame(W, H), state, new Array(WAVE_SAMPLES).fill(1), params, WHITE, 0, W, H)
    const after = state.smoothed[0]
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(1)
    const a = render('filled', sine(0.6))
    const b = render('filled', sine(0.6))
    expect(a).toEqual(b)
  })
})
