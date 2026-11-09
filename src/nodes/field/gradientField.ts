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

/*
 * Gradient Field measures in pixels from its pivot (cx, cy), one unit on both
 * axes, so a radial ramp is round and Angle is a true angle on any panel. A
 * linear ramp spans the panel's extent along Angle (as Palette Gradient does),
 * so at 0 and 90 degrees it runs edge to edge and at a diagonal corner to
 * corner; a radial ramp reaches 1 half a diagonal out, the corner of a centred
 * gradient. On a square panel at 0 or 90 degrees this is the per-axis 0–1 the
 * node used before.
 */

/** Pixels a linear ramp at this angle takes to run from 0 to 1. */
export function gradientLinearSpan(cosA: number, sinA: number, W: number, H: number): number {
  return Math.max(1e-6, Math.abs(cosA) * (W - 1) + Math.abs(sinA) * (H - 1))
}

/** Pixels a radial ramp takes to reach 1: half the diagonal. */
export function gradientRadialSpan(W: number, H: number): number {
  return Math.max(1e-6, 0.5 * Math.hypot(W - 1, H - 1))
}

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
