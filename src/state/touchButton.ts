import { partById, type PartTouchSensorSpec } from './partCatalogue'

export const DEFAULT_TOUCH_BUTTON_PART_ID = 'seeed-grove-touch-sensor'

const FALLBACK_SPEC: PartTouchSensorSpec = {
  device: 'TTP223-BA6',
  interface: 'digital',
  activeLevel: 'high',
  mode: 'momentary',
  supplyMinV: 2,
  supplyMaxV: 5.5,
  responseMinMs: 60,
  responseMaxMs: 220,
}

/** The exact board contract imported from its source-backed part package. */
export function touchButtonSpec(partId: unknown): PartTouchSensorSpec {
  return partById(String(partId ?? DEFAULT_TOUCH_BUTTON_PART_ID))?.touchSensor ?? FALLBACK_SPEC
}

/** Arduino level which means a finger is present for this exact module. */
export function touchButtonPressedLevel(partId: unknown): 'HIGH' | 'LOW' {
  return touchButtonSpec(partId).activeLevel === 'low' ? 'LOW' : 'HIGH'
}
