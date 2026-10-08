import { partById, type PartFanSpec } from '../../build/parts/partCatalogue'

export const COOLING_FAN_PART_ID = 'noctua-nf-a4x10-5v-pwm'
export const COOLING_FAN_PWM_PIN_FALLBACK = 25
export const COOLING_FAN_TACH_PIN_FALLBACK = 26
export const COOLING_FAN_SPEED_DEFAULT = 1

const FALLBACK_SPEC: PartFanSpec = {
  supplyVoltageV: 5,
  maxCurrentA: 0.07,
  maxRpm: 5000,
  minRpmAt20Percent: 1050,
  pwmHz: 25000,
  tachPulsesPerRevolution: 2,
  tachOutput: 'open-collector, 5 mA maximum',
}

export function coolingFanSpec(partId: unknown): PartFanSpec {
  return partById(String(partId ?? COOLING_FAN_PART_ID))?.fan ?? FALLBACK_SPEC
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
  if (speed <= 0.2) return spec.minRpmAt20Percent * speed / 0.2
  const position = (speed - 0.2) / 0.8
  return spec.minRpmAt20Percent + position * (spec.maxRpm - spec.minRpmAt20Percent)
}
