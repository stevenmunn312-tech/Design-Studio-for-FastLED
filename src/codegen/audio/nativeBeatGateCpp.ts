import {
  NATIVE_BEAT_COOLDOWN_FRACTION,
  NATIVE_BEAT_COOLDOWN_MAX_MS,
  NATIVE_BEAT_COOLDOWN_MIN_MS,
} from '../../audio/beatDetection'
import { floatLit } from '../cppLiterals'

/**
 * The firmware half of `gateNativeBeat` in `audio/beatDetection.ts`.
 *
 * Every host that publishes `_audioBeat` from a FastLED processor (the
 * microphone and line-in engine, the SD player's decoder tap) also publishes
 * `_audioBeatConfidence`, so one gate serves a Beat Detect node in a sketch and
 * a decoder-fed Beat Detect sampled by the SD player's control graph. Both
 * read the same constants as the preview.
 */
export interface NativeBeatGateNames {
  /** The gated beat, declared `bool`. */
  beat: string
  /** The threshold in use, declared `const float`. */
  threshold: string
  /** The cooldown in milliseconds, declared `const float`. */
  cooldownMs: string
  /** Stem for the gate's static last-beat time. */
  state: string
}

export function nativeBeatGateCpp(names: NativeBeatGateNames, thresholdExpr: string): string[] {
  const last = `${names.state}_lastBeat`
  const fraction = floatLit(NATIVE_BEAT_COOLDOWN_FRACTION)
  const min = floatLit(NATIVE_BEAT_COOLDOWN_MIN_MS)
  const max = floatLit(NATIVE_BEAT_COOLDOWN_MAX_MS)
  return [
    `  static uint32_t ${last} = 0;`,
    `  const float ${names.threshold} = ${thresholdExpr};`,
    `  const float ${names.cooldownMs} = constrain(60000.0f / (_audioBpm > 0.0f ? _audioBpm : 120.0f) * ${fraction}, ${min}, ${max});`,
    `  bool ${names.beat} = _audioBeat && _audioBeatConfidence >= ${names.threshold}`
      + ` && (${last} == 0 || millis() - ${last} >= (uint32_t)${names.cooldownMs});`,
    `  if (${names.beat}) ${last} = millis();`,
  ]
}
