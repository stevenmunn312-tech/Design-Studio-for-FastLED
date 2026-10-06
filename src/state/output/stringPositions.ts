// Positioned string layout: each LED of a string sits at its own (x, y) on a
// canvas, and reads the graph there by bilinear sampling — FastLED's ScreenMap,
// for a string that is not a straight line (a catenary of lights between two
// masts, a fence, a tree outline).
//
// The user's text is parsed to numbers here and only the fixed-point numbers
// reach the sketch, which bakes them as a PROGMEM table. The preview and the
// sketch take their four source pixels and weights from `positionTap`, so both
// light an LED from the same place.
//
// Deliberately free of imports: `ledOutputForm.ts` asks for the canvas size, so
// this module cannot import it back.

export const STRIP_LAYOUTS = ['line', 'positions'] as const
export type StripLayout = (typeof STRIP_LAYOUTS)[number]

export const POSITION_PRESETS = ['custom', 'catenary'] as const
export type PositionPreset = (typeof POSITION_PRESETS)[number]

export const POSITION_CANVAS_DEFAULT = { width: 32, height: 16 }
const MAX_SIDE = 64
const MAX_LEDS = 300

/** Fixed-point scale of the baked table: 8 fractional bits per canvas unit. */
export const POSITION_FIXED_SCALE = 256

export interface StringPositions {
  canvasW: number
  canvasH: number
  /** One (x, y) per LED, in canvas units. Pixel centres sit at i + 0.5. */
  points: Array<[number, number]>
  /** The same points, interleaved x, y and rounded to 1/256 of a canvas unit —
   *  the table the sketch bakes. */
  fixed: number[]
  /** Where the points came from; `fallback` means a custom list was unusable. */
  source: 'catenary' | 'custom' | 'fallback'
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/** True when a string output is laid out by positions rather than as a line. */
export function usesPositions(props: Record<string, unknown> | undefined | null): boolean {
  return !!props && props.form === 'strip' && props.stripLayout === 'positions'
}

/** The canvas a positioned string reads: its own, not the string's N x 1. */
export function positionCanvasDims(props: Record<string, unknown>): { width: number; height: number } {
  return {
    width: int(props.positionsWidth, POSITION_CANVAS_DEFAULT.width, 2, MAX_SIDE),
    height: int(props.positionsHeight, POSITION_CANVAS_DEFAULT.height, 1, MAX_SIDE),
  }
}

/** Every number in `text`, in order — commas, spaces, semicolons and newlines
 *  all separate. Anything else in the text is ignored. */
export function parsePositionNumbers(text: unknown): number[] {
  const matches = String(text ?? '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []
  return matches.map(Number).filter(Number.isFinite)
}

/** The Sailboat preset: a string hung between two masts along the canvas top,
 *  LEDs spaced evenly in x, sagging to the bottom row at the middle. */
export function catenaryPoints(count: number, w: number, h: number): Array<[number, number]> {
  const a = 2.2
  const denominator = Math.cosh(a) - 1
  return Array.from({ length: count }, (_, i) => {
    const u = count === 1 ? 0 : (2 * i) / (count - 1) - 1
    const hang = (Math.cosh(a * u) - 1) / denominator
    return [0.5 + (w - 1) * (u + 1) / 2, 0.5 + (h - 1) * (1 - hang)]
  })
}

/** A straight row through the middle of the canvas: what a positioned string
 *  falls back to when its custom list is missing or too short. */
function rowPoints(count: number, w: number, h: number): Array<[number, number]> {
  return Array.from({ length: count }, (_, i) => [(w * (i + 0.5)) / count, h / 2])
}

const cache = new Map<string, StringPositions>()

/**
 * The positions for a positioned string, or null for any other output.
 *
 * A custom list needs at least one point per LED (extra points are ignored);
 * otherwise the LEDs fall back to a straight row so a half-typed list never
 * produces a layout that lights nothing. Coordinates clamp to the canvas.
 */
export function stringPositions(props: Record<string, unknown> | undefined | null): StringPositions | null {
  if (!props || !usesPositions(props)) return null
  const count = int(props.ledCount, 60, 1, MAX_LEDS)
  const { width: w, height: h } = positionCanvasDims(props)
  const preset: PositionPreset = props.positionsPreset === 'catenary' ? 'catenary' : 'custom'
  const text = preset === 'custom' ? String(props.positions ?? '') : ''
  const key = `${count}|${w}|${h}|${preset}|${text}`
  const hit = cache.get(key)
  if (hit) return hit

  let points: Array<[number, number]>
  let source: StringPositions['source']
  if (preset === 'catenary') {
    points = catenaryPoints(count, w, h)
    source = 'catenary'
  } else {
    const numbers = parsePositionNumbers(text)
    if (numbers.length >= count * 2) {
      points = Array.from({ length: count }, (_, i) => [numbers[i * 2], numbers[i * 2 + 1]])
      source = 'custom'
    } else {
      points = rowPoints(count, w, h)
      source = 'fallback'
    }
  }
  const clamped = points.map(([x, y]) => [Math.min(Math.max(x, 0), w), Math.min(Math.max(y, 0), h)] as [number, number])
  const fixed = clamped.flatMap(([x, y]) => [Math.round(x * POSITION_FIXED_SCALE), Math.round(y * POSITION_FIXED_SCALE)])
  const result: StringPositions = { canvasW: w, canvasH: h, points: clamped, fixed, source }
  if (cache.size > 64) cache.clear()
  cache.set(key, result)
  return result
}

/** The fixed-point table against a render canvas that may not be the string's
 *  own (a shared composition in fit/crop routing): coordinates scale with it. */
export function positionsFixedFor(positions: StringPositions, canvasW: number, canvasH: number): number[] {
  if (canvasW === positions.canvasW && canvasH === positions.canvasH) return positions.fixed
  const sx = canvasW / positions.canvasW
  const sy = canvasH / positions.canvasH
  return positions.fixed.map((v, i) => Math.round(v * (i % 2 === 0 ? sx : sy)))
}

/** One axis of a bilinear read: the two source indices and the weight of the
 *  second, from a fixed-point canvas coordinate (1/256 units, pixel centres at
 *  +128). Reads clamp at the canvas edge. */
export function positionTap(fixedCoord: number, size: number): { i0: number; i1: number; f: number } {
  const c = Math.min(Math.max(fixedCoord - POSITION_FIXED_SCALE / 2, 0), (size - 1) * POSITION_FIXED_SCALE)
  const i0 = Math.floor(c / POSITION_FIXED_SCALE)
  return { i0, i1: Math.min(i0 + 1, size - 1), f: (c - i0 * POSITION_FIXED_SCALE) / POSITION_FIXED_SCALE }
}
