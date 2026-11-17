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

/**
 * The one place a raw RMS becomes a meter level. Every producer of a
 * `leftLevel`/`rightLevel` — browser capture, browser decoder preview, the
 * offline bake, and both firmware capture paths — owes the fixture the same
 * 0..1 scale, so the conversion lives here rather than being restated at each
 * measurement site. `src/codegen/audio/stereoLevelCpp.ts` emits the C++ half from
 * these same constants.
 */
export function conditionRmsLevel(rms: number, gain = 1): number {
  if (!Number.isFinite(rms) || rms <= VU_RMS_NOISE_GATE) return 0
  const usable = rms - VU_RMS_NOISE_GATE
  const range = VU_RMS_REFERENCE - VU_RMS_NOISE_GATE
  return clamp01(usable * Math.max(0, Number.isFinite(gain) ? gain : 1) / range)
}

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
  return conditionRmsLevel(Math.sqrt(squares / samples.length), gain)
}

export interface StereoLevelSource {
  /** Audio Features' Loudness when the source states its own (decoded music,
   *  see `decodedLoudness`); absent on capture, which reads the meters. */
  loudness?: number
  micActive?: boolean
  nativeFastLed?: boolean
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

/**
 * Absolute loudness for Audio Features: the louder raw channel meter, 0..1 on
 * the VU scale above. It deliberately skips `resolveStereoLevels`, whose
 * microphone branch substitutes FastLED's peak-normalised bands, because a
 * loudness that adapts to the last few seconds' peak reads a quiet verse as
 * loud and a steady chorus as middling. A payload without channel meters
 * (legacy recordings) is 0. A source that states its own `loudness` (decoded
 * music) is read as stated. Firmware twin: `_audioLoudness` from
 * `src/codegen/audio/audioEngineCpp.ts` and the player sketch.
 */
export function audioLoudness(source: StereoLevelSource): number {
  const own = finiteLevel(source.loudness)
  if (own !== null) return own
  return Math.max(finiteLevel(source.leftLevel) ?? 0, finiteLevel(source.rightLevel) ?? 0)
}

/**
 * Decoded music's meter on the room scale Loudness is read on.
 *
 * Loudness's readers (the shared energy stage, Audio Features' Level and
 * Silence) are sized to a microphone at gain 1 hearing music in a room: about
 * 0.02, 0.09 and 0.17 at the 10th, 50th and 90th percentiles, peaking near
 * 0.34. Capture has a gain knob to land there. Decoded music has none: it
 * reaches the meter at line level, where 41 mastered tracks sat at 0.22, 0.63
 * and 1.0 (pinned), so the stage stayed fully open and a quiet passage lit as
 * brightly as a drop. Scaled by `DECODED_LOUDNESS_SCALE`, a pinned meter
 * reads 0.3, the room's loud peak and the top of the energy stage's ramps,
 * and the scale stays a straight line below it: the stage's response is
 * linear in the meter, from silence to full volume.
 */
export const DECODED_LOUDNESS_SCALE = 0.3

export function decodedLoudness(leftLevel: number, rightLevel: number): number {
  return clamp01(Math.max(finiteLevel(leftLevel) ?? 0, finiteLevel(rightLevel) ?? 0) * DECODED_LOUDNESS_SCALE)
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
  // The device microphone path exposes FastLED's adaptively-normalized bands,
  // not a fixed raw-RMS channel meter. Use the same mono value in the browser
  // so a loud mic moment reaches full scale in both runtimes. Raw left/right
  // levels remain authoritative for music analysis and true stereo line-in.
  if (source.micActive && source.nativeFastLed === true) {
    const micBands = [source.micBass, source.micMids, source.micTreble]
      .map(finiteLevel)
      .filter((value): value is number => value != null)
    if (micBands.length > 0) {
      // A level meter follows the dominant band. Averaging three normalized
      // bands held a loud bass- or treble-led passage near one third scale.
      const mono = Math.max(...micBands)
      return { left: mono, right: mono, channelCount: 1 }
    }
  }
  if (source.channelCount === 2 && left != null && right != null) {
    return { left, right, channelCount: 2 }
  }
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
