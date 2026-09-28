import { pathPoint } from './pathShapes'
import { evaluatorCache } from './evaluator/memory'

/**
 * Outlines, their discrete Fourier transform, and the epicycle sum for the
 * Fourier Epicycles node. Everything here runs in TypeScript: the preview
 * reads the coefficient table directly and the generator bakes the same table
 * into the sketch as numbers, so outline names and custom point text never
 * reach C++.
 */

/** Append-only: the generator bakes a coefficient table, not an outline id. */
export const FOURIER_OUTLINES = [
  'circle', 'heart', 'lissajous', 'rose', 'star', 'square', 'infinity', 'custom',
] as const
export type FourierOutline = typeof FOURIER_OUTLINES[number]

/** Points each outline is sampled at before the transform. */
export const FOURIER_SAMPLES = 128
export const FOURIER_MAX_HARMONICS_MIN = 4
export const FOURIER_MAX_HARMONICS_MAX = 64
/** Custom outlines take 3 to this many points. */
export const FOURIER_CUSTOM_POINTS_MAX = 128
/** A coefficient below this fraction of the largest one is numerical noise. */
export const FOURIER_NEGLIGIBLE = 1e-6

// Drawing constants, read by the preview and interpolated into the sketch.
/** Knob ranges: turns per second, 0..1 of the half canvas, pen pixels. */
export const FOURIER_SPEED_MAX = 2
export const FOURIER_SCALE_MIN = 0.1
export const FOURIER_THICKNESS_MIN = 0.5
export const FOURIER_THICKNESS_MAX = 4
/** Guide circles: half their line width in pixels, and their brightness. */
export const FOURIER_RING_HALF_WIDTH = 0.25
export const FOURIER_RING_LEVEL = 0.35
/** A circle smaller than this many pixels is not drawn. */
export const FOURIER_RING_MIN_RADIUS = 0.5
/** Most trail splats between two frames' pen positions. */
export const FOURIER_TRAIL_STEPS_MAX = 64
/** More turns than this between frames is a restart or seek, not motion. */
export const FOURIER_TRAIL_JUMP = 0.25

export interface FourierTerm {
  /** Integer turns of this circle per turn of the outline, negative clockwise. */
  frequency: number
  /** Radius in outline units, where the outline fills -1..1. */
  amplitude: number
  /** Starting angle, radians. */
  phase: number
}

interface Point { x: number; y: number }

export function fourierOutline(value: unknown): FourierOutline {
  return typeof value === 'string' && (FOURIER_OUTLINES as readonly string[]).includes(value)
    ? value as FourierOutline
    : 'heart'
}

export function fourierMaxHarmonics(value: unknown): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n)
    ? Math.max(FOURIER_MAX_HARMONICS_MIN, Math.min(FOURIER_MAX_HARMONICS_MAX, n))
    : 32
}

/**
 * Custom outline text as points: numbers separated by commas, spaces or
 * semicolons, read in x,y pairs, each clamped to -1..1. Anything else —
 * a non-number, an odd count, fewer than 3 or more than
 * `FOURIER_CUSTOM_POINTS_MAX` points, or points with no length between
 * them — is `null`, and the node draws the circle instead.
 */
export function parseFourierPoints(text: unknown): Point[] | null {
  if (typeof text !== 'string') return null
  const tokens = text.trim().split(/[\s,;]+/).filter(Boolean)
  if (tokens.length % 2 !== 0) return null
  const values = tokens.map(Number)
  if (values.some((value) => !Number.isFinite(value))) return null
  const points: Point[] = []
  for (let i = 0; i < values.length; i += 2) {
    points.push({ x: Math.max(-1, Math.min(1, values[i])), y: Math.max(-1, Math.min(1, values[i + 1])) })
  }
  if (points.length < 3 || points.length > FOURIER_CUSTOM_POINTS_MAX) return null
  return closedLength(points) > 0 ? points : null
}

function closedLength(points: readonly Point[]): number {
  let length = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    length += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return length
}

/** `count` points spaced evenly by length round a closed polygon. */
function resampleClosed(points: readonly Point[], count: number): Point[] {
  const total = closedLength(points)
  const out: Point[] = []
  let segment = 0, walked = 0
  for (let n = 0; n < count; n++) {
    const target = total * n / count
    for (;;) {
      const a = points[segment], b = points[(segment + 1) % points.length]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (walked + length >= target || segment === points.length - 1) {
        const u = length > 0 ? (target - walked) / length : 0
        out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })
        break
      }
      walked += length
      segment++
    }
  }
  return out
}

function regularStar(): Point[] {
  const inner = Math.sin(Math.PI / 10) / Math.sin(7 * Math.PI / 10)
  return Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? 1 : inner
    const angle = Math.PI / 2 + i * Math.PI / 5
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
  })
}

/** Centre a built-in outline on its bounding box and scale it to fill -1..1. */
function fitUnitSquare(points: Point[]): Point[] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const half = Math.max(maxX - minX, maxY - minY) / 2
  return points.map((p) => ({ x: (p.x - cx) / half, y: (p.y - cy) / half }))
}

/**
 * The outline as `FOURIER_SAMPLES` points. Curves are sampled evenly in their
 * parameter, polygons evenly by length. A custom outline keeps the author's
 * coordinates; an invalid one is the circle.
 */
export function fourierOutlineSamples(outlineValue: unknown, customPoints?: unknown): Point[] {
  const outline = fourierOutline(outlineValue)
  const N = FOURIER_SAMPLES
  if (outline === 'custom') {
    const points = parseFourierPoints(customPoints)
    return points ? resampleClosed(points, N) : fourierOutlineSamples('circle')
  }
  if (outline === 'star') return fitUnitSquare(resampleClosed(regularStar(), N))
  if (outline === 'square') {
    return resampleClosed([{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }], N)
  }
  if (outline === 'infinity') {
    return fitUnitSquare(Array.from({ length: N }, (_, n) => {
      const a = 2 * Math.PI * n / N, d = 1 + Math.sin(a) ** 2
      return { x: Math.cos(a) / d, y: Math.sin(a) * Math.cos(a) / d }
    }))
  }
  return fitUnitSquare(Array.from({ length: N }, (_, n) => pathPoint(outline, n / N)))
}

/**
 * Discrete Fourier transform of a closed outline, the largest `maxHarmonics`
 * terms first. Ties order by lower |frequency|, then the positive one, so the
 * table is the same on every machine. Negligible terms are dropped, so a
 * circle is a single term.
 */
export function fourierTerms(samples: readonly Point[], maxHarmonics: number): FourierTerm[] {
  const N = samples.length
  const terms: FourierTerm[] = []
  for (let k = -Math.floor(N / 2); k < Math.ceil(N / 2); k++) {
    let re = 0, im = 0
    for (let n = 0; n < N; n++) {
      const angle = 2 * Math.PI * k * n / N
      const c = Math.cos(angle), s = Math.sin(angle)
      re += samples[n].x * c + samples[n].y * s
      im += samples[n].y * c - samples[n].x * s
    }
    re /= N; im /= N
    terms.push({ frequency: k, amplitude: Math.hypot(re, im), phase: Math.atan2(im, re) })
  }
  const largest = Math.max(0, ...terms.map((term) => term.amplitude))
  return terms
    .filter((term) => largest > 0 && term.amplitude >= largest * FOURIER_NEGLIGIBLE)
    .sort((a, b) => b.amplitude - a.amplitude
      || Math.abs(a.frequency) - Math.abs(b.frequency)
      || b.frequency - a.frequency)
    .slice(0, fourierMaxHarmonics(maxHarmonics))
}

// Bounded by hand: a custom outline typed a character at a time would
// otherwise leave one table per keystroke.
const FOURIER_CACHE_LIMIT = 64
const termCache = evaluatorCache('fourierTerms', new Map<string, FourierTerm[]>())

/** The node's coefficient table, cached per outline, custom text and size. */
export function fourierTable(outlineValue: unknown, customPoints: unknown, maxHarmonicsValue: unknown): FourierTerm[] {
  const outline = fourierOutline(outlineValue)
  const max = fourierMaxHarmonics(maxHarmonicsValue)
  const custom = outline === 'custom' && typeof customPoints === 'string' ? customPoints : ''
  const key = `${outline}|${max}|${custom}`
  let terms = termCache.get(key)
  if (!terms) {
    terms = fourierTerms(fourierOutlineSamples(outline, custom), max)
    if (termCache.size >= FOURIER_CACHE_LIMIT) termCache.clear()
    termCache.set(key, terms)
  }
  return terms
}

/** `harmonics` clamped to the table: whole terms, plus a fraction of the next. */
export function fourierHarmonicWeight(harmonics: number, index: number, count: number): number {
  const h = Math.max(1, Math.min(count, harmonics))
  const whole = Math.floor(h)
  return index < whole ? 1 : index === whole ? h - whole : 0
}

/**
 * Walk the epicycles at turn fraction `turn` (0..1), scaled to `extent`
 * pixels. `visit` sees each circle's centre and radius before its arm is
 * added; the result is the pen. y points up, as in the outline.
 */
export function fourierPen(
  terms: readonly FourierTerm[],
  harmonics: number,
  turn: number,
  extent: number,
  visit?: (x: number, y: number, radius: number) => void,
): Point {
  const theta = turn * 2 * Math.PI
  let x = 0, y = 0
  for (let k = 0; k < terms.length; k++) {
    const weight = fourierHarmonicWeight(harmonics, k, terms.length)
    if (weight <= 0) break
    const radius = terms[k].amplitude * weight * extent
    visit?.(x, y, radius)
    const angle = terms[k].frequency * theta + terms[k].phase
    x += radius * Math.cos(angle)
    y += radius * Math.sin(angle)
  }
  return { x, y }
}
