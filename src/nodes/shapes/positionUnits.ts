/*
 * Where Shape, Text, Clock Display and Line put a position, and the twin C++
 * each sketch emits. Every one of them has a Units select:
 *
 * - 0–1 (`normalized`, the default) is a fraction of the matrix. For Shape,
 *   Text and Clock Display, 0 and 1 park the object just off each edge and 0.5
 *   centres it; wrapped, 0–1 runs over two matrix lengths so the object leaves
 *   one side as it comes in at the other. For Line, 0 is the first pixel and 1
 *   the last, so (0, 0) to (1, 1) runs corner to corner on any matrix.
 * - Pixels are pixel coordinates, one convention for all four: pixel n's
 *   centre is n, 0 is the first pixel, `max_x` the last and `center_x` the
 *   middle.
 *
 * Units used to be inferred, any value above 1 reading as a pixel, so a wired
 * LFO overshooting to 1.05 jumped from the right edge to pixel 1. Units is a
 * property, never wired, so each sketch resolves it when it is generated.
 */

export const POSITION_UNITS = ['normalized', 'pixels'] as const
export type PositionUnits = typeof POSITION_UNITS[number]

export const POSITION_UNIT_LABELS: Readonly<Record<PositionUnits, string>> = { normalized: '0–1', pixels: 'Pixels' }

export function positionUnits(value: unknown): PositionUnits {
  return value === 'pixels' ? 'pixels' : 'normalized'
}

/** The position properties the Units select governs, per node. */
export const POSITION_UNIT_KEYS: Readonly<Record<string, readonly string[]>> = {
  Shape: ['cx', 'cy'],
  Text: ['x', 'y'],
  ClockDisplay: ['x', 'y'],
  Line: ['x1', 'y1', 'x2', 'y2'],
}

/** Whether `key` is a position that Units governs on `nodeType`. */
export function isPositionUnitKey(nodeType: string, key: string): boolean {
  return POSITION_UNIT_KEYS[nodeType]?.includes(key) ?? false
}

/**
 * The centre of an object reaching `extent` pixels either side, along an axis
 * `size` pixels long, in pixel-edge coordinates: pixel n spans n to n + 1, so
 * its centre is n + 0.5. Shape draws from it.
 */
export function centerAxis(value: number, units: PositionUnits, size: number, extent: number, wrap: boolean): number {
  if (units === 'pixels') return value + 0.5
  if (wrap) return size * 0.5 - size + value * (size * 2)
  const margin = extent + 1
  return 0.5 - margin + value * (Math.max(0, size - 1) + 2 * margin)
}

/**
 * `centerAxis` in C++. `marginVar` is a local holding extent + 1, read only
 * unwrapped at 0–1.
 */
export function centerAxisCpp(valueExpr: string, units: PositionUnits, sizeVar: string, marginVar: string, wrap: boolean): string {
  if (units === 'pixels') return `${valueExpr}+0.5f`
  if (wrap) return `(${sizeVar}*0.5f-${sizeVar})+${valueExpr}*(${sizeVar}*2.0f)`
  return `(0.5f-${marginVar})+${valueExpr}*((${sizeVar}-1.0f)+2.0f*${marginVar})`
}

/**
 * The analogue clock face's centre, in pixel-index coordinates (its ring and
 * hands measure from pixel n at n). At 0–1 it keeps `centerAxis`'s placement,
 * half a pixel past the middle as it always sat; in pixels it is the pixel.
 */
export function clockCenterAxis(value: number, units: PositionUnits, size: number, radius: number): number {
  return units === 'pixels' ? value : centerAxis(value, 'normalized', size, radius, false)
}

/** `clockCenterAxis` in C++, `radiusVar` the face's radius. */
export function clockCenterAxisCpp(valueVar: string, units: PositionUnits, sizeVar: string, radiusVar: string): string {
  if (units === 'pixels') return valueVar
  return `(0.5f - (${radiusVar} + 1.0f)) + ${valueVar} * ((${sizeVar} - 1.0f) + 2.0f * (${radiusVar} + 1.0f))`
}

export type TextAlign = 'start' | 'center' | 'end'

/**
 * The first column (or row) of a run of text `length` pixels long, placed by
 * `value`: its middle there for 'center', its leading edge for 'start', its
 * trailing edge for 'end'. At 0–1 the edges anchor to a point between pixels
 * and slide as `centerAxis` does; in pixels 'start' begins on pixel `value`
 * and 'end' finishes on it.
 */
export function textAxisStart(value: number, units: PositionUnits, size: number, length: number, align: TextAlign, wrap: boolean): number {
  if (units === 'pixels') {
    if (align === 'center') return Math.floor(value + 0.5 - length * 0.5)
    const first = Math.floor(value + 0.5)
    return align === 'end' ? first + 1 - length : first
  }
  if (align === 'center') return Math.floor(centerAxis(value, units, size, length * 0.5, wrap) - length * 0.5)
  const edge = Math.floor(centerAxis(value, units, size, 0, wrap))
  return align === 'end' ? edge - length : edge
}

/**
 * `textAxisStart` in C++, the float-then-floor order exactly: the floor comes
 * before the (integer) length is taken off for 'end', not after.
 */
export function textAxisStartCpp(valueExpr: string, units: PositionUnits, sizeVar: string, lengthExpr: string, align: TextAlign, wrap: boolean): string {
  if (units === 'pixels') {
    if (align === 'center') return `floorf((${valueExpr}) + 0.5f - (${lengthExpr}) * 0.5f)`
    const first = `floorf((${valueExpr}) + 0.5f)`
    return align === 'end' ? `(${first}) + 1 - (${lengthExpr})` : first
  }
  if (align === 'center') {
    const half = `(${lengthExpr}) * 0.5f`
    if (wrap) {
      return `floorf((${sizeVar} * 0.5f - ${sizeVar}) + (${valueExpr}) * (${sizeVar} * 2.0f) - (${half}))`
    }
    return `floorf((0.5f - ((${half}) + 1.0f)) + (${valueExpr}) * ((${sizeVar} - 1.0f) + 2.0f * ((${half}) + 1.0f)) - (${half}))`
  }
  const edge = wrap
    ? `floorf((${sizeVar} * 0.5f - ${sizeVar}) + (${valueExpr}) * (${sizeVar} * 2.0f))`
    : `floorf((0.5f - 1.0f) + (${valueExpr}) * ((${sizeVar} - 1.0f) + 2.0f))`
  return align === 'end' ? `(${edge}) - (${lengthExpr})` : edge
}

/** A Line end, as a pixel-centre coordinate: at 0–1, 0 is the first pixel and 1 the last. */
export function lineAxis(value: number, units: PositionUnits, size: number): number {
  return units === 'pixels' ? value : value * (size - 1)
}

/** `lineAxis` in C++. */
export function lineAxisCpp(valueExpr: string, units: PositionUnits, sizeVar: string): string {
  return units === 'pixels' ? valueExpr : `(${valueExpr})*(${sizeVar}-1.0f)`
}
