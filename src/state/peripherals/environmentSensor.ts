import { partById, type PartEnvironmentSensorSpec } from '../../build/parts/partCatalogue'

export const BME280_PART_ID = 'adafruit-bme280-environment-sensor'
export const BME280_DEFAULT_ADDRESS = 0x77
export const BME280_ADDRESSES = [0x76, 0x77] as const

const FALLBACK_SPEC: PartEnvironmentSensorSpec = {
  device: 'BME280',
  interface: 'I2C',
  i2cAddresses: [...BME280_ADDRESSES],
  defaultI2cAddress: BME280_DEFAULT_ADDRESS,
  temperatureMinC: -40,
  temperatureMaxC: 85,
  humidityMinPercent: 0,
  humidityMaxPercent: 100,
  pressureMinHpa: 300,
  pressureMaxHpa: 1100,
}

export function environmentSensorSpec(partId: unknown): PartEnvironmentSensorSpec {
  return partById(String(partId ?? BME280_PART_ID))?.environmentSensor ?? FALLBACK_SPEC
}

export function formatEnvironmentAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function environmentAddressOptions(partId: unknown): string[] {
  return environmentSensorSpec(partId).i2cAddresses.map(formatEnvironmentAddress)
}

export function environmentAddress(props: Record<string, unknown>): number | null {
  const spec = environmentSensorSpec(props.partId)
  const raw = typeof props.i2cAddress === 'number'
    ? props.i2cAddress
    : Number.parseInt(String(props.i2cAddress ?? ''), 16)
  return Number.isInteger(raw) && spec.i2cAddresses.includes(raw) ? raw : null
}

export type EnvironmentReading = {
  temperature: number
  humidity: number
  pressure: number
}

export function environmentPreviewDefaults(partId: unknown): EnvironmentReading {
  const spec = environmentSensorSpec(partId)
  return {
    temperature: (22 - spec.temperatureMinC) / (spec.temperatureMaxC - spec.temperatureMinC),
    humidity: 0.5,
    pressure: (1013.25 - spec.pressureMinHpa) / (spec.pressureMaxHpa - spec.pressureMinHpa),
  }
}

export function environmentPreviewKey(nodeId: string, field: keyof EnvironmentReading): string {
  return `${nodeId}:environment:${field}`
}

export function environmentPreviewReading(
  partId: unknown,
  temperature: number,
  humidity: number,
  pressure: number,
): EnvironmentReading {
  const spec = environmentSensorSpec(partId)
  const scaled = (value: number, min: number, max: number) => {
    const fraction = Math.max(0, Math.min(1, Number(value) || 0))
    return min + fraction * (max - min)
  }
  return {
    temperature: scaled(temperature, spec.temperatureMinC, spec.temperatureMaxC),
    humidity: scaled(humidity, spec.humidityMinPercent, spec.humidityMaxPercent),
    pressure: scaled(pressure, spec.pressureMinHpa, spec.pressureMaxHpa),
  }
}
