import { partById } from './partCatalogue'
import type { PartMosfetSpec } from './partCatalogue'

/**
 * A DC power switch: one opto-isolated MOSFET channel turning a load on and
 * off from a boolean graph signal. Unlike a relay module it is active-high,
 * switches DC only (the load's negative lead), and has limits on the load side
 * that the app states rather than infers.
 */
export const DEFAULT_POWER_SWITCH_PART_ID = 'lr7843-mosfet-module'

/** The one GPIO the switch takes, printed PWM on the reference board. */
export const POWER_SWITCH_PIN_KEY = 'signalPin'

export function powerSwitchSpec(partId: unknown): PartMosfetSpec | undefined {
  return partById(String(partId ?? DEFAULT_POWER_SWITCH_PART_ID))?.mosfet
}

/** True when the module's input turns the load on with a HIGH level. */
export function powerSwitchActiveHigh(partId: unknown): boolean {
  return (powerSwitchSpec(partId)?.trigger ?? 'active-high') !== 'active-low'
}
