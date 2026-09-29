// The Waveform node's drawing, shared by the preview evaluator and mirrored
// line for line by the firmware emitter in src/nodes/audioReactive/codegen.ts.
// Constants are exported so the two cannot drift on a number.

import { type Frame, type Palette, samplePalette } from '../ledColor'
import { clamp01 } from './frames'

/** Samples the audio payload and the sketch's `_audioWave` both carry. */
export const WAVE_SAMPLES = 128
export const WAVE_STYLES = ['line', 'filled', 'mirror', 'ring'] as const
export type WaveStyle = (typeof WAVE_STYLES)[number]

export const WAVE_GAIN_MIN = 0.25
export const WAVE_GAIN_MAX = 8
export const WAVE_THICKNESS_MIN = 0.5
export const WAVE_THICKNESS_MAX = 4
export const WAVE_SMOOTHING_MAX = 0.95
/** Palette position runs 0.14 + 0.82 x |sample|, as Spectrum Visualizer's does. */
export const WAVE_PALETTE_BASE = 0.14
export const WAVE_PALETTE_SPAN = 0.82
/** The ring rides between 20% and 90% of the inscribed radius. */
export const WAVE_RING_BASE = 0.55
export const WAVE_RING_SPAN = 0.35
/** Extra band on the ring so a one-pixel ring does not break on diagonals. */
export const WAVE_RING_SLACK = 0.35

/**
 * Peak-preserving decimation to `WAVE_SAMPLES`: from each block of
 * `floor(n / 128)` samples keep the one furthest from zero (the first on a
 * tie). The firmware does the same over `Sample::pcm()` / 32768.
 */
export function decimateWave(pcm: ArrayLike<number>, out: number[] | Float32Array): void {
  const n = pcm.length
  const block = Math.max(1, Math.floor(n / WAVE_SAMPLES))
  for (let i = 0; i < WAVE_SAMPLES; i++) {
    let best = 0
    let bestAbs = -1
    for (let j = 0; j < block; j++) {
      const index = i * block + j
      const v = index < n ? pcm[index] : 0
      if (Math.abs(v) > bestAbs) {
        bestAbs = Math.abs(v)
        best = v
      }
    }
    out[i] = best
  }
}

export interface WaveformState {
  smoothed: Float32Array
  lastT: number
  w: number
  h: number
}

export function createWaveformState(W: number, H: number): WaveformState {
  return { smoothed: new Float32Array(WAVE_SAMPLES), lastT: -1, w: W, h: H }
}

export interface WaveformParams {
  style: string
  gain: number
  thickness: number
  smoothing: number
}

/** Draw the waveform over `frame` in place; unlit pixels keep the base. */
export function drawWaveform(
  frame: Frame,
  state: WaveformState,
  samples: readonly number[] | undefined,
  params: WaveformParams,
  palette: Palette,
  t: number,
  W: number,
  H: number,
): void {
  const dt = state.lastT < 0 ? 1 / 60 : Math.max(0, Math.min(0.1, t - state.lastT))
  state.lastT = t
  const gain = Math.max(WAVE_GAIN_MIN, Math.min(WAVE_GAIN_MAX, params.gain))
  const thickness = Math.max(WAVE_THICKNESS_MIN, Math.min(WAVE_THICKNESS_MAX, params.thickness))
  const retain = Math.pow(Math.max(0, Math.min(WAVE_SMOOTHING_MAX, params.smoothing)), dt * 60)
  for (let i = 0; i < WAVE_SAMPLES; i++) {
    const target = samples ? (samples[i] ?? 0) : 0
    state.smoothed[i] = state.smoothed[i] * retain + target * (1 - retain)
  }

  const at = (pos: number, wrap: boolean): number => {
    let i0 = Math.floor(pos)
    if (i0 > WAVE_SAMPLES - 1) i0 = WAVE_SAMPLES - 1
    const i1 = wrap ? (i0 + 1) % WAVE_SAMPLES : Math.min(WAVE_SAMPLES - 1, i0 + 1)
    const mix = pos - Math.floor(pos)
    const v = (state.smoothed[i0] * (1 - mix) + state.smoothed[i1] * mix) * gain
    return Math.max(-1, Math.min(1, v))
  }
  const colorFor = (amount: number) => samplePalette(palette, WAVE_PALETTE_BASE + clamp01(amount) * WAVE_PALETTE_SPAN)
  const paint = (x: number, y: number, amount: number) => {
    const c = colorFor(amount)
    const px = frame[y][x]
    px.r = c.r
    px.g = c.g
    px.b = c.b
  }

  if (params.style === 'ring') {
    const minR = Math.min(W, H) / 2
    const cx = (W - 1) / 2
    const cy = (H - 1) / 2
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx
        const dy = y - cy
        let frac = Math.atan2(dy, dx) / (2 * Math.PI)
        frac -= Math.floor(frac)
        const v = at(frac * WAVE_SAMPLES, true)
        const target = minR * WAVE_RING_BASE + v * minR * WAVE_RING_SPAN
        if (Math.abs(Math.hypot(dx, dy) - target) <= thickness * 0.5 + WAVE_RING_SLACK) paint(x, y, Math.abs(v))
      }
    }
    return
  }

  const yc = (H - 1) / 2
  const values = new Array<number>(W)
  const lineY = new Array<number>(W)
  for (let x = 0; x < W; x++) {
    values[x] = at(W <= 1 ? 0 : (x / (W - 1)) * (WAVE_SAMPLES - 1), false)
    lineY[x] = yc - values[x] * yc
  }
  for (let x = 0; x < W; x++) {
    const next = Math.min(W - 1, x + 1)
    const lo = Math.min(lineY[x], lineY[next])
    const hi = Math.max(lineY[x], lineY[next])
    const amount = Math.abs(values[x])
    for (let y = 0; y < H; y++) {
      let lit: boolean
      if (params.style === 'filled') lit = y >= Math.min(lo, yc) - 0.5 && y <= Math.max(hi, yc) + 0.5
      else if (params.style === 'mirror') lit = Math.abs(y - yc) <= Math.max(Math.abs(yc - lo), Math.abs(yc - hi)) + 0.5
      else lit = y >= lo - thickness * 0.5 && y <= hi + thickness * 0.5
      if (lit) paint(x, y, amount)
    }
  }
}
