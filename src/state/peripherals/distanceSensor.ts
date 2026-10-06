import { partById, type PartDistanceSensorSpec } from '../../build/parts/partCatalogue'

export const HCSR04_PART_ID = 'hc-sr04-ultrasonic-module'
export const VL53L0X_PART_ID = 'adafruit-vl53l0x-distance-sensor'
export const VL53L1X_PART_ID = 'adafruit-vl53l1x-distance-sensor'

/** Series and shunt values of the divider that brings a 5 V Echo down to 3.3 V logic. */
export const ECHO_DIVIDER_OHMS = { series: 1000, shunt: 2000 } as const

const FALLBACK_SPEC: PartDistanceSensorSpec = {
  device: 'HC-SR04',
  interface: 'Trig/Echo pulse',
  minMm: 20,
  maxMm: 4000,
  triggerPulseUs: 10,
  echoVolts: 5,
}

export function distanceSensorSpec(partId: unknown): PartDistanceSensorSpec {
  return partById(String(partId ?? HCSR04_PART_ID))?.distanceSensor ?? FALLBACK_SPEC
}

/** The slider position (0-1) that stands for an object about half a metre away. */
export function distancePreviewDefault(partId: unknown): number {
  const spec = distanceSensorSpec(partId)
  return (500 - spec.minMm) / (spec.maxMm - spec.minMm)
}

export function distancePreviewKey(nodeId: string): string {
  return `${nodeId}:distance:mm`
}

/** Maps the preview slider onto the sensor's measuring window, in millimetres. */
export function distancePreviewReading(partId: unknown, fraction: number): number {
  const spec = distanceSensorSpec(partId)
  const clamped = Math.max(0, Math.min(1, Number(fraction) || 0))
  return spec.minMm + clamped * (spec.maxMm - spec.minMm)
}

export type DistanceSensorTransport = 'pulse' | 'i2c'

/** A pulse-ranging module wires Trig and Echo; a time-of-flight one is on the I2C bus. */
export function distanceSensorTransport(partId: unknown): DistanceSensorTransport {
  return distanceSensorSpec(partId).interface === 'I2C' ? 'i2c' : 'pulse'
}

/** The chip a part carries, which decides the driver library an I2C sensor needs. */
export function distanceSensorDevice(partId: unknown): string {
  return distanceSensorSpec(partId).device
}

export function distanceSensorPinKeys(properties: Record<string, unknown>): string[] {
  return distanceSensorTransport(properties.partId) === 'i2c' ? ['sdaPin', 'sclPin'] : ['trigPin', 'echoPin']
}

export function formatDistanceSensorAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function distanceSensorAddressOptions(partId: unknown): string[] {
  return (distanceSensorSpec(partId).i2cAddresses ?? []).map(formatDistanceSensorAddress)
}

/** The I2C address a node answers on, or `null` for a pulse module or an address the part cannot take. */
export function distanceSensorAddress(properties: Record<string, unknown>): number | null {
  const spec = distanceSensorSpec(properties.partId)
  if (spec.interface !== 'I2C') return null
  const raw = properties.i2cAddress
  if (raw === undefined || raw === null || raw === '') return spec.defaultI2cAddress ?? null
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 16)
  return Number.isInteger(value) && (spec.i2cAddresses ?? []).includes(value) ? value : null
}
