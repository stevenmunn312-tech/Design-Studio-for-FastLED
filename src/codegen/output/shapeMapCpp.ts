// The firmware half of a shape-mapped LED output: the PROGMEM table that says
// which render pixel each LED reads, and the loop that copies the render
// buffer into the physical chain through it.
//
// One emitter for the normal sketch, the show sketch and the SD player, so a
// ring, a corkscrew and a positioned string light the same LED from the same
// pixel in all three — and the same pixel the preview's `routeFrame` draws,
// because the maps come from the helpers it uses.

import type { OutputRoute } from '../../state/output/outputRouting'
import { ringMapFor, corkscrewMapFor } from '../../state/output/outputRouting'
import { POSITION_FIXED_SCALE, positionsFixedFor } from '../../state/output/stringPositions'
import { positionReadCpp } from './renderScaleCpp'

export type ShapeKind = 'ring' | 'corkscrew' | 'positions'

export interface ShapeMap {
  kind: ShapeKind
  /** The PROGMEM contents: one render index per LED, or an x, y pair per LED
   *  in 1/256 render pixels for a positioned string. */
  table: number[]
  /** Physical LEDs on the chain. */
  ledCount: number
}

export type ShapeCountMacro = 'RING_LEDS' | 'CORKSCREW_LEDS' | 'POS_LEDS'

/** The `#define` naming a shape's physical LED count in a single-output sketch. */
export const SHAPE_COUNT_MACRO: Record<ShapeKind, ShapeCountMacro> = {
  ring: 'RING_LEDS',
  corkscrew: 'CORKSCREW_LEDS',
  positions: 'POS_LEDS',
}

const SHAPE_TABLE_BASE: Record<ShapeKind, string> = {
  ring: '_ringmap',
  corkscrew: '_corkscrewmap',
  positions: '_posmap',
}

/** The PROGMEM table's name: `_ringmap` alone, or `_ringmap_<route>` per route. */
export function shapeTableName(kind: ShapeKind, suffix = ''): string {
  return `${SHAPE_TABLE_BASE[kind]}${suffix}`
}

/**
 * The shape map a route reads its render canvas through, or null for a grid
 * and a straight chain. `renderW` x `renderH` is the canvas that actually
 * exists for this route — its own, or a shared composition — because the map
 * indexes that canvas.
 */
export function shapeMapFor(route: OutputRoute, renderW: number, renderH: number): ShapeMap | null {
  const ring = ringMapFor(route, renderW, renderH)
  if (ring) return { kind: 'ring', table: ring, ledCount: ring.length }
  const corkscrew = corkscrewMapFor(route, renderW, renderH)
  if (corkscrew) return { kind: 'corkscrew', table: corkscrew, ledCount: corkscrew.length }
  if (route.positions) {
    const table = positionsFixedFor(route.positions, renderW, renderH)
    return { kind: 'positions', table, ledCount: table.length / 2 }
  }
  return null
}

/** `#define RING_LEDS 24 // ...` for a single-output sketch. */
export function shapeCountDefineCpp(shape: ShapeMap): string {
  const macro = SHAPE_COUNT_MACRO[shape.kind]
  const comment = shape.kind === 'ring' ? 'LEDs around the ring'
    : shape.kind === 'corkscrew' ? 'LEDs along the helix'
      : 'LEDs on the positioned string'
  return `#define ${macro} ${shape.ledCount}`.padEnd(32) + `// ${comment}`
}

/**
 * The PROGMEM table. `length` is the C++ array length expression: the count
 * macro (times two for positions) in a single-output sketch, a literal when
 * the table is one route's among several.
 */
export function shapeTableCpp(shape: ShapeMap, names: { table: string; length: string; label?: string }): string[] {
  const forLabel = names.label ? ` for ${names.label}` : ''
  const comment = shape.kind === 'ring'
    ? names.label
      ? [`// Ring sample map${forLabel} — render index per LED.`]
      : [`// Ring sample map (LED index -> render index), baked from the ring's`, `// LED count, start angle, and direction.`]
    : shape.kind === 'corkscrew'
      ? names.label
        ? [`// Corkscrew sample map${forLabel} — unwrapped-cylinder render index per LED.`]
        : [`// Corkscrew sample map (LED index -> render index), baked from the`, `// cylinder size, turns, start angle, and direction.`]
      : names.label
        ? [`// Position map${forLabel} — x, y per LED in 1/${POSITION_FIXED_SCALE} render pixels.`]
        : [`// Position map: x, y per LED in 1/${POSITION_FIXED_SCALE} render pixels, baked from the`, `// output's positions. The output reads the render buffer bilinearly there.`]
  return [
    ...comment,
    `const uint16_t ${names.table}[${names.length}] PROGMEM = { ${shape.table.join(',')} };`,
  ]
}

export interface ShapeCopyEmit {
  /** The render buffer, `srcW` x `srcH`, row-major. */
  src: string
  /** The physical array the shape's LEDs are written to. */
  leds: string
  table: string
  /** C++ expression for the LED count: the macro or a literal. */
  count: string
  /** C++ expressions for the render size; a positioned string samples between pixels. */
  srcW: string
  srcH: string
  /** Statement run on the finished `_c` before it is stored, or null. */
  post?: string | null
  indent?: string
}

/** The per-frame copy from the render buffer into the chain, through the table. */
export function shapeCopyCpp(shape: ShapeMap, e: ShapeCopyEmit): string[] {
  const i = e.indent ?? '  '
  if (shape.kind === 'positions') {
    return positionReadCpp({
      src: e.src, table: e.table, count: e.count, srcW: e.srcW, srcH: e.srcH, leds: e.leds, post: e.post, indent: i,
    })
  }
  const read = `${e.src}[pgm_read_word(&${e.table}[_i])]`
  if (!e.post) return [`${i}for (int _i = 0; _i < ${e.count}; _i++) ${e.leds}[_i] = ${read};`]
  return [
    `${i}for (int _i = 0; _i < ${e.count}; _i++) {`,
    `${i}  CRGB _c = ${read}; ${e.post}`,
    `${i}  ${e.leds}[_i] = _c;`,
    `${i}}`,
  ]
}
