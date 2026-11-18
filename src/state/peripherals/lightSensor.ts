import { bundledPartsForType, memoByCatalogue, partById, registeredPartsForType } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

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

/**
 * Every light-sensor module in the catalogue, in the type's menu order: the
 * bundled ones first, then registered ones. A module with a `lightSensor`
 * block is read over I2C; one without (an LDR divider) is read as a raw analog
 * level.
 */
export const lightSensorModules: () => readonly LightSensorModule[] = memoByCatalogue(() =>
  [...bundledPartsForType('LightInput'), ...registeredPartsForType('LightInput')].map((part) => ({
    partId: part.partId,
    label: part.copy?.optionLabel ?? part.label,
    summary: part.copy?.summary ?? '',
    note: part.copy?.wiringNote ?? '',
    transport: part.lightSensor ? 'i2c' as const : 'analog' as const,
  })))

/** The module a saved id names: a missing id is the default LDR, an unknown one is `null`. */
export function lightSensorModule(partId: unknown): LightSensorModule | null {
  const id = partIdOrDefault(partId, DEFAULT_LIGHT_SENSOR_PART_ID)
  return lightSensorModules().find((module) => module.partId === id) ?? null
}

export function lightSensorTransport(partId: unknown): LightSensorTransport | null {
  return lightSensorModule(partId)?.transport ?? null
}

/** The pins the part wires; none for an unknown part. */
export function lightSensorPinKeys(properties: Record<string, unknown>): string[] {
  const transport = lightSensorTransport(properties.partId)
  if (transport === null) return []
  return transport === 'i2c' ? ['sdaPin', 'sclPin'] : ['pin']
}

/** The addresses the part's block lists; none for an analog part or an unknown one. */
function lightSensorAddresses(partId: unknown): readonly number[] {
  const module = lightSensorModule(partId)
  return (module && partById(module.partId)?.lightSensor?.i2cAddresses) || []
}

export function lightSensorAddressOptions(partId: unknown): string[] {
  return lightSensorAddresses(partId).map(formatLightSensorAddress)
}

export function formatLightSensorAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function lightSensorAddress(properties: Record<string, unknown>): number | null {
  if (lightSensorTransport(properties.partId) !== 'i2c') return null
  const configured = typeof properties.i2cAddress === 'string'
    ? Number.parseInt(properties.i2cAddress, 16)
    : Number(properties.i2cAddress)
  return lightSensorAddresses(properties.partId).includes(configured) ? configured : null
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
