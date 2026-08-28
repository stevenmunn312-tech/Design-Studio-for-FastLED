/**
 * Lightweight channel levels for the paired VU fixture.
 *
 * This deliberately does not replace the FastLED-style mono FFT pipeline.
 * Browser samples are normalized floats (-1..1); firmware applies the same
 * constants after converting PCM1802 samples to that range.
 */
export const VU_RMS_NOISE_GATE = 0.006
export const VU_RMS_REFERENCE = 0.25

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

/** Convert a block of normalized PCM samples to a gated 0..1 RMS level. */
export function normalizedRmsLevel(samples: ArrayLike<number>, gain = 1): number {
  if (samples.length === 0) return 0
  let squares = 0
  for (let i = 0; i < samples.length; i++) {
    const sample = Number(samples[i])
    if (!Number.isFinite(sample)) continue
    const normalized = Math.max(-1, Math.min(1, sample))
    squares += normalized * normalized
  }
  const rms = Math.sqrt(squares / samples.length)
  const usable = Math.max(0, rms - VU_RMS_NOISE_GATE)
  const range = VU_RMS_REFERENCE - VU_RMS_NOISE_GATE
  return clamp01(usable * Math.max(0, Number.isFinite(gain) ? gain : 1) / range)
}

export interface StereoLevelSource {
  leftLevel?: number
  rightLevel?: number
  channelCount?: number
  bass?: number
  mids?: number
  treble?: number
  micBass?: number
  micMids?: number
  micTreble?: number
}

export interface StereoLevels {
  left: number
  right: number
  channelCount: 1 | 2
}

/** Resolve browser channel buffers without ever presenting a mono source as
 * false stereo. The right buffer is ignored when the capture reports mono. */
export function levelsFromSampleChannels(
  leftSamples: ArrayLike<number>,
  rightSamples: ArrayLike<number>,
  channelCount: 1 | 2,
  gain = 1,
): StereoLevels {
  const left = normalizedRmsLevel(leftSamples, gain)
  return channelCount === 2
    ? { left, right: normalizedRmsLevel(rightSamples, gain), channelCount: 2 }
    : { left, right: left, channelCount: 1 }
}

function finiteLevel(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? clamp01(number) : null
}

/**
 * Resolve new stereo payloads and legacy mono Audio payloads through one rule.
 * A partial stereo payload is not treated as stereo: its present channel is
 * mirrored, avoiding a silent side when older recordings are mixed with new
 * optional fields.
 */
export function resolveStereoLevels(source: StereoLevelSource): StereoLevels {
  const left = finiteLevel(source.leftLevel)
  const right = finiteLevel(source.rightLevel)
  if (left != null && right != null) {
    return {
      left,
      right,
      channelCount: source.channelCount === 2 ? 2 : 1,
    }
  }
  const explicitMono = left ?? right
  const bands = [
    finiteLevel(source.micBass ?? source.bass),
    finiteLevel(source.micMids ?? source.mids),
    finiteLevel(source.micTreble ?? source.treble),
  ].filter((value): value is number => value != null)
  const mono = explicitMono ?? (bands.length > 0
    ? bands.reduce((sum, value) => sum + value, 0) / bands.length
    : 0)
  return { left: mono, right: mono, channelCount: 1 }
}
