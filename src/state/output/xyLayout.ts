// LED output physical-wiring layout: grid (x,y) -> physical LED index.
//
// Only the matrix and HUB75 forms have a wiring order to choose. A string is
// its own order and a ring's is its start angle and direction
// (src/state/output/ledOutputForm.ts), so a linear form is always plain row-major here
// regardless of what a `layout` left over from an earlier form still says.
//
// `layout: 'matrix'` (default) and `'strip'` wire the grid as one panel: LED 0
// at `startCorner`, the first run along `firstRun` (a row or a column), and
// each later run either zig-zagging back (`serpentine`) or restarting from the
// same edge. `matrixLedIndex` is that rule, and the only statement of it: the
// firmware XY table, the wiring diagnostic, the live-stream packet builder and
// the Build Diagram all read it, so none of them can disagree about where an
// LED is.
// `layout: 'panels'` splits the WIDTH×HEIGHT grid into `tilesX`×`tilesY`
// equal-sized tiles (each physically its own panel, wired in its own chain
// position), each independently rotatable via `tileRotations` and chained in
// either row order or a panel-level serpentine snake via `tileSerpentine`.
// Every panel is wired inside by the same `matrixLedIndex` rule, applied after
// its rotation, exactly as `serpentine` always was: start corner and first run
// describe the panel as bought, rotation describes how it was mounted.
// `layout: 'custom'` takes an explicit JSON permutation of 0..N-1 as the
// escape hatch for arrangements this can't express (irregular chains, etc),
// and ignores serpentine, start corner and first run alike.
//
// `buildXYTable` returns `null` when the grid can be addressed with a plain
// row-major memmove (no remap needed) so callers can keep that fast path.

import { isLinearForm, outputForm } from './ledOutputForm'

export type MatrixLayout = 'matrix' | 'strip' | 'panels' | 'custom'
export type TileRotation = 0 | 90 | 180 | 270

export type MatrixStartCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type MatrixFirstRun = 'horizontal' | 'vertical'

export const MATRIX_START_CORNERS: readonly MatrixStartCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
export const MATRIX_FIRST_RUNS: readonly MatrixFirstRun[] = ['horizontal', 'vertical']

/** How one matrix panel is wired inside: where LED 0 sits, which way the
 *  first run leaves it, and whether later runs zig-zag. */
export interface MatrixWiring {
  serpentine: boolean
  startCorner: MatrixStartCorner
  firstRun: MatrixFirstRun
}

export interface TileLayoutProps {
  form?: unknown
  layout?: unknown
  serpentine?: unknown
  startCorner?: unknown
  firstRun?: unknown
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

function normalizedLayout(props: TileLayoutProps): MatrixLayout {
  if (isLinearForm(outputForm(props as Record<string, unknown>))) return 'matrix'
  const layout = props.layout
  return layout === 'strip' || layout === 'panels' || layout === 'custom' ? layout : 'matrix'
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

function validateTileRotations(props: TileLayoutProps, tileCount: number): string[] {
  const raw = String(props.tileRotations ?? '').trim()
  if (!raw) return []
  const parts = raw.split(',')
  const errors: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i].trim()
    if (!token) continue
    if (i >= tileCount) {
      errors.push(`Tile rotations lists ${parts.length} entries, but the current panel grid only has ${tileCount} tile${tileCount === 1 ? '' : 's'}`)
      break
    }
    const n = Math.round(Number(token))
    if (n !== 0 && n !== 90 && n !== 180 && n !== 270) {
      errors.push(`Tile rotation ${i + 1} is "${token}" — use 0, 90, 180, or 270`)
    }
  }
  return errors
}

function customXYMapError(json: unknown, n: number): string | null {
  const str = String(json ?? '').trim()
  if (!str) return `Custom XY map is empty — provide a JSON array with ${n} LED index${n === 1 ? '' : 'es'}`
  let parsed: unknown
  try {
    parsed = JSON.parse(str)
  } catch {
    return 'Custom XY map is not valid JSON'
  }
  if (!Array.isArray(parsed)) return `Custom XY map must be a JSON array with ${n} LED indices`
  if (parsed.length !== n) return `Custom XY map has ${parsed.length} entries, but the matrix needs ${n}`

  const seen = new Uint8Array(n)
  for (let i = 0; i < parsed.length; i++) {
    const value = parsed[i]
    if (!Number.isInteger(value) || value < 0 || value >= n) {
      return `Custom XY map entry ${i + 1} must be an integer from 0 to ${n - 1}`
    }
    if (seen[value]) return `Custom XY map repeats LED index ${value}`
    seen[value] = 1
  }
  return null
}

export function validateMatrixLayout(width: number, height: number, props: TileLayoutProps): string[] {
  const layout = normalizedLayout(props)
  if (layout === 'panels') {
    const tilesX = clampInt(props.tilesX, 1, 1, 16)
    const tilesY = clampInt(props.tilesY, 1, 1, 16)
    const errors = validateTileRotations(props, tilesX * tilesY)
    if (width % tilesX !== 0 || height % tilesY !== 0) {
      errors.unshift(`Panel layout ${width}×${height} can't be divided into ${tilesX}×${tilesY} equal tiles`)
    }
    return errors
  }
  if (layout === 'custom') {
    const error = customXYMapError(props.customXYMap, width * height)
    return error ? [error] : []
  }
  return []
}

/** Parses `customXYMap` as a JSON array of exactly `n` integers forming a
 *  permutation of 0..n-1. Returns null when the property is blank, isn't
 *  valid JSON, has the wrong length, or isn't a permutation — callers should
 *  fall back to the default matrix layout in that case rather than emit a
 *  broken wiring table. */
export function parseCustomXYMap(json: unknown, n: number): number[] | null {
  if (customXYMapError(json, n)) return null
  return JSON.parse(String(json).trim()) as number[]
}

/**
 * The physical LED index of grid cell (x, y) on one `width` x `height` matrix
 * panel, with (0, 0) the top-left cell seen from the front.
 *
 * The chain starts at `startCorner` and its first run travels along
 * `firstRun`: a row for 'horizontal', a column for 'vertical'. Runs then stack
 * away from the start corner. With `serpentine` every odd run comes back the
 * other way; without it every run restarts from the start corner's edge.
 * Top-left + horizontal is the plain row-major (or row zig-zag) order every
 * output had before the corner and direction could be chosen.
 */
export function matrixLedIndex(x: number, y: number, width: number, height: number, wiring: MatrixWiring): number {
  // Measure both axes from the start corner, so every corner is the top-left
  // case mirrored.
  const fromStartX = wiring.startCorner === 'top-right' || wiring.startCorner === 'bottom-right' ? width - 1 - x : x
  const fromStartY = wiring.startCorner === 'bottom-left' || wiring.startCorner === 'bottom-right' ? height - 1 - y : y
  const vertical = wiring.firstRun === 'vertical'
  const run = vertical ? fromStartX : fromStartY
  const along = vertical ? fromStartY : fromStartX
  const runLength = vertical ? height : width
  return run * runLength + (wiring.serpentine && (run & 1) ? runLength - 1 - along : along)
}

/**
 * An LED output's panel wiring, read from its properties. Serpentine belongs
 * to both grid forms as before; the start corner and first run belong to the
 * LED matrix form only. A HUB75 panel is scanned by its driver, and a string,
 * ring or corkscrew is its own order, so a value left behind by another form
 * reads as the default there.
 */
export function matrixWiringFromProps(props: TileLayoutProps): MatrixWiring {
  const form = outputForm(props as Record<string, unknown>)
  const chooses = form === 'matrix'
  return {
    // Serpentine zig-zags alternate runs; a one-run chain has none to zig.
    serpentine: props.serpentine === true && !isLinearForm(form),
    startCorner: chooses && MATRIX_START_CORNERS.includes(props.startCorner as MatrixStartCorner)
      ? props.startCorner as MatrixStartCorner
      : 'top-left',
    firstRun: chooses && props.firstRun === 'vertical' ? 'vertical' : 'horizontal',
  }
}

/** Whether the wiring is plain row-major, which needs no remap at all. */
function isRowMajor(wiring: MatrixWiring): boolean {
  return !wiring.serpentine && wiring.startCorner === 'top-left' && wiring.firstRun === 'horizontal'
}

/**
 * Whether these properties choose a start corner and first run at all: the LED
 * matrix form in its matrix or panels layout. Custom maps, HUB75 panels and
 * single chains do not, so their controls are hidden and their saved values
 * unread.
 */
export function matrixWiringApplies(props: TileLayoutProps): boolean {
  if (outputForm(props as Record<string, unknown>) !== 'matrix') return false
  return normalizedLayout(props) !== 'custom'
}

function matrixTable(width: number, height: number, wiring: MatrixWiring): number[] {
  const table = new Array<number>(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      table[y * width + x] = matrixLedIndex(x, y, width, height, wiring)
    }
  }
  return table
}

/** Rotate a point within a `w`×`h` tile by `deg` clockwise, returning the
 *  rotated coordinates plus the tile's dimensions as seen after rotation
 *  (90/270 swap width and height). Shared by the addressable XY table builder
 *  and HUB75's per-panel coordinate remap so both honour tileRotations the
 *  same way. */
export function rotatePoint(lx: number, ly: number, w: number, h: number, deg: TileRotation) {
  switch (deg) {
    case 90:  return { x: ly, y: w - 1 - lx, w: h, h: w }
    case 180: return { x: w - 1 - lx, y: h - 1 - ly, w, h }
    case 270: return { x: h - 1 - ly, y: lx, w: h, h: w }
    default:  return { x: lx, y: ly, w, h }
  }
}

/** Where a stretch of the chain enters the grid, for a wiring drawing. */
export interface ChainEntry {
  /** The stretch's first LED, 0..1 across and down the cells the stretch
   *  covers: (0, 1) is their bottom-left corner. */
  x: number
  y: number
  /** The step from that LED to the next one, each -1, 0 or 1 (a jump of more
   *  than one cell keeps only its sign). Both 0 on a one-LED stretch. */
  dx: number
  dy: number
}

/**
 * Where LEDs `firstLed` .. `firstLed + count - 1` of the chain enter the grid
 * and which way they set off, read back from the same table the firmware is
 * given. The whole chain by default; a data lane passes its own stretch.
 * Reading the finished table rather than the properties means a rotated panel
 * or a custom map is drawn where it really starts, with no second rule.
 */
export function chainEntry(
  width: number, height: number, props: TileLayoutProps, firstLed = 0, count = width * height,
): ChainEntry | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || count < 1) return null
  const table = buildXYTable(width, height, props)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  let first: { x: number; y: number } | null = null
  let second: { x: number; y: number } | null = null
  for (let cell = 0; cell < width * height; cell++) {
    const led = table ? table[cell] : cell
    if (led < firstLed || led >= firstLed + count) continue
    const x = cell % width
    const y = Math.floor(cell / width)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    if (led === firstLed) first = { x, y }
    else if (led === firstLed + 1) second = { x, y }
  }
  if (!first) return null
  return {
    x: maxX > minX ? (first.x - minX) / (maxX - minX) : 0,
    y: maxY > minY ? (first.y - minY) / (maxY - minY) : 0,
    dx: second ? Math.sign(second.x - first.x) : 0,
    dy: second ? Math.sign(second.y - first.y) : 0,
  }
}

/** Builds the grid->physical-index wiring table (row-major, length
 *  width*height), or returns null when no remap is needed (plain
 *  row-major matrix/strip: top-left start, rows, serpentine off — the
 *  caller's existing memmove fast path already does the right thing). */
export function buildXYTable(width: number, height: number, props: TileLayoutProps): number[] | null {
  // Every in-app caller clamps the matrix dimensions to 1..64 before getting
  // here, but this is an exported pure function and a negative or non-finite
  // size used to reach `new Array(width * height)` and throw `RangeError:
  // Invalid array length` — an exception from a layout helper, out of a code
  // path whose whole job is to degrade gracefully to row-major. Treat a
  // degenerate size as "no remap needed" instead.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null

  const layout = normalizedLayout(props)
  const wiring = matrixWiringFromProps(props)

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
          const localIndex = matrixLedIndex(r.x, r.y, r.w, r.h, wiring)
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
  if (isRowMajor(wiring)) return null
  return matrixTable(width, height, wiring)
}
