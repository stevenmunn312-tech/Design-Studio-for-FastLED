import { partById } from '../../build/parts/partCatalogue'
import type { PartBuzzerSpec } from '../../build/parts/partCatalogue'

/**
 * A buzzer module on one GPIO. An active buzzer has its own oscillator, so the
 * graph can only turn it on and off; the pitch is the part's. The level that
 * sounds it comes from the catalogue's `buzzer` block, so the firmware and the
 * part cannot disagree.
 */
export const BUZZER_PART_ID = 'ky-012-active-buzzer-module'

/** The default signal pin: output-capable on every supported board. */
export const BUZZER_PIN_FALLBACK = 26

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
