import { partById, type PartTouchSensorSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

export const DEFAULT_TOUCH_BUTTON_PART_ID = 'seeed-grove-touch-sensor'

/**
 * The exact board contract imported from its source-backed part package;
 * `null` for an unknown part (a missing id is the default part).
 */
export function touchButtonSpec(partId: unknown): PartTouchSensorSpec | null {
  return partById(partIdOrDefault(partId, DEFAULT_TOUCH_BUTTON_PART_ID))?.touchSensor ?? null
}

/** Arduino level which means a finger is present for this exact module; `null` for an unknown part. */
export function touchButtonPressedLevel(partId: unknown): 'HIGH' | 'LOW' | null {
  const spec = touchButtonSpec(partId)
  return spec ? (spec.activeLevel === 'low' ? 'LOW' : 'HIGH') : null
}
