import { partById, type PartDistanceSensorSpec } from './partCatalogue'

export const HCSR04_PART_ID = 'hc-sr04-ultrasonic-module'

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
