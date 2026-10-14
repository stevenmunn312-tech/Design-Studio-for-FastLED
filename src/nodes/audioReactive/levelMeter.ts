/** Level Meter's bar rules, shared by the preview and the sketch. */

export const METER_ORIGINS = ['start', 'end', 'center'] as const
export type MeterOrigin = typeof METER_ORIGINS[number]

export function meterOrigin(value: unknown): MeterOrigin {
  return (METER_ORIGINS as readonly string[]).includes(String(value)) ? value as MeterOrigin : 'start'
}

/** Seconds the peak marker holds before it starts to fall; 0 turns it off. */
export const METER_PEAK_HOLD = { min: 0, max: 5, default: 1 } as const

/** How fast a released peak falls, in full-scale units per second. */
export const METER_PEAK_FALL = 0.8

/** The lit length along the bar's axis, in LEDs, for a 0–1 level. */
export function meterFill(level: number, span: number): number {
  const v = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0))
  return Math.round(v * span)
}

/** Distance of LED `coord` from the bar's origin, in LEDs (0 at the origin). */
export function meterDistance(origin: MeterOrigin, coord: number, span: number): number {
  switch (origin) {
    case 'end': return span - 1 - coord
    case 'center': return Math.abs(coord - (span - 1) / 2) * 2
    case 'start':
    default: return coord
  }
}
