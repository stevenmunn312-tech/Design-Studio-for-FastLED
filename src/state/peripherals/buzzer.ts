import { partById } from '../../build/parts/partCatalogue'
import type { PartBuzzerSpec } from '../../build/parts/partCatalogue'
import type { NodePort } from '../../types'

/**
 * A buzzer module on one GPIO. An active buzzer has its own oscillator, so the
 * graph can only turn it on and off; the pitch is the part's. A passive buzzer
 * has none: the controller plays a square wave at the pitch the graph gives
 * it. The level that sounds an active part, and the pitch a passive part is
 * loudest at, come from the catalogue's `buzzer` block, so the firmware and
 * the part cannot disagree.
 */
export const BUZZER_PART_ID = 'ky-012-active-buzzer-module'
export const PASSIVE_BUZZER_PART_ID = 'ky-006-passive-buzzer-module'

/** The default signal pin: output-capable on every supported board. */
export const BUZZER_PIN_FALLBACK = 26

/**
 * The pitches a passive buzzer is asked for, in hertz. Below about 100 Hz a
 * small transducer only clicks; above 10 kHz it is near-silent and shrill.
 * The firmware clamps to this range, and the inspector slider spans it.
 */
export const BUZZER_PITCH_MIN_HZ = 100
export const BUZZER_PITCH_MAX_HZ = 10000
/** The KY-006's loudest pitch, which is where a new node starts. */
export const BUZZER_PITCH_DEFAULT_HZ = 2000

/** Used only when a saved part id no longer names a buzzer in the catalogue. */
const FALLBACK_SPEC: PartBuzzerSpec = {
  type: 'active', activeLevel: 'high', resonanceKHz: 2.5, soundLevel: '', maxCurrentMa: 30,
}

export function buzzerSpec(partId: unknown): PartBuzzerSpec {
  return partById(String(partId ?? BUZZER_PART_ID))?.buzzer
    ?? partById(BUZZER_PART_ID)?.buzzer
    ?? FALLBACK_SPEC
}

export const buzzerActiveHigh = (partId: unknown) => buzzerSpec(partId).activeLevel === 'high'

export const buzzerIsPassive = (partId: unknown) => buzzerSpec(partId).type === 'passive'

const SOUND_INPUT: NodePort = { id: 'on', label: 'Sound', dataType: 'bool' }
const PITCH_INPUT: NodePort = { id: 'pitch', label: 'Pitch', dataType: 'float' }

/** Ports a buzzer can have beyond an active one's Sound. */
export const BUZZER_VARIANT_INPUTS: readonly NodePort[] = [PITCH_INPUT]

/** The ports the selected part has: Sound always, Pitch only on a passive one. */
export function buzzerInputs(partId: unknown): NodePort[] {
  return buzzerIsPassive(partId) ? [SOUND_INPUT, PITCH_INPUT] : [SOUND_INPUT]
}

/** The pitch a passive buzzer plays for a requested value: whole hertz, in range, never NaN. */
export function buzzerPitchHz(value: unknown): number {
  const hz = Number(value)
  if (!(hz >= BUZZER_PITCH_MIN_HZ)) return BUZZER_PITCH_MIN_HZ
  return Math.min(BUZZER_PITCH_MAX_HZ, Math.round(hz))
}
