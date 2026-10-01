import type { NodePort } from '../types'
import { partById } from './partCatalogue'
import type { PartDriverChipSpec } from './partCatalogue'

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

const FALLBACK_SPEC: PartDriverChipSpec = {
  device: 'ULN2803A', package: 'DIP-18', channels: DARLINGTON_CHANNELS, outputType: 'open-collector Darlington, low-side',
  inputActiveLevel: 'high', maxOutputVoltageV: 50, maxChannelCurrentMa: 500, pinout: [],
}

export function darlingtonSpec(partId: unknown): PartDriverChipSpec {
  return partById(String(partId ?? DARLINGTON_PART_ID))?.driverChip ?? FALLBACK_SPEC
}

export const darlingtonActiveHigh = (partId: unknown) => darlingtonSpec(partId).inputActiveLevel === 'high'

/** Channel numbers are the chip's own, 1B to 8B. */
export const darlingtonChannelId = (index: number) => `channel${index + 1}`
export const darlingtonPinKey = (index: number) => `drive${index + 1}Pin`
export const darlingtonPinKeys = () => Array.from({ length: DARLINGTON_CHANNELS }, (_, index) => darlingtonPinKey(index))

export function darlingtonInputs(): NodePort[] {
  return Array.from({ length: DARLINGTON_CHANNELS }, (_, index) => ({
    id: darlingtonChannelId(index), label: `Channel ${index + 1}`, dataType: 'bool',
  }))
}
