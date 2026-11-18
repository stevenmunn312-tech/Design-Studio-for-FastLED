import type { NodePort } from '../../types'
import { partById } from '../../build/parts/partCatalogue'
import type { PartDriverChipSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

/**
 * An eight-channel low-side Darlington array (ULN2803A). Each input at the active
 * level pulls its output to ground, so the load's supply goes to the load and its
 * other lead to the output; the array can sink current and cannot source it. The
 * active level and the limits come from the catalogue's `driverChip` block.
 */
export const DARLINGTON_PART_ID = 'uln2803a-dip18'

export const DARLINGTON_CHANNELS = 8

/** Output-capable on a classic ESP32 and clear of I2C and the default LED pin. */
export const DARLINGTON_PIN_FALLBACKS = [4, 13, 14, 25, 26, 27, 32, 33]

/** The part's driver-chip block; `null` for an unknown part (a missing id is the default part). */
export function darlingtonSpec(partId: unknown): PartDriverChipSpec | null {
  return partById(partIdOrDefault(partId, DARLINGTON_PART_ID))?.driverChip ?? null
}

/** The level that drives a channel; `null` for an unknown part. */
export const darlingtonActiveHigh = (partId: unknown): boolean | null => {
  const spec = darlingtonSpec(partId)
  return spec ? spec.inputActiveLevel === 'high' : null
}

/** Channel numbers are the chip's own, 1B to 8B. */
export const darlingtonChannelId = (index: number) => `channel${index + 1}`
export const darlingtonPinKey = (index: number) => `drive${index + 1}Pin`
export const darlingtonPinKeys = () => Array.from({ length: DARLINGTON_CHANNELS }, (_, index) => darlingtonPinKey(index))

export function darlingtonInputs(): NodePort[] {
  return Array.from({ length: DARLINGTON_CHANNELS }, (_, index) => ({
    id: darlingtonChannelId(index), label: `Channel ${index + 1}`, dataType: 'bool',
  }))
}
