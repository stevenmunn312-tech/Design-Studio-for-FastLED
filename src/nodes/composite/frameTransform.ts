/**
 * Frame Transform's two kernels, shared by preview and sketch.
 *
 * Both undo the same steps in reverse: the picture is turned, scaled, flipped
 * and then slid, so a destination pixel finds its source by undoing the slide,
 * the flips, the scale and the turn.
 *
 * - Exact keeps whole pixels. The turn snaps to quarter turns (stretched to
 *   fit a non-square matrix), the slide is rounded to whole pixels and wraps
 *   round the edges, and every output pixel is a copy of an input pixel.
 * - Smooth turns by any angle, scales about the centre and slides by
 *   fractions of a pixel, then reads the source through the shared frame
 *   sampler (`sampleFrame` / `_sampleFrame`) with an edge mode and sampling.
 *
 * Turn, scale and slide each have a per-second rate, integrated on the node's
 * speed clock by the evaluator and emitter; the scale rate breathes between
 * double and half size (./transformZoom.ts). The kernels here take the totals.
 */
import type { FrameEdgeMode } from '../../state/evaluator/frames'

export const FRAME_TRANSFORM_MODES = ['exact', 'smooth'] as const
export type FrameTransformMode = typeof FRAME_TRANSFORM_MODES[number]

export function frameTransformMode(value: unknown): FrameTransformMode {
  return value === 'smooth' ? 'smooth' : 'exact'
}

/** Smooth mode's edge modes, numbered as `_sampleFrame` takes them (0, 1, 2). */
export const FRAME_TRANSFORM_EDGES = ['clamp', 'wrap', 'black'] as const

/** Smooth mode's edge mode; anything unknown reads as black, the default. */
export function frameTransformEdge(value: unknown): FrameEdgeMode {
  return value === 'clamp' || value === 'wrap' ? value : 'black'
}

/** The slider ranges, which both sides also hold a wired scale to. */
export const FRAME_OFFSET = { min: -64, max: 64 } as const
export const FRAME_SCALE = { min: 0.25, max: 4 } as const
/** Each rate slider: degrees, percent of a doubling, or pixels a second. */
export const TRANSFORM_RATE = { min: -360, max: 360 } as const

export function frameScale(value: number): number {
  return Math.max(FRAME_SCALE.min, Math.min(FRAME_SCALE.max, value))
}

/** Quarter turns clockwise, 0–3: the nearest quarter to a turn in degrees. */
export function frameQuarterTurns(degrees: unknown): number {
  const n = Math.floor(Number(degrees ?? 0) / 90 + 0.5) % 4
  return Number.isFinite(n) ? (n + 4) % 4 : 0
}

/** A slide rounded to whole pixels and wrapped into 0 … size - 1. */
export function wholeOffset(value: number, size: number): number {
  const n = Math.floor(value + 0.5) % size
  if (!Number.isFinite(n)) return 0
  return n < 0 ? n + size : n + 0
}

// ── Exact ────────────────────────────────────────────────────────────────────

export interface ExactTransformFrame {
  turns: number
  flipX: boolean
  flipY: boolean
  ox: number
  oy: number
  W: number
  H: number
}

export function exactTransformFrame(
  degrees: number, flipX: boolean, flipY: boolean, offsetX: number, offsetY: number, W: number, H: number,
): ExactTransformFrame {
  return { turns: frameQuarterTurns(degrees), flipX, flipY, ox: wholeOffset(offsetX, W), oy: wholeOffset(offsetY, H), W, H }
}

/**
 * The source pixel (row-major index) of a destination pixel. Coordinates are
 * normalised before the quarter turns so a turn also fits a non-square matrix.
 */
export function exactSource(x: number, y: number, f: ExactTransformFrame): number {
  const { W, H } = f
  const px = (x - f.ox + W) % W, py = (y - f.oy + H) % H
  let u = W > 1 ? px / (W - 1) : 0, v = H > 1 ? py / (H - 1) : 0
  if (f.flipX) u = 1 - u
  if (f.flipY) v = 1 - v
  for (let k = 0; k < f.turns; k++) { const nu = v; v = 1 - u; u = nu }
  return Math.floor(v * (H - 1) + 0.5) * W + Math.floor(u * (W - 1) + 0.5)
}

/**
 * What the exact kernel's C++ is built from. `turns` is a quarter-turn count
 * known at generation time, or a C++ expression of the turn in degrees when a
 * wire or rate moves it. A null offset is a slide that is always 0.
 */
export interface ExactTransformCppSpec {
  turns: number | string
  flipX: boolean
  flipY: boolean
  offsetX: string | null
  offsetY: string | null
}

/** C++ twin of `exactTransformFrame` / `exactSource`: `pixel` declares `int _sx, _sy`. */
export function exactTransformCpp(spec: ExactTransformCppSpec): { frame: string[]; pixel: string[] } {
  const frame: string[] = []
  const wrap = (name: string, expr: string, size: string) =>
    `int ${name}=(int)fmodf(floorf((${expr})+0.5f),(float)${size}); if(${name}<0)${name}+=${size};`
  if (spec.offsetX !== null) frame.push(wrap('_ftOx', spec.offsetX, 'WIDTH'))
  if (spec.offsetY !== null) frame.push(wrap('_ftOy', spec.offsetY, 'HEIGHT'))
  const runtimeTurns = typeof spec.turns === 'string'
  if (runtimeTurns) frame.push(`int _ftK=(int)fmodf(floorf((${spec.turns})/90.0f+0.5f),4.0f); if(_ftK<0)_ftK+=4;`)
  const px = spec.offsetX !== null ? '(_x-_ftOx+WIDTH)%WIDTH' : '_x'
  const py = spec.offsetY !== null ? '(_y-_ftOy+HEIGHT)%HEIGHT' : '_y'
  const pixel = [
    `int _px=${px},_py=${py};`,
    'float _u=WIDTH>1?(float)_px/(WIDTH-1):0.0f,_v=HEIGHT>1?(float)_py/(HEIGHT-1):0.0f;',
  ]
  if (spec.flipX) pixel.push('_u=1.0f-_u;')
  if (spec.flipY) pixel.push('_v=1.0f-_v;')
  const turn = '{ float _nu=_v; _v=1.0f-_u; _u=_nu; }'
  if (runtimeTurns) pixel.push(`for(int _q=0;_q<_ftK;_q++) ${turn}`)
  else for (let k = 0; k < (spec.turns as number); k++) pixel.push(turn)
  pixel.push('int _sx=(int)floorf(_u*(WIDTH-1)+0.5f),_sy=(int)floorf(_v*(HEIGHT-1)+0.5f);')
  return { frame, pixel }
}

// ── Smooth ───────────────────────────────────────────────────────────────────

export interface SmoothTransformFrame {
  co: number
  si: number
  scale: number
  flipX: boolean
  flipY: boolean
  ox: number
  oy: number
  cx: number
  cy: number
}

export function smoothTransformFrame(
  degrees: number, scale: number, flipX: boolean, flipY: boolean, ox: number, oy: number, W: number, H: number,
): SmoothTransformFrame {
  const a = degrees * DEG_TO_RAD
  return { co: Math.cos(a), si: Math.sin(a), scale, flipX, flipY, ox, oy, cx: (W - 1) / 2, cy: (H - 1) / 2 }
}

/** The source point of a destination pixel, in pixel-centre coordinates. */
export function smoothSource(x: number, y: number, f: SmoothTransformFrame): [number, number] {
  let rx = x - f.ox - f.cx, ry = y - f.oy - f.cy
  if (f.flipX) rx = -rx
  if (f.flipY) ry = -ry
  return [f.cx + (rx * f.co + ry * f.si) / f.scale, f.cy + (ry * f.co - rx * f.si) / f.scale]
}

/** The constant the sketch turns degrees into radians with; the preview uses the same. */
export const DEG_TO_RAD = 0.01745329252

/**
 * What the smooth kernel's C++ is built from: C++ expressions for the turn in
 * degrees, the scale and the slide, or null for a step that is always the
 * identity (no turn, scale 1, no slide), which the sketch then leaves out.
 * The preview always runs every step; an identity step changes no value.
 */
export interface SmoothTransformCppSpec {
  degrees: string | null
  scale: string | null
  flipX: boolean
  flipY: boolean
  offsetX: string | null
  offsetY: string | null
}

/** C++ twin of `smoothTransformFrame` / `smoothSource`: `pixel` declares `float _sx, _sy`. */
export function smoothTransformCpp(spec: SmoothTransformCppSpec): { frame: string[]; pixel: string[] } {
  const frame = ['float _ftCx=(WIDTH-1)*0.5f,_ftCy=(HEIGHT-1)*0.5f;']
  if (spec.degrees !== null) {
    frame.push(`float _ftA=(${spec.degrees})*${DEG_TO_RAD}f,_ftCo=cosf(_ftA),_ftSi=sinf(_ftA);`)
  }
  if (spec.scale !== null) frame.push(`float _ftS=${spec.scale};`)
  if (spec.offsetX !== null) frame.push(`float _ftOx=${spec.offsetX};`)
  if (spec.offsetY !== null) frame.push(`float _ftOy=${spec.offsetY};`)
  const rx = spec.offsetX !== null ? '_x-_ftOx-_ftCx' : '_x-_ftCx'
  const ry = spec.offsetY !== null ? '_y-_ftOy-_ftCy' : '_y-_ftCy'
  const pixel = [`float _rx=${rx},_ry=${ry};`]
  if (spec.flipX) pixel.push('_rx=-_rx;')
  if (spec.flipY) pixel.push('_ry=-_ry;')
  const across = spec.degrees !== null ? '(_rx*_ftCo+_ry*_ftSi)' : '_rx'
  const down = spec.degrees !== null ? '(_ry*_ftCo-_rx*_ftSi)' : '_ry'
  const per = spec.scale !== null ? '/_ftS' : ''
  pixel.push(`float _sx=_ftCx+${across}${per},_sy=_ftCy+${down}${per};`)
  return { frame, pixel }
}
