/**
 * Noise's algorithms and Plasma's styles, shared by the preview, the sketch
 * and the property metadata, so a select value cannot mean one thing in the
 * browser and another on the controller.
 *
 * Noise once had nine types, four of them near-duplicate clouds. Simplex and
 * Noise 3D are now fbm presets (`NOISE_PRESETS`), and the two sine types
 * moved to Plasma as its Sine Grid and Sine 2D styles. Plasma Fractal stays
 * a Noise type: its fractal half is three octaves of simplex noise weighted
 * well above its sines, it needs the sketch's `_snoise2`, and it offers the
 * Field output Plasma does not have.
 */
export const NOISE_TYPES = ['fbm', 'noise4d', 'worley', 'plasma', 'gabor'] as const
export type NoiseType = typeof NOISE_TYPES[number]

/** A missing or unknown type (a save from before the merge) draws fbm. */
export function noiseType(value: unknown): NoiseType {
  return (NOISE_TYPES as readonly string[]).includes(String(value)) ? value as NoiseType : 'fbm'
}

/**
 * Plasma's styles: the classic interference plasma, the Sine Grid of two
 * crossed waves, and Sine 2D's three layered sine-times-cosine octaves.
 */
export const PLASMA_STYLES = ['classic', 'sineGrid', 'sine2d'] as const
export type PlasmaStyle = typeof PLASMA_STYLES[number]

/** A missing style is the classic plasma, which every Plasma drew before. */
export function plasmaStyle(value: unknown): PlasmaStyle {
  return (PLASMA_STYLES as readonly string[]).includes(String(value)) ? value as PlasmaStyle : 'classic'
}

/**
 * The old Simplex and Noise 3D types as fbm settings, chosen by rendering
 * both before and after and matching three measures of the field: the
 * spread of its values (contrast), its feature size and how fast it
 * decorrelates over time (motion).
 *
 * Simplex summed the same four simplex octaves as fbm at the same scale, but
 * unnormalised, so its field spread 1.85 times as far (standard deviation
 * 0.268 against 0.145), and it drifted 2.5 times as fast for the same slider
 * (a third speed range). Noise 3D was three octaves of two crossing slices,
 * 1.25 times fbm's spread, and decorrelated as fbm does at 0.9 of its speed.
 * Both wrapped their value round the palette, so the seams they cut through
 * lava and fire are gone. Neither preset can turn the drift's direction,
 * which fbm fixes.
 *
 * The presets are those types at their defaults (speed 0.5, scale 0.5);
 * Simplex at that speed is past fbm's fastest, so its preset runs at 1. A
 * converted graph scales its own speed by `SIMPLEX_SPEED_AS_FBM` or
 * `NOISE3D_SPEED_AS_FBM`.
 */
export const SIMPLEX_SPEED_AS_FBM = 2.5
export const NOISE3D_SPEED_AS_FBM = 0.9

export interface BuiltInPreset {
  name: string
  properties: Readonly<Record<string, unknown>>
}

export const NOISE_PRESETS: readonly BuiltInPreset[] = [
  { name: 'Simplex', properties: { noiseType: 'fbm', octaves: 4, speed: 1, scale: 0.5, contrast: 1.85 } },
  { name: 'Noise 3D', properties: { noiseType: 'fbm', octaves: 3, speed: 0.45, scale: 0.5, contrast: 1.25 } },
]
