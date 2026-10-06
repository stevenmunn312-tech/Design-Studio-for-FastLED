import { partById, type PartMotionVectorSpec } from '../../build/parts/partCatalogue'

export const MPU6050_PART_ID = 'gy-521-mpu6050-module'

const FALLBACK_SPEC: PartMotionVectorSpec = {
  device: 'MPU-6050',
  interface: 'I2C',
  i2cAddresses: [0x68, 0x69],
  defaultI2cAddress: 0x68,
  accelRangeG: 2,
  gyroRangeDps: 250,
}

export function motionVectorSpec(partId: unknown): PartMotionVectorSpec {
  return partById(String(partId ?? MPU6050_PART_ID))?.motionVectorSensor ?? FALLBACK_SPEC
}

export function formatMotionVectorAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`
}

export function motionVectorAddressOptions(partId: unknown): string[] {
  return motionVectorSpec(partId).i2cAddresses.map(formatMotionVectorAddress)
}

/** The address this node answers on, or `null` when the part cannot be strapped to it. */
export function motionVectorAddress(props: Record<string, unknown>): number | null {
  const spec = motionVectorSpec(props.partId)
  const raw = props.i2cAddress
  if (raw === undefined || raw === null || raw === '') return spec.defaultI2cAddress
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 16)
  return Number.isInteger(value) && spec.i2cAddresses.includes(value) ? value : null
}

/** The six measurements, in the order the node's outputs declare them. */
export const MOTION_VECTOR_AXES = ['accelX', 'accelY', 'accelZ', 'gyroX', 'gyroY', 'gyroZ'] as const
export type MotionVectorAxis = (typeof MOTION_VECTOR_AXES)[number]

export function motionVectorPreviewKey(nodeId: string, axis: MotionVectorAxis): string {
  return `${nodeId}:motion:${axis}`
}

/** Where each preview slider starts: lying flat, so gravity is +1 g on Z and nothing is turning. */
export function motionVectorPreviewDefault(partId: unknown, axis: MotionVectorAxis): number {
  if (axis !== 'accelZ') return 0.5
  const range = motionVectorSpec(partId).accelRangeG
  return (1 + range) / (2 * range)
}

/** Maps a 0-1 slider onto the sensor's full-scale range: g for the accelerometer, degrees per second for the gyro. */
export function motionVectorPreviewReading(partId: unknown, axis: MotionVectorAxis, fraction: number): number {
  const spec = motionVectorSpec(partId)
  const range = axis.startsWith('accel') ? spec.accelRangeG : spec.gyroRangeDps
  const clamped = Math.max(0, Math.min(1, Number(fraction) || 0))
  return -range + clamped * 2 * range
}

/** The MPU-6050's full-scale select codes (bits 4:3 of ACCEL_CONFIG and GYRO_CONFIG). */
const ACCEL_FS_CODE: Record<number, number> = { 2: 0, 4: 1, 8: 2, 16: 3 }
const GYRO_FS_CODE: Record<number, number> = { 250: 0, 500: 1, 1000: 2, 2000: 3 }
export const motionVectorAccelCode = (rangeG: number) => ACCEL_FS_CODE[rangeG] ?? 0
export const motionVectorGyroCode = (rangeDps: number) => GYRO_FS_CODE[rangeDps] ?? 0
