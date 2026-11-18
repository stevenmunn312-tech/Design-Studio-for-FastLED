import type { NodePort } from '../../types'
import { partById } from '../../build/parts/partCatalogue'
import type { PartPwmDriverSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

/**
 * A 16-channel I2C PWM driver (PCA9685). Each channel takes a 0-1 level and the
 * chip holds it as a free-running 12-bit duty cycle, so the graph sets a value
 * and the chip keeps the waveform going. Every electrical number comes from the
 * catalogue's `pwmDriver` block, so the firmware, the address picker and the
 * frequency range cannot disagree with the board.
 */
export const PCA9685_PART_ID = 'adafruit-pca9685-pwm-driver'

/** The chip's 12-bit counter: a level of 1 is a full count. */
export const PWM_DRIVER_FULL_COUNT = 4095

/** The part's PWM-driver block; `null` for an unknown part (a missing id is the default part). */
export function pwmDriverSpec(partId: unknown): PartPwmDriverSpec | null {
  return partById(partIdOrDefault(partId, PCA9685_PART_ID))?.pwmDriver ?? null
}

export function formatPwmDriverAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function pwmDriverAddressOptions(partId: unknown): string[] {
  return pwmDriverSpec(partId)?.i2cAddresses.map(formatPwmDriverAddress) ?? []
}

/** The address this node answers on, or `null` when the part cannot be strapped to it. */
export function pwmDriverAddress(props: Record<string, unknown>): number | null {
  const spec = pwmDriverSpec(props.partId)
  if (!spec) return null
  const raw = props.i2cAddress
  if (raw === undefined || raw === null || raw === '') return spec.defaultI2cAddress
  const text = typeof raw === 'string' ? raw.trim() : ''
  const value = typeof raw === 'number' ? raw
    : /^(?:0x)?[0-9a-f]{2}$/i.test(text) ? Number.parseInt(text, 16) : NaN
  return Number.isInteger(value) && spec.i2cAddresses.includes(value) ? value : null
}

/** The frequencies the part's prescaler can reach; `null` for an unknown part. */
export function pwmDriverHzRange(partId: unknown): { min: number; max: number } | null {
  const spec = pwmDriverSpec(partId)
  return spec ? { min: spec.minPwmHz, max: spec.maxPwmHz } : null
}

/** The PWM frequency, clamped to what the chip's prescaler can reach; `null` for an unknown part. */
export function pwmDriverHz(props: Record<string, unknown>): number | null {
  const spec = pwmDriverSpec(props.partId)
  if (!spec) return null
  const raw = props.pwmHz
  if (raw === undefined || raw === null || raw === '') return spec.defaultPwmHz
  const value = Math.round(Number(raw))
  return Number.isFinite(value) ? Math.max(spec.minPwmHz, Math.min(spec.maxPwmHz, value)) : spec.defaultPwmHz
}

/** The PRESCALE register value for a frequency: round(osc / (4096 * hz)) - 1. */
export function pwmDriverPrescale(props: Record<string, unknown>): number | null {
  const spec = pwmDriverSpec(props.partId)
  const hz = pwmDriverHz(props)
  if (!spec || hz === null) return null
  const counts = 2 ** spec.resolutionBits
  return Math.max(3, Math.min(255, Math.round((spec.oscillatorMHz * 1e6) / (counts * hz)) - 1))
}

/** The channel inputs, in the order the board's outputs are numbered. */
export function pwmDriverInputs(partId: unknown): NodePort[] {
  return Array.from({ length: pwmDriverSpec(partId)?.channels ?? 0 }, (_, index) => ({
    id: pwmDriverChannelId(index), label: `Channel ${index}`, dataType: 'float',
  }))
}

export const pwmDriverChannelId = (index: number) => `channel${index}`
