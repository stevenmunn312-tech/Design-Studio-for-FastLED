import { partById, type PartTouchPadSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

export const MPR121_PART_ID = 'adafruit-mpr121-touch-sensor'

/** The part's touch pad block; `null` for an unknown part (a missing id is the default part). */
export function touchPadSpec(partId: unknown): PartTouchPadSpec | null {
  return partById(partIdOrDefault(partId, MPR121_PART_ID))?.touchPad ?? null
}

export function formatTouchPadAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function touchPadAddressOptions(partId: unknown): string[] {
  return touchPadSpec(partId)?.i2cAddresses.map(formatTouchPadAddress) ?? []
}

/** The address this node answers on, or `null` when the part cannot be strapped to it. */
export function touchPadAddress(props: Record<string, unknown>): number | null {
  const spec = touchPadSpec(props.partId)
  if (!spec) return null
  const raw = props.i2cAddress
  if (raw === undefined || raw === null || raw === '') return spec.defaultI2cAddress
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 16)
  return Number.isInteger(value) && spec.i2cAddresses.includes(value) ? value : null
}

/**
 * A threshold property as the chip's 8-bit register value, falling back to the
 * part's own figure; `null` when the node's part is unknown.
 */
export function touchPadThreshold(props: Record<string, unknown>, which: 'touch' | 'release'): number | null {
  const spec = touchPadSpec(props.partId)
  if (!spec) return null
  const fallback = which === 'touch' ? spec.touchThreshold : spec.releaseThreshold
  const raw = props[which === 'touch' ? 'touchThreshold' : 'releaseThreshold']
  if (raw === undefined || raw === null || raw === '') return fallback
  const value = Math.round(Number(raw))
  return Number.isFinite(value) ? Math.max(1, Math.min(255, value)) : fallback
}

/** Preview run-state keys: one button per electrode, and the last one touched. */
export const touchPadButtonKey = (nodeId: string, electrode: number) => `${nodeId}:touchpad:${electrode}`
export const touchPadLastElectrode = (nodeId: string) => `${nodeId}:touchpad:last`

export function touchPadElectrodeCount(partId: unknown): number {
  return touchPadSpec(partId)?.electrodes ?? 0
}

/** How many electrodes the node's per-pad outputs cover: the MPR121's twelve. */
export const TOUCH_PAD_PAD_COUNT = 12

/** The per-electrode output for electrode `n`: true while that pad is touched. */
export const touchPadPadPort = (electrode: number) => `pad${electrode}`

/** Which electrode a per-pad output reads, or null for any other port. */
export function touchPadPadIndex(port: string): number | null {
  const match = /^pad(\d+)$/.exec(port)
  const electrode = match ? Number(match[1]) : NaN
  return Number.isInteger(electrode) && electrode < TOUCH_PAD_PAD_COUNT ? electrode : null
}
