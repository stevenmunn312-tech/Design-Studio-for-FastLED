import { partById, type PartTouchPadSpec } from '../../build/parts/partCatalogue'

export const MPR121_PART_ID = 'adafruit-mpr121-touch-sensor'

const FALLBACK_SPEC: PartTouchPadSpec = {
  device: 'MPR121',
  interface: 'I2C',
  electrodes: 12,
  i2cAddresses: [0x5a, 0x5b, 0x5c, 0x5d],
  defaultI2cAddress: 0x5a,
  touchThreshold: 12,
  releaseThreshold: 6,
}

export function touchPadSpec(partId: unknown): PartTouchPadSpec {
  return partById(String(partId ?? MPR121_PART_ID))?.touchPad ?? FALLBACK_SPEC
}

export function formatTouchPadAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function touchPadAddressOptions(partId: unknown): string[] {
  return touchPadSpec(partId).i2cAddresses.map(formatTouchPadAddress)
}

/** The address this node answers on, or `null` when the part cannot be strapped to it. */
export function touchPadAddress(props: Record<string, unknown>): number | null {
  const spec = touchPadSpec(props.partId)
  const raw = props.i2cAddress
  if (raw === undefined || raw === null || raw === '') return spec.defaultI2cAddress
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 16)
  return Number.isInteger(value) && spec.i2cAddresses.includes(value) ? value : null
}

/** A threshold property as the chip's 8-bit register value, falling back to the part's own figure. */
export function touchPadThreshold(props: Record<string, unknown>, which: 'touch' | 'release'): number {
  const spec = touchPadSpec(props.partId)
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
  return touchPadSpec(partId).electrodes
}
