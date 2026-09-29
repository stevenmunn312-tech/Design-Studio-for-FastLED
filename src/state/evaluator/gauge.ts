import { trackIndices } from './stringTrack'

// Gauge geometry shared by the preview and the sketch. A gauge is a list of
// cells laid out along one axis (bar, dot) or around the LED ring's circle
// (ring, arc). Each cell knows the slice of the 0–1 value it stands for, so
// one coverage rule fills all four styles.

export const GAUGE_STYLES = ['bar', 'ring', 'arc', 'dot'] as const
export type GaugeStyle = typeof GAUGE_STYLES[number]
export const GAUGE_DIRECTIONS = ['right', 'left', 'up', 'down'] as const
export type GaugeDirection = typeof GAUGE_DIRECTIONS[number]
export const GAUGE_SEGMENTS_MAX = 32
/** After the hold, the peak marker falls this much of the range each second. */
export const GAUGE_PEAK_FALL = 1

export const gaugeStyle = (v: unknown): GaugeStyle =>
  (GAUGE_STYLES as readonly string[]).includes(String(v)) ? (v as GaugeStyle) : 'bar'
export const gaugeDirection = (v: unknown): GaugeDirection =>
  (GAUGE_DIRECTIONS as readonly string[]).includes(String(v)) ? (v as GaugeDirection) : 'right'
export const gaugeSegments = (v: unknown) => Math.max(0, Math.min(GAUGE_SEGMENTS_MAX, Math.floor(Number(v) || 0)))

export interface GaugeCell {
  /** Canvas index. */
  idx: number
  /** Where along the gauge this cell's slice starts, and how wide it is (0–1). */
  start: number
  span: number
  /** Centre of the slice: the palette position. */
  frac: number
  /** Position and count along the bar axis; a dot needs them. */
  k: number
  n: number
}

export interface GaugeLayout {
  style: GaugeStyle
  direction: GaugeDirection
  thickness: number
  ringLeds: number
  arcStart: number
  arcSweep: number
}

/** Rows or columns across the bar that are lit: the middle `thickness` share, at least the centre. */
export function gaugeBand(cross: number, thickness: number): (c: number) => boolean {
  const limit = Math.max(0.5, Math.max(0, Math.min(1, thickness)) * cross * 0.5)
  return (c) => Math.abs(c + 0.5 - cross * 0.5) <= limit
}

export function gaugeCells(L: GaugeLayout, W: number, H: number): GaugeCell[] {
  const cells: GaugeCell[] = []
  if (L.style === 'ring' || L.style === 'arc') {
    const idx = trackIndices('ring', W, H, L.ringLeds)
    const n = idx.length, step = 360 / n
    const sweep = L.style === 'ring' ? 360 : Math.max(1, Math.min(360, L.arcSweep))
    for (let k = 0; k < n; k++) {
      const off = (((k * step - L.arcStart) % 360) + 360) % 360
      if (off >= sweep) continue
      cells.push({ idx: idx[k], start: off / sweep, span: step / sweep, frac: Math.min(1, (off + step / 2) / sweep), k, n })
    }
    return cells
  }
  const horizontal = L.direction === 'right' || L.direction === 'left'
  const N = horizontal ? W : H, cross = horizontal ? H : W
  const inBand = gaugeBand(cross, L.thickness)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inBand(horizontal ? y : x)) continue
      const k = L.direction === 'right' ? x : L.direction === 'left' ? W - 1 - x : L.direction === 'down' ? y : H - 1 - y
      cells.push({ idx: y * W + x, start: k / N, span: 1 / N, frac: (k + 0.5) / N, k, n: N })
    }
  }
  return cells
}

/** How much of a cell the value fills, 0–1. */
export function gaugeCoverage(style: GaugeStyle, c: GaugeCell, value: number, segments: number): number {
  if (style === 'dot') return Math.max(0, Math.min(1, 1 - Math.abs(value * (c.n - 1) - c.k)))
  if (segments > 0) {
    const seg = Math.min(segments - 1, Math.floor(c.frac * segments))
    return seg < Math.floor(value * segments + 0.5) ? 1 : 0
  }
  return Math.max(0, Math.min(1, (value - c.start) / c.span))
}

/** True for the cell a peak marker at `peak` sits in. */
export function gaugeMarks(c: GaugeCell, peak: number): boolean {
  return (peak >= c.start && peak < c.start + c.span) || (peak >= 1 && c.start + c.span >= 1 - 1e-9)
}

export interface GaugePeak { peak: number; stamp: number; last: number }

/** Advance the held peak. Returns the peak to draw, or -1 when the hold is off. */
export function stepGaugePeak(s: GaugePeak, value: number, hold: number, t: number): number {
  if (!(hold > 0)) { s.peak = value; s.stamp = t; s.last = t; return -1 }
  if (t < s.last - 0.001) { s.peak = value; s.stamp = t }
  const dt = Math.max(0, t - s.last)
  s.last = t
  if (value >= s.peak) { s.peak = value; s.stamp = t }
  else if (t - s.stamp > hold) s.peak = Math.max(value, s.peak - GAUGE_PEAK_FALL * dt)
  return s.peak
}

/** Blend `top` over `base` by `q` of 255, truncating like the sketch's integer maths. */
export const gaugeMix = (base: number, top: number, q: number) => base + Math.trunc(((top - base) * q) / 255)

/**
 * Coverage as a byte. The small lift keeps a full gauge at 255: dividing by a
 * cell's span leaves coverage a hair under 1, and truncating that would dim it.
 */
export const GAUGE_Q_LIFT = 0.001
export const gaugeQ = (coverage: number) => Math.min(255, Math.floor(coverage * 255 + GAUGE_Q_LIFT))
