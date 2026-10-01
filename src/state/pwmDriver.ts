import type { NodePort } from '../types'
import { partById } from './partCatalogue'
import type { PartPwmDriverSpec } from './partCatalogue'

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

const FALLBACK_SPEC: PartPwmDriverSpec = {
  device: 'PCA9685', interface: 'I2C', channels: 16, resolutionBits: 12,
  i2cAddresses: Array.from({ length: 48 }, (_, index) => 0x40 + index), defaultI2cAddress: 0x40,
  oscillatorMHz: 25, minPwmHz: 24, maxPwmHz: 1526, defaultPwmHz: 1000,
}

export function pwmDriverSpec(partId: unknown): PartPwmDriverSpec {
  return partById(String(partId ?? PCA9685_PART_ID))?.pwmDriver ?? FALLBACK_SPEC
}

export function formatPwmDriverAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function pwmDriverAddressOptions(partId: unknown): string[] {
  return pwmDriverSpec(partId).i2cAddresses.map(formatPwmDriverAddress)
}

/** The address this node answers on, or `null` when the part cannot be strapped to it. */
export function pwmDriverAddress(props: Record<string, unknown>): number | null {
  const spec = pwmDriverSpec(props.partId)
  const raw = props.i2cAddress
  if (raw === undefined || raw === null || raw === '') return spec.defaultI2cAddress
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 16)
  return Number.isInteger(value) && spec.i2cAddresses.includes(value) ? value : null
}

/** The PWM frequency, clamped to what the chip's prescaler can reach. */
export function pwmDriverHz(props: Record<string, unknown>): number {
  const spec = pwmDriverSpec(props.partId)
  const raw = props.pwmHz
  if (raw === undefined || raw === null || raw === '') return spec.defaultPwmHz
  const value = Math.round(Number(raw))
  return Number.isFinite(value) ? Math.max(spec.minPwmHz, Math.min(spec.maxPwmHz, value)) : spec.defaultPwmHz
}

/** The PRESCALE register value for a frequency: round(osc / (4096 * hz)) - 1. */
export function pwmDriverPrescale(props: Record<string, unknown>): number {
  const spec = pwmDriverSpec(props.partId)
  const counts = 2 ** spec.resolutionBits
  return Math.max(3, Math.min(255, Math.round((spec.oscillatorMHz * 1e6) / (counts * pwmDriverHz(props))) - 1))
}

/** The channel inputs, in the order the board's outputs are numbered. */
export function pwmDriverInputs(partId: unknown): NodePort[] {
  return Array.from({ length: pwmDriverSpec(partId).channels }, (_, index) => ({
    id: pwmDriverChannelId(index), label: `Channel ${index}`, dataType: 'float',
  }))
}

export const pwmDriverChannelId = (index: number) => `channel${index}`
