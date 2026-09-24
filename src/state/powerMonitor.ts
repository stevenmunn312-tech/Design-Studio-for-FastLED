import { partById } from './partCatalogue'
import type { PartPowerMonitorSpec } from './partCatalogue'

/**
 * A current/voltage monitor: an I2C part that measures the current through its
 * own shunt and the voltage on the load side of it, and publishes volts, amps
 * and watts to the graph. Every electrical number comes from the catalogue's
 * `powerMonitor` block, so the firmware's arithmetic and the address picker
 * cannot disagree with the board.
 */
export const DEFAULT_POWER_MONITOR_PART_ID = 'adafruit-ina219-current-sensor'

/** The three measurements, in the order the node's outputs declare them. */
export const POWER_MONITOR_OUTPUTS = ['volts', 'amps', 'watts'] as const

/** Used only when a saved part id no longer names a monitor in the catalogue. */
const FALLBACK_SPEC: PartPowerMonitorSpec = {
  device: 'INA219', interface: 'I2C', i2cAddresses: [0x40, 0x41, 0x44, 0x45], defaultI2cAddress: 0x40,
  shuntOhms: 0.1, busVoltageMaxV: 26, currentMaxA: 3.2, senseSide: 'high-side',
}

export function powerMonitorSpec(partId: unknown): PartPowerMonitorSpec {
  return partById(String(partId ?? DEFAULT_POWER_MONITOR_PART_ID))?.powerMonitor
    ?? partById(DEFAULT_POWER_MONITOR_PART_ID)?.powerMonitor
    ?? FALLBACK_SPEC
}

export function formatI2cAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

/** The address strings the part's straps can select, for the picker. */
export function powerMonitorAddressOptions(partId: unknown): string[] {
  return powerMonitorSpec(partId).i2cAddresses.map(formatI2cAddress)
}

/**
 * The address this node answers on. A value the part cannot be strapped to is
 * reported as `null` rather than replaced, so validation can say so instead of
 * the firmware quietly talking to an address nothing answers.
 */
export function powerMonitorAddress(props: Record<string, unknown>): number | null {
  const spec = powerMonitorSpec(props.partId)
  const raw = props.i2cAddress
  if (raw === undefined || raw === null || raw === '') return spec.defaultI2cAddress
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  return Number.isInteger(value) && spec.i2cAddresses.includes(value) ? value : null
}

export interface PowerMonitorReading {
  volts: number
  amps: number
  watts: number
}

/**
 * The browser preview's reading. There is no sensor in the browser, so the node
 * body offers two sliders, each 0-1 across the part's own range; watts follows
 * from them exactly as the firmware derives it.
 */
export function powerMonitorPreviewReading(
  partId: unknown,
  voltsFraction: number,
  ampsFraction: number,
): PowerMonitorReading {
  const spec = powerMonitorSpec(partId)
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)
  const volts = clamp(voltsFraction) * spec.busVoltageMaxV
  const amps = clamp(ampsFraction) * spec.currentMaxA
  return { volts, amps, watts: volts * amps }
}

/** Preview run-state keys: one slider per measured quantity. */
export const powerMonitorPreviewKey = (nodeId: string, quantity: 'volts' | 'amps') => `${nodeId}:${quantity}`

/** Where the preview sliders start: a 12 V supply carrying half an amp. */
export function powerMonitorPreviewDefaults(partId: unknown): { volts: number; amps: number } {
  const spec = powerMonitorSpec(partId)
  return { volts: 12 / spec.busVoltageMaxV, amps: 0.5 / spec.currentMaxA }
}
