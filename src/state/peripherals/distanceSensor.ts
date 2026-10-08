import { NO_PIN } from '../../build/boards/boardGpio'
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

/**
 * Every VL53L0X and VL53L1X wakes at this 7-bit address. Nothing in the
 * catalogue changes it: the chip has no address jumper. A later `setAddress`
 * moves one sensor, and only while its peers are held in reset.
 */
export const VL53_BOOT_ADDRESS = 0x29

/**
 * Addresses the sketch may assign. `0x29` is only for a sensor that is alone
 * on the bus. Two or more leave it free so a retry can `init` one chip there
 * without colliding with a peer that is already awake.
 */
export const VL53_ASSIGNED_ADDRESSES = [0x29, 0x30, 0x31, 0x32, 0x33] as const

export function distanceSensorPinKeys(properties: Record<string, unknown>): string[] {
  if (distanceSensorTransport(properties.partId) !== 'i2c') return ['trigPin', 'echoPin']
  const keys = ['sdaPin', 'sclPin']
  if (distanceSensorXshutPin(properties) !== null) keys.push('xshutPin')
  return keys
}

/**
 * The GPIO wired to SHDN or XSHUT, or `null` when that line is not driven.
 *
 * `NO_PIN` is the unwired value. A single sensor leaves it there and claims
 * no extra GPIO. A pin of 0 is a real GPIO, so only a missing value or
 * `NO_PIN` means unwired.
 */
export function distanceSensorXshutPin(properties: Record<string, unknown>): number | null {
  if (distanceSensorTransport(properties.partId) !== 'i2c') return null
  const raw = properties.xshutPin
  if (raw === undefined || raw === null || raw === '' || raw === NO_PIN) return null
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  return Number.isInteger(value) && value >= 0 && value < NO_PIN ? value : null
}

export function formatDistanceSensorAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function distanceSensorAddressOptions(partId: unknown): string[] {
  if (distanceSensorTransport(partId) !== 'i2c') return []
  return VL53_ASSIGNED_ADDRESSES.map(formatDistanceSensorAddress)
}

/** The I2C address a node answers on, or `null` for a pulse module or an address the part cannot take. */
export function distanceSensorAddress(properties: Record<string, unknown>): number | null {
  const spec = distanceSensorSpec(properties.partId)
  if (spec.interface !== 'I2C') return null
  const raw = properties.i2cAddress
  if (raw === undefined || raw === null || raw === '') return spec.defaultI2cAddress ?? VL53_BOOT_ADDRESS
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 16)
  return Number.isInteger(value) && (VL53_ASSIGNED_ADDRESSES as readonly number[]).includes(value) ? value : null
}

export interface DistanceSensorBusIssue {
  nodeIds: string[]
  propertyKey: 'xshutPin' | 'i2cAddress'
  title: string
  message: string
  fix: string
}

interface DistanceBusNode {
  id: string
  label: string
  properties: Record<string, unknown>
}

function i2cBusKey(properties: Record<string, unknown>): string {
  return `${Number(properties.sdaPin)}:${Number(properties.sclPin)}`
}

/**
 * Why two or more time-of-flight sensors on one SDA/SCL pair cannot boot.
 *
 * A group of one produces nothing: a lone sensor may stay at `0x29` with
 * SHDN unwired, or take another address without a shutdown pin, because
 * nothing else occupies `0x29`. Mixed VL53L0X and VL53L1X parts are one group.
 */
export function distanceSensorBusIssues(nodes: readonly DistanceBusNode[]): DistanceSensorBusIssue[] {
  const groups = new Map<string, DistanceBusNode[]>()
  for (const node of nodes) {
    if (distanceSensorTransport(node.properties.partId) !== 'i2c') continue
    const key = i2cBusKey(node.properties)
    const group = groups.get(key) ?? []
    group.push(node)
    groups.set(key, group)
  }
  const issues: DistanceSensorBusIssue[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const names = group.map((node) => node.label).join(' and ')
    const missing = group.filter((node) => distanceSensorXshutPin(node.properties) === null)
    if (missing.length > 0) {
      issues.push({
        nodeIds: missing.map((node) => node.id),
        propertyKey: 'xshutPin',
        title: 'Time-of-flight sensors share a bus without a shutdown pin',
        message: `${names} share SDA and SCL. Every VL53L0X and VL53L1X wakes on 0x29, so each one needs its own SHDN or XSHUT pin. The sketch holds the others in reset while it moves one off 0x29.`,
        fix: 'Wire a separate GPIO to each sensor\'s SHDN or XSHUT pin.',
      })
    }
    const byPin = new Map<number, DistanceBusNode[]>()
    for (const node of group) {
      const pin = distanceSensorXshutPin(node.properties)
      if (pin === null) continue
      const sharing = byPin.get(pin) ?? []
      sharing.push(node)
      byPin.set(pin, sharing)
    }
    for (const [pin, sharing] of byPin) {
      if (sharing.length < 2) continue
      issues.push({
        nodeIds: sharing.map((node) => node.id),
        propertyKey: 'xshutPin',
        title: 'Time-of-flight sensors share a shutdown pin',
        message: `${sharing.map((node) => node.label).join(' and ')} use GPIO ${pin} as SHDN or XSHUT. The sketch holds one in reset while another boots, so each sensor needs its own pin.`,
        fix: 'Give each sensor a different SHDN or XSHUT GPIO.',
      })
    }
    const onBoot = group.filter((node) => (distanceSensorAddress(node.properties) ?? VL53_BOOT_ADDRESS) === VL53_BOOT_ADDRESS)
    if (onBoot.length > 0) {
      const staying = onBoot.map((node) => node.label).join(' and ')
      issues.push({
        nodeIds: onBoot.map((node) => node.id),
        propertyKey: 'i2cAddress',
        title: 'Leave 0x29 free when more than one time-of-flight sensor shares the bus',
        message: `${names} share SDA and SCL, and ${staying} ${onBoot.length === 1 ? 'stays' : 'stay'} on 0x29. Every chip wakes on 0x29. The sketch holds the others in reset while it moves one, and a later retry has to find 0x29 empty.`,
        fix: 'Give each sensor a different address from 0x30 to 0x33.',
      })
    }
    const assigned = new Map<number, DistanceBusNode[]>()
    for (const node of group) {
      const address = distanceSensorAddress(node.properties)
      if (address === null || address === VL53_BOOT_ADDRESS) continue
      const sharing = assigned.get(address) ?? []
      sharing.push(node)
      assigned.set(address, sharing)
    }
    for (const [address, sharing] of assigned) {
      if (sharing.length < 2) continue
      issues.push({
        nodeIds: sharing.map((node) => node.id),
        propertyKey: 'i2cAddress',
        title: 'Time-of-flight sensors share an assigned address',
        message: `${sharing.map((node) => node.label).join(' and ')} are both set to ${formatDistanceSensorAddress(address)}. Each sensor on one bus needs its own address from 0x30 to 0x33.`,
        fix: 'Pick a different address from 0x30 to 0x33 for one of them.',
      })
    }
  }
  return issues
}

/**
 * I2C distance sensors that share a bus with one the sketch is already emitting.
 *
 * An unwired sensor is normally pruned. If its peer on the same SDA and SCL is
 * emitted, this one still has to hold its shutdown pin, or the peer boots into
 * a second chip sitting at 0x29. When neither sensor is emitted, both stay out:
 * two chips idle at 0x29 do not answer any other address.
 */
export function i2cDistanceBusPeers<T extends { id: string; data: { nodeType: string; properties: object } }>(
  all: readonly T[],
  included: readonly { id: string }[],
): T[] {
  const includedIds = new Set(included.map((node) => node.id))
  const liveBuses = new Set<string>()
  for (const node of all) {
    if (!includedIds.has(node.id)) continue
    if (node.data.nodeType !== 'DistanceInput') continue
    const properties = node.data.properties as Record<string, unknown>
    if (distanceSensorTransport(properties.partId) !== 'i2c') continue
    liveBuses.add(i2cBusKey(properties))
  }
  if (liveBuses.size === 0) return []
  return all.filter((node) => {
    if (includedIds.has(node.id) || node.data.nodeType !== 'DistanceInput') return false
    const properties = node.data.properties as Record<string, unknown>
    return distanceSensorTransport(properties.partId) === 'i2c' && liveBuses.has(i2cBusKey(properties))
  })
}
