// MatrixOutput physical-wiring layout: grid (x,y) -> physical LED index.
//
// `layout: 'matrix'` (default) and `'strip'` keep the existing behaviour —
// row-major, optionally zig-zagged by the pixel-level `serpentine` flag.
// `layout: 'panels'` splits the WIDTH×HEIGHT grid into `tilesX`×`tilesY`
// equal-sized tiles (each physically its own panel, wired in its own chain
// position), each independently rotatable via `tileRotations` and chained in
// either row order or a panel-level serpentine snake via `tileSerpentine`.
// `layout: 'custom'` takes an explicit JSON permutation of 0..N-1 as the
// escape hatch for arrangements this can't express (irregular chains, etc).
//
// `buildXYTable` returns `null` when the grid can be addressed with a plain
// row-major memmove (no remap needed) so callers can keep that fast path.

export type MatrixLayout = 'matrix' | 'strip' | 'panels' | 'custom'
export type TileRotation = 0 | 90 | 180 | 270

export interface TileLayoutProps {
  layout?: unknown
  serpentine?: unknown
  tilesX?: unknown
  tilesY?: unknown
  tileSerpentine?: unknown
  tileRotations?: unknown
  customXYMap?: unknown
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
}

/** The rotation (degrees, clockwise) applied to the tile at row-major grid
 *  position `tileIndex` (ty * tilesX + tx), read from the comma-separated
 *  `tileRotations` property (e.g. "0,90,0,180"). Missing/invalid entries
 *  default to 0; only 0/90/180/270 are recognised. */
export function tileRotationAt(props: TileLayoutProps, tileIndex: number): TileRotation {
  const raw = String(props.tileRotations ?? '').split(',')[tileIndex]
  const n = Math.round(Number(raw))
  return n === 90 || n === 180 || n === 270 ? (n as TileRotation) : 0
}

/** Parses `customXYMap` as a JSON array of exactly `n` integers forming a
 *  permutation of 0..n-1. Returns null when the property is blank, isn't
 *  valid JSON, has the wrong length, or isn't a permutation — callers should
 *  fall back to the default matrix layout in that case rather than emit a
 *  broken wiring table. */
export function parseCustomXYMap(json: unknown, n: number): number[] | null {
  const str = String(json ?? '').trim()
  if (!str) return null
  let parsed: unknown
  try { parsed = JSON.parse(str) } catch { return null }
  if (!Array.isArray(parsed) || parsed.length !== n) return null
  const seen = new Uint8Array(n)
  for (const v of parsed) {
    if (!Number.isInteger(v) || v < 0 || v >= n || seen[v]) return null
    seen[v] = 1
  }
  return parsed as number[]
}

function serpentineTable(width: number, height: number): number[] {
  const table = new Array<number>(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      table[y * width + x] = (y & 1) ? y * width + (width - 1 - x) : y * width + x
    }
  }
  return table
}

/** Rotate a point within a `w`×`h` tile by `deg` clockwise, returning the
 *  rotated coordinates plus the tile's dimensions as seen after rotation
 *  (90/270 swap width and height). */
function rotatePoint(lx: number, ly: number, w: number, h: number, deg: TileRotation) {
  switch (deg) {
    case 90:  return { x: ly, y: w - 1 - lx, w: h, h: w }
    case 180: return { x: w - 1 - lx, y: h - 1 - ly, w, h }
    case 270: return { x: h - 1 - ly, y: lx, w: h, h: w }
    default:  return { x: lx, y: ly, w, h }
  }
}

/** Builds the grid->physical-index wiring table (row-major, length
 *  width*height), or returns null when no remap is needed (plain
 *  row-major matrix/strip with pixel serpentine off — the caller's
 *  existing memmove fast path already does the right thing). */
export function buildXYTable(width: number, height: number, props: TileLayoutProps): number[] | null {
  const layout = (props.layout as MatrixLayout) ?? 'matrix'
  const pixelSerpentine = props.serpentine === true

  if (layout === 'custom') {
    const custom = parseCustomXYMap(props.customXYMap, width * height)
    if (custom) return custom
    // Invalid/blank custom map — fall through to plain matrix behaviour.
  }

  if (layout === 'panels') {
    const tilesX = clampInt(props.tilesX, 1, 1, 16)
    const tilesY = clampInt(props.tilesY, 1, 1, 16)
    if (width % tilesX === 0 && height % tilesY === 0) {
      const tileW = width / tilesX
      const tileH = height / tilesY
      const tileSerpentine = props.tileSerpentine === true
      const table = new Array<number>(width * height)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tx = Math.floor(x / tileW)
          const ty = Math.floor(y / tileH)
          const lx = x - tx * tileW
          const ly = y - ty * tileH
          const deg = tileRotationAt(props, ty * tilesX + tx)
          const r = rotatePoint(lx, ly, tileW, tileH, deg)
          const localIndex = (pixelSerpentine && (r.y & 1))
            ? r.y * r.w + (r.w - 1 - r.x)
            : r.y * r.w + r.x
          const chainX = (tileSerpentine && (ty & 1)) ? (tilesX - 1 - tx) : tx
          const chain = ty * tilesX + chainX
          table[y * width + x] = chain * (tileW * tileH) + localIndex
        }
      }
      return table
    }
    // tilesX/tilesY don't divide the grid evenly — fall back below.
  }

  // 'matrix' / 'strip' (and any unrecognised/fallen-back-to layout).
  if (!pixelSerpentine) return null
  return serpentineTable(width, height)
}
