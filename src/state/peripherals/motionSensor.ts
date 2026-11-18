import { partById } from '../../build/parts/partCatalogue'
import type { PartMotionSensorSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

/**
 * A one-pin motion module (a PIR or a microwave radar). Its output is a plain
 * high or low, so the node's behaviour is fixed; the level that means movement
 * and what powers the module come from the catalogue's `motionSensor` block.
 */
export const MOTION_SENSOR_PART_ID = 'hc-sr501-pir-sensor'

/** The part's motion block; `null` for an unknown part (a missing id is the default part). */
export function motionSensorSpec(partId: unknown): PartMotionSensorSpec | null {
  return partById(partIdOrDefault(partId, MOTION_SENSOR_PART_ID))?.motionSensor ?? null
}

/** The level OUT reads while the module sees movement; `null` for an unknown part. */
export function motionActiveLevel(partId: unknown): 'high' | 'low' | null {
  return motionSensorSpec(partId)?.activeLevel ?? null
}
