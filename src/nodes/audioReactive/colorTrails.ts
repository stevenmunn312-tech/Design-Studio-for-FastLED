/*
 * Color Trails' flow axes and trail length, shared by the preview, the
 * sketch and the node's controls.
 *
 * The flow shifts every row by a noise profile (Y) and then every column by
 * another (X). Most looks want both alike, so one Flow speed, strength and
 * scale drive both axes, and Independent axes swaps them for a separate X
 * and Y set. The axis keys' defaults are the source prototype's (Y scale
 * 0.32 against X's 0.33); linked, both axes take Flow scale.
 *
 * Trail length is the trail's half-life in seconds. It replaced Persistence,
 * the share kept per frame (0.9–0.9999), which put every usable value in the
 * last thousandth of its slider. The two meet exactly at 60 fps: keeping
 * `p` a frame is a half-life of ln 2 / (60 · −ln p) seconds, so 0.9992 is
 * 14.43 s. The decay is still the node's own, by elapsed time, inside its
 * integer column pass (shared/integerPatterns.ts): the shared trail knob
 * (shared/trailFade.ts) tops out at a 2 s half-life and spends its fade
 * through `fadeToBlackBy`, and these trails run to minutes.
 */

export const COLOR_TRAILS_FLOW_KEYS = ['flowSpeed', 'flowStrength', 'flowScale'] as const
export const COLOR_TRAILS_AXIS_KEYS = ['xSpeed', 'xStrength', 'xScale', 'ySpeed', 'yStrength', 'yScale'] as const

/**
 * Trail length's slider, in seconds of half-life: Persistence 0.9 is 0.11 s,
 * 0.9999 is 115.5 s. Three decades, so it travels on a log scale: the bundled
 * 10–18 s trails sit two thirds to three quarters of the way along rather
 * than in its first sixth. The value is still seconds.
 */
export const COLOR_TRAILS_TRAIL_LENGTH = { min: 0.1, max: 120, step: 0.1, scale: 'log' } as const

/** Whether the axes run apart: the toggle is never wired, so the sketch decides it at generation. */
export function colorTrailsIndependent(properties: Record<string, unknown>): boolean {
  return properties.independentAxes === true
}

/** The Flow rows while linked, the X and Y rows while independent. */
export function colorTrailsPropertyEnabled(key: string, properties: Record<string, unknown>): boolean {
  if ((COLOR_TRAILS_FLOW_KEYS as readonly string[]).includes(key)) return !colorTrailsIndependent(properties)
  if ((COLOR_TRAILS_AXIS_KEYS as readonly string[]).includes(key)) return colorTrailsIndependent(properties)
  return true
}

/** The Trail length (half-life, seconds) that fades as keeping `retain` of the trail every 60 fps frame. */
export function colorTrailsHalfLife(retain: number): number {
  return Math.LN2 / (60 * -Math.log(retain))
}

/**
 * The share of the trail a pass keeps over `dtFrames` 60ths of a second at a
 * half-life of `halfLife` seconds: none at 0 or below, as Persistence 0 kept
 * none.
 */
export function colorTrailsKeep(halfLife: number, dtFrames: number): number {
  return halfLife > 0 ? Math.max(0, Math.min(1, Math.pow(2, -dtFrames / (60 * halfLife)))) : 0
}

/** The firmware twin of `colorTrailsKeep`, as an expression. */
export function colorTrailsKeepCpp(halfLife: string, dtFrames: string): string {
  return `(${halfLife}>0.0f?constrain(powf(2.0f,-(${dtFrames})/(60.0f*(${halfLife}))),0.0f,1.0f):0.0f)`
}
