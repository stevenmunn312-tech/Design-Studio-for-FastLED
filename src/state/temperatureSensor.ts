import { partById, type PartTemperatureSensorSpec } from './partCatalogue'

export const DS18B20_PART_ID = 'ds18b20-waterproof-probe'
export const DS18B20_PULL_UP_OHMS = 4700

const FALLBACK_SPEC: PartTemperatureSensorSpec = {
  device: 'DS18B20',
  interface: '1-Wire',
  temperatureMinC: -55,
  temperatureMaxC: 125,
  pullUpOhms: DS18B20_PULL_UP_OHMS,
}

export function temperatureSensorSpec(partId: unknown): PartTemperatureSensorSpec {
  return partById(String(partId ?? DS18B20_PART_ID))?.temperatureSensor ?? FALLBACK_SPEC
}

/** The slider position (0-1) that stands for a comfortable room temperature. */
export function temperaturePreviewDefault(partId: unknown): number {
  const spec = temperatureSensorSpec(partId)
  return (22 - spec.temperatureMinC) / (spec.temperatureMaxC - spec.temperatureMinC)
}

export function temperaturePreviewKey(nodeId: string): string {
  return `${nodeId}:temperature:celsius`
}

/** Maps the preview slider onto the probe's measuring range, in degrees C. */
export function temperaturePreviewReading(partId: unknown, fraction: number): number {
  const spec = temperatureSensorSpec(partId)
  const clamped = Math.max(0, Math.min(1, Number(fraction) || 0))
  return spec.temperatureMinC + clamped * (spec.temperatureMaxC - spec.temperatureMinC)
}

/** "4.7 kΩ" for the Build Diagram label and the parts list. */
export function formatPullUp(ohms: number): string {
  return ohms >= 1000 ? `${Number((ohms / 1000).toFixed(2))} kΩ` : `${ohms} Ω`
}
