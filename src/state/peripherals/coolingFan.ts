import { partById, type PartFanSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

export const COOLING_FAN_PART_ID = 'noctua-nf-a4x10-5v-pwm'
export const COOLING_FAN_PWM_PIN_FALLBACK = 25
export const COOLING_FAN_TACH_PIN_FALLBACK = 26
export const COOLING_FAN_SPEED_DEFAULT = 1

/** The part's fan block; `null` for an unknown part (a missing id is the default part). */
export function coolingFanSpec(partId: unknown): PartFanSpec | null {
  return partById(partIdOrDefault(partId, COOLING_FAN_PART_ID))?.fan ?? null
}

export function coolingFanSpeed(value: unknown): number {
  const speed = Number(value)
  return Number.isFinite(speed) ? Math.max(0, Math.min(1, speed)) : COOLING_FAN_SPEED_DEFAULT
}

/** Browser estimate only; firmware replaces it with tachometer pulses. */
export function coolingFanPreviewRpm(partId: unknown, value: unknown): number {
  const speed = coolingFanSpeed(value)
  if (speed <= 0) return 0
  const spec = coolingFanSpec(partId)
  if (!spec) return 0
  if (speed <= 0.2) return spec.minRpmAt20Percent * speed / 0.2
  const position = (speed - 0.2) / 0.8
  return spec.minRpmAt20Percent + position * (spec.maxRpm - spec.minRpmAt20Percent)
}
