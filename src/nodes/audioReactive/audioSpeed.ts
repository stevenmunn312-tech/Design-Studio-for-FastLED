/*
 * The audio patterns' Speed slider. Each was tuned at an internal rate of 1,
 * which used to be the top of its 0-1 slider and left no room to go faster.
 * The rate is now twice the slider, so the tuned look sits at 0.5 and 1 runs
 * twice as fast. Doubling is exact in binary, so a saved value halved to fit
 * renders the same pixels, in the preview and in the sketch.
 */
export const AUDIO_SPEED_DEFAULT = 0.5
const AUDIO_SPEED_SCALE = 2

/** The node types whose `speed` slider this scale applies to. */
export const AUDIO_SPEED_NODE_TYPES: ReadonlySet<string> = new Set([
  'BassRings', 'MidrangeWaves', 'MidrangeBloom', 'TreblePrism', 'AudioCascade', 'KickShock',
  'VocalAurora', 'BeatKaleidoscope', 'SpectraMosaic', 'EmberPulse', 'TurbulentBloom',
  'GravityWell', 'RainRipples', 'PrismStorm',
])

/** The internal rate for a slider value. */
export const audioSpeedRate = (slider: number): number => AUDIO_SPEED_SCALE * slider

/** C++ for the internal rate; an unwired slider folds to its own literal. */
export function audioSpeedRateCpp(slider: string): string {
  return /^-?\d+(\.\d+)?(e-?\d+)?$/.test(slider)
    ? String(AUDIO_SPEED_SCALE * Number(slider))
    : `(${AUDIO_SPEED_SCALE.toFixed(1)}f * ${slider})`
}
