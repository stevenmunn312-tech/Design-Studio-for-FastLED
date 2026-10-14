/**
 * Gradient Field and Field Blur rules shared by the preview and the sketch.
 */

export const GRADIENT_TYPES = ['linear', 'radial', 'angular'] as const
export type GradientType = typeof GRADIENT_TYPES[number]

export function gradientType(value: unknown): GradientType {
  return (GRADIENT_TYPES as readonly string[]).includes(String(value)) ? value as GradientType : 'linear'
}

/** How many times the gradient repeats across the matrix. */
export const GRADIENT_REPEAT = { min: 1, max: 8, default: 1 } as const

export function gradientRepeat(value: number): number {
  const n = Number.isFinite(value) ? value : GRADIENT_REPEAT.default
  return Math.max(GRADIENT_REPEAT.min, Math.min(GRADIENT_REPEAT.max, n))
}

/** A radial ramp reaches 1 at the corner of a centred gradient: half a diagonal. */
export const RADIAL_REACH = Math.SQRT1_2

/** Whether the ramp wraps (frac) rather than clamps at its ends. Angular is
 *  periodic by nature; a repeated linear or radial ramp wraps by request. */
export function gradientWraps(type: GradientType, repeat: number): boolean {
  return type === 'angular' || repeat > 1
}

/** Field Blur's box radius in pixels. */
export const BLUR_RADIUS = { min: 1, max: 4, default: 1 } as const

export function blurRadius(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : BLUR_RADIUS.default)
  return Math.max(BLUR_RADIUS.min, Math.min(BLUR_RADIUS.max, n))
}
