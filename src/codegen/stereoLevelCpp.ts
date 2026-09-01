import { VU_RMS_NOISE_GATE, VU_RMS_REFERENCE } from '../audio/stereoLevels'

/**
 * The firmware half of the meter-level contract in `audio/stereoLevels.ts`.
 *
 * Every capture path that publishes `_audioLeftLevel`/`_audioRightLevel` owes
 * the VU fixture the same 0..1 scale, whatever it is capturing: a PCM1802
 * line input, a decoded MP3 frame, or a baked envelope. The PCM1802 path and
 * the player's decoder tap each measured their own RMS and only one of them
 * applied the gate and reference, so the same track read roughly four times
 * lower on the player. One emitter removes the second copy that could drift.
 */

const GATE = `${VU_RMS_NOISE_GATE}f`
const REFERENCE = `${VU_RMS_REFERENCE}f`
const GATE_DBFS = (20 * Math.log10(VU_RMS_NOISE_GATE)).toFixed(1)

export interface VuNormalizedLevelOptions {
  /** Emitted function name. */
  name?: string
  /** Leading whitespace, so a class member and a free function can share this. */
  indent?: string
  /** `'static '` for a class member; empty for a free function. */
  qualifier?: string
  /** A capture-side gain macro, or null where the fixture supplies the only gain. */
  gainExpr?: string | null
}

/** Emit `squares`/`frames` -> conditioned 0..1 meter level. */
export function vuNormalizedLevelCpp(options: VuNormalizedLevelOptions = {}): string[] {
  const { name = '_vuNormalizedLevel', indent = '', qualifier = '', gainExpr = null } = options
  const gain = gainExpr ? ` * ${gainExpr}` : ''
  return [
    `${indent}// Keep this in step with audio/stereoLevels.ts: normalized PCM RMS,`,
    `${indent}// a ${GATE_DBFS} dBFS gate (${VU_RMS_NOISE_GATE}), and ${VU_RMS_REFERENCE} RMS as the full meter reference.`,
    `${indent}${qualifier}float ${name}(uint64_t squares, size_t frames) noexcept {`,
    `${indent}  if (!frames) return 0.0f;`,
    `${indent}  float rms = sqrtf((float)squares / (float)frames) / 32768.0f;`,
    `${indent}  float level = (rms - ${GATE})${gain} / (${REFERENCE} - ${GATE});`,
    `${indent}  return level <= 0.0f ? 0.0f : (level >= 1.0f ? 1.0f : level);`,
    `${indent}}`,
  ]
}
