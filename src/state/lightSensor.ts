import { partById } from './partCatalogue'

export const DEFAULT_LIGHT_SENSOR_PART_ID = 'photosensitive-ldr-module'
export const BH1750_PART_ID = 'adafruit-bh1750-light-sensor'
export const BH1750_DEFAULT_ADDRESS = 0x23
export const BH1750_ADDRESSES = [0x23, 0x5c] as const
export const LIGHT_SENSOR_DEFAULT_MAX_LUX = 10_000

export type LightSensorTransport = 'analog' | 'i2c'

export interface LightSensorModule {
  partId: string
  label: string
  summary: string
  note: string
  transport: LightSensorTransport
}

export const LIGHT_SENSOR_MODULES: readonly LightSensorModule[] = [
  {
    partId: DEFAULT_LIGHT_SENSOR_PART_ID,
    label: 'LDR light sensor',
    summary: 'Relative brightness on one analog pin',
    note: 'An analog divider: Level is relative brightness. It cannot report calibrated lux, so Lux stays at zero.',
    transport: 'analog',
  },
  {
    partId: BH1750_PART_ID,
    label: 'Adafruit BH1750',
    summary: 'Calibrated ambient light in lux over I2C',
    note: 'Power from the controller logic rail. The breakout level-shifts SDA/SCL and answers on 0x23, or 0x5C with ADDR tied high.',
    transport: 'i2c',
  },
]

export function lightSensorModule(partId: unknown): LightSensorModule {
  const id = String(partId ?? '')
  return LIGHT_SENSOR_MODULES.find((module) => module.partId === id) ?? LIGHT_SENSOR_MODULES[0]
}

export function lightSensorTransport(partId: unknown): LightSensorTransport {
  return lightSensorModule(partId).transport
}

export function lightSensorPinKeys(properties: Record<string, unknown>): string[] {
  return lightSensorTransport(properties.partId) === 'i2c'
    ? ['sdaPin', 'sclPin']
    : ['pin']
}

export function lightSensorAddressOptions(partId: unknown): string[] {
  const spec = partById(lightSensorModule(partId).partId)?.lightSensor
  const addresses = spec?.i2cAddresses?.length ? spec.i2cAddresses : [...BH1750_ADDRESSES]
  return addresses.map(formatLightSensorAddress)
}

export function formatLightSensorAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function lightSensorAddress(properties: Record<string, unknown>): number | null {
  if (lightSensorTransport(properties.partId) !== 'i2c') return null
  const configured = typeof properties.i2cAddress === 'string'
    ? Number.parseInt(properties.i2cAddress, 16)
    : Number(properties.i2cAddress)
  const spec = partById(lightSensorModule(properties.partId).partId)?.lightSensor
  const addresses = spec?.i2cAddresses?.length ? spec.i2cAddresses : [...BH1750_ADDRESSES]
  return addresses.includes(configured) ? configured : null
}

export function lightSensorMaxLux(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100_000, parsed)) : LIGHT_SENSOR_DEFAULT_MAX_LUX
}

export interface LightSensorReading {
  level: number
  lux: number
}

export function lightSensorPreviewReading(
  partId: unknown,
  fraction: number,
  maxLux: unknown = LIGHT_SENSOR_DEFAULT_MAX_LUX,
): LightSensorReading {
  const level = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  return lightSensorTransport(partId) === 'i2c'
    ? { level, lux: level * lightSensorMaxLux(maxLux) }
    : { level, lux: 0 }
}
