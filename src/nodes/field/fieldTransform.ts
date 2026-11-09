/**
 * Field Transform's kernel, shared by preview and sketch. The node keeps the
 * `FieldWarp` type id; it took over Field Rotate and Field Tile.
 *
 * A destination pixel reads the source field back through three steps:
 *
 * 1. Push: the Offset X and Y fields move the read by (2v - 1) × Strength
 *    canvas pixels, so a field value of 0.5 is no push.
 * 2. Turn and zoom about the canvas centre: Angle plus the integrated Spin,
 *    and Zoom (above 1 enlarges).
 * 3. Tiles: the field repeats Tiles X by Tiles Y times across the canvas,
 *    from the top-left corner. The edge mode decides what lies past the
 *    field's own edges, so Wrap repeats it, Mirror reflects every other copy
 *    and Clamp holds the edge.
 *
 * The read is bilinear (or nearest) at the edge mode. Where tiles or a zoom
 * below 1 squeeze several source pixels into one, the pixel averages an n × n
 * grid of reads across its own area, so fine detail blends rather than drops
 * out (Field Tile once skipped pixels instead). A step the sketch knows is
 * the identity is left out of it; the preview leaves out the same steps by
 * their values, which reads the same numbers.
 */
import type { Field } from '../../state/evaluator/types'
import { DEG_TO_RAD } from '../composite/frameTransform'

export const FIELD_EDGE_MODES = ['clamp', 'wrap', 'mirror'] as const
export type FieldEdgeMode = typeof FIELD_EDGE_MODES[number]

export function fieldEdgeMode(value: unknown): FieldEdgeMode {
  return value === 'wrap' || value === 'mirror' ? value : 'clamp'
}

/** The slider ranges, which both sides also hold a wired value to. */
export const FIELD_STRENGTH = { min: 0, max: 8 } as const
export const FIELD_ZOOM = { min: 0.25, max: 4 } as const
export const FIELD_TILES = { min: 1, max: 8 } as const
/** Most reads a pixel averages along each axis. */
export const FIELD_SAMPLES_MAX = 4

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Whole copies across one axis. */
export function fieldTiles(value: number): number {
  return clamp(Math.floor(value + 0.5), FIELD_TILES.min, FIELD_TILES.max)
}

/** Reads per axis: how many source pixels the steps squeeze into one, at most FIELD_SAMPLES_MAX. */
export function fieldSamples(tilesX: number, tilesY: number, zoom: number): number {
  return clamp(Math.ceil(Math.max(tilesX, tilesY) / zoom), 1, FIELD_SAMPLES_MAX)
}

/** A pixel index past the field's edge, resolved by the edge mode. */
export function fieldEdge(mode: FieldEdgeMode, i: number, n: number): number {
  if (mode === 'wrap') {
    const r = i % n
    return r < 0 ? r + n : r
  }
  if (mode === 'mirror') {
    const m = 2 * n
    let r = i % m
    if (r < 0) r += m
    return r < n ? r : m - 1 - r
  }
  return i < 0 ? 0 : i > n - 1 ? n - 1 : i
}

/** C++ twin of `fieldEdge`, resolving the int variable `v` in place against `size`. */
export function fieldEdgeCpp(mode: FieldEdgeMode, v: string, size: string): string {
  if (mode === 'wrap') return `${v}%=${size}; if(${v}<0)${v}+=${size};`
  if (mode === 'mirror') return `${v}%=2*${size}; if(${v}<0)${v}+=2*${size}; if(${v}>=${size})${v}=2*${size}-1-${v};`
  return `${v}=${v}<0?0:(${v}>${size}-1?${size}-1:${v});`
}

/**
 * The field at a point in pixel-centre coordinates. Bilinear blends the four
 * neighbours in the order the sketch writes them.
 */
export function sampleField(
  field: Field, u: number, v: number, W: number, H: number, edge: FieldEdgeMode, bilinear: boolean,
): number {
  if (!bilinear) {
    return field[fieldEdge(edge, Math.floor(v + 0.5), H) * W + fieldEdge(edge, Math.floor(u + 0.5), W)]
  }
  const x0 = Math.floor(u), y0 = Math.floor(v)
  const ax = u - x0, ay = v - y0
  const xa = fieldEdge(edge, x0, W), xb = fieldEdge(edge, x0 + 1, W)
  const ya = fieldEdge(edge, y0, H) * W, yb = fieldEdge(edge, y0 + 1, H) * W
  return (field[ya + xa] * (1 - ax) + field[ya + xb] * ax) * (1 - ay)
    + (field[yb + xa] * (1 - ax) + field[yb + xb] * ax) * ay
}

export interface FieldTransformFrame {
  strength: number
  co: number
  si: number
  zoom: number
  tilesX: number
  tilesY: number
  samples: number
  cx: number
  cy: number
  edge: FieldEdgeMode
  bilinear: boolean
  W: number
  H: number
}

export function fieldTransformFrame(
  strength: number, degrees: number, zoom: number, tilesX: number, tilesY: number,
  edge: FieldEdgeMode, bilinear: boolean, W: number, H: number,
): FieldTransformFrame {
  const a = degrees * DEG_TO_RAD
  const z = clamp(zoom, FIELD_ZOOM.min, FIELD_ZOOM.max)
  const tx = fieldTiles(tilesX), ty = fieldTiles(tilesY)
  return {
    strength: clamp(strength, FIELD_STRENGTH.min, FIELD_STRENGTH.max),
    co: Math.cos(a), si: Math.sin(a), zoom: z, tilesX: tx, tilesY: ty, samples: fieldSamples(tx, ty, z),
    cx: (W - 1) / 2, cy: (H - 1) / 2, edge, bilinear, W, H,
  }
}

/** Read the source at a point after the push: turn, zoom, tile, sample. */
function readAt(field: Field, px: number, py: number, f: FieldTransformFrame): number {
  let qx = px, qy = py
  if (f.co !== 1 || f.si !== 0 || f.zoom !== 1) {
    const rx = px - f.cx, ry = py - f.cy
    qx = f.cx + (rx * f.co + ry * f.si) / f.zoom
    qy = f.cy + (ry * f.co - rx * f.si) / f.zoom
  }
  if (f.tilesX !== 1 || f.tilesY !== 1) {
    qx = (qx + 0.5) * f.tilesX - 0.5
    qy = (qy + 0.5) * f.tilesY - 0.5
  }
  return sampleField(field, qx, qy, f.W, f.H, f.edge, f.bilinear)
}

/** The transformed field's value at one destination pixel. */
export function fieldTransformPixel(
  field: Field, dx: Field | null, dy: Field | null, x: number, y: number, f: FieldTransformFrame,
): number {
  const i = y * f.W + x
  const ox = dx ? (2 * dx[i] - 1) * f.strength : 0
  const oy = dy ? (2 * dy[i] - 1) * f.strength : 0
  const n = f.samples
  if (n === 1) return readAt(field, x + ox, y + oy, f)
  let sum = 0
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < n; k++) sum += readAt(field, x + ((k + 0.5) / n - 0.5) + ox, y + ((j + 0.5) / n - 0.5) + oy, f)
  }
  return sum / (n * n)
}

/**
 * What the sketch's block is built from: a C++ expression for each value that
 * the graph can move, or null for one fixed at its rest (no push field, no
 * turn, zoom 1, one tile). `samples` is the read count when it is fixed at
 * generation time, or null to work it out each frame.
 */
export interface FieldTransformCppSpec {
  src: string
  out: string
  dx: string | null
  dy: string | null
  strength: string
  degrees: string | null
  zoom: string | null
  tilesX: string | null
  tilesY: string | null
  samples: number | null
  edge: FieldEdgeMode
  bilinear: boolean
}

/** C++ twin of `fieldTransformFrame` / `fieldTransformPixel`: the per-frame lines and the pixel loop. */
export function fieldTransformCpp(spec: FieldTransformCppSpec): { frame: string[]; loop: string[] } {
  const turn = spec.degrees !== null
  const zoom = spec.zoom !== null
  const tiled = spec.tilesX !== null || spec.tilesY !== null
  const frame: string[] = []
  if (spec.dx || spec.dy) frame.push(`float _ftSt=constrain(${spec.strength},${FIELD_STRENGTH.min}.0f,${FIELD_STRENGTH.max}.0f);`)
  if (turn) frame.push(`float _ftA=(${spec.degrees})*${DEG_TO_RAD}f,_ftCo=cosf(_ftA),_ftSi=sinf(_ftA);`)
  if (zoom) frame.push(`float _ftZ=constrain(${spec.zoom},${FIELD_ZOOM.min}f,${FIELD_ZOOM.max}.0f);`)
  if (turn || zoom) frame.push('float _ftCx=(WIDTH-1)*0.5f,_ftCy=(HEIGHT-1)*0.5f;')
  const tiles = (v: string | null) => v === null ? '1.0f'
    : `constrain((int)floorf((${v})+0.5f),${FIELD_TILES.min},${FIELD_TILES.max})`
  if (tiled) frame.push(`float _ftTx=${tiles(spec.tilesX)},_ftTy=${tiles(spec.tilesY)};`)
  if (spec.samples === null) {
    frame.push(`int _ftN=constrain((int)ceilf(fmaxf(${tiled ? '_ftTx' : '1.0f'},${tiled ? '_ftTy' : '1.0f'})/${zoom ? '_ftZ' : '1.0f'}),1,${FIELD_SAMPLES_MAX});`)
  } else if (spec.samples > 1) {
    frame.push(`int _ftN=${spec.samples};`)
  }

  // Reads the field at (_px, _py) into _val.
  const read: string[] = []
  let u = '_px', v = '_py'
  if (turn || zoom) {
    const across = turn ? '(_rx*_ftCo+_ry*_ftSi)' : '_rx'
    const down = turn ? '(_ry*_ftCo-_rx*_ftSi)' : '_ry'
    const per = zoom ? '/_ftZ' : ''
    read.push('float _rx=_px-_ftCx,_ry=_py-_ftCy;')
    read.push(`float _qx=_ftCx+${across}${per},_qy=_ftCy+${down}${per};`)
    u = '_qx'; v = '_qy'
  }
  if (tiled) {
    read.push(`float _tu=(${u}+0.5f)*_ftTx-0.5f,_tv=(${v}+0.5f)*_ftTy-0.5f;`)
    u = '_tu'; v = '_tv'
  }
  if (spec.bilinear) {
    read.push(`int _x0=(int)floorf(${u}),_y0=(int)floorf(${v}); float _ax=${u}-_x0,_ay=${v}-_y0; int _x1=_x0+1,_y1=_y0+1;`)
    read.push(fieldEdgeCpp(spec.edge, '_x0', 'WIDTH'), fieldEdgeCpp(spec.edge, '_x1', 'WIDTH'))
    read.push(fieldEdgeCpp(spec.edge, '_y0', 'HEIGHT'), fieldEdgeCpp(spec.edge, '_y1', 'HEIGHT'))
    read.push(`float _val=(${spec.src}[_y0*WIDTH+_x0]*(1.0f-_ax)+${spec.src}[_y0*WIDTH+_x1]*_ax)*(1.0f-_ay)`
      + `+(${spec.src}[_y1*WIDTH+_x0]*(1.0f-_ax)+${spec.src}[_y1*WIDTH+_x1]*_ax)*_ay;`)
  } else {
    read.push(`int _sx=(int)floorf(${u}+0.5f),_sy=(int)floorf(${v}+0.5f);`)
    read.push(fieldEdgeCpp(spec.edge, '_sx', 'WIDTH'), fieldEdgeCpp(spec.edge, '_sy', 'HEIGHT'))
    read.push(`float _val=${spec.src}[_sy*WIDTH+_sx];`)
  }

  const loop = ['for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ int _i=_y*WIDTH+_x;']
  if (spec.dx) loop.push(`  float _ox=(2.0f*${spec.dx}[_i]-1.0f)*_ftSt;`)
  if (spec.dy) loop.push(`  float _oy=(2.0f*${spec.dy}[_i]-1.0f)*_ftSt;`)
  const push = (axis: string, field: string | null) => field ? `+_o${axis}` : ''
  if (spec.samples === 1) {
    loop.push(`  float _px=_x${push('x', spec.dx)},_py=_y${push('y', spec.dy)};`)
    for (const line of read) loop.push(`  ${line}`)
    loop.push(`  ${spec.out}[_i]=_val; }`)
  } else {
    loop.push('  float _sum=0.0f;')
    loop.push('  for(int _j=0;_j<_ftN;_j++) for(int _k=0;_k<_ftN;_k++){')
    loop.push(`    float _px=_x+((_k+0.5f)/_ftN-0.5f)${push('x', spec.dx)},_py=_y+((_j+0.5f)/_ftN-0.5f)${push('y', spec.dy)};`)
    for (const line of read) loop.push(`    ${line}`)
    loop.push('    _sum+=_val; }')
    loop.push(`  ${spec.out}[_i]=_sum/(float)(_ftN*_ftN); }`)
  }
  return { frame, loop }
}
