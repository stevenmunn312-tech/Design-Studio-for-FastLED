import type { StudioNode } from '../../state/graphStore'
import { powerSupplies, powerSupplyRating, supplyForLoad, SUPPLY_POWERED_NODE_TYPES } from '../../state/peripherals/powerSupply'
import { CONTROLLER_DRAW_MA, type BuildTargetFamily } from '../buildProfile'
import { controllerSettings } from '../controllerSettings'

/** The share of the supplies' rating the default cap leaves the LEDs. */
export const SUPPLY_CAP_FRACTION = 0.85
/** The Board's milliamps field bounds; the default cap stays inside them. */
export const POWER_CAP_MA = { min: 100, max: 100000, step: 50 } as const

/**
 * The combined rating of the supplies that feed this board's LEDs directly,
 * in mA, or null when none does. A supply at another voltage than the LEDs
 * sits upstream of a converter (or is a blocked mismatch) and does not bound
 * the LED rail, so it is not counted.
 */
export function ledSupplyRatingMa(nodes: readonly StudioNode[]): number | null {
  if (powerSupplies(nodes).length === 0) return null
  const volts = controllerSettings(nodes).volts
  const feeding = new Set(nodes
    .filter((node) => SUPPLY_POWERED_NODE_TYPES.has(node.data.nodeType))
    .map((load) => supplyForLoad(nodes, load.data.properties as Record<string, unknown>))
    .filter((supply): supply is StudioNode => Boolean(supply)))
  const ratings = [...feeding]
    .map((supply) => powerSupplyRating(supply.data.properties as Record<string, unknown>))
    .filter((rating) => rating.voltage === volts)
  return ratings.length > 0 ? ratings.reduce((sum, rating) => sum + Math.round(rating.ratedCurrentA * 1000), 0) : null
}

/**
 * The cap a supply allows: 85% of its rating, less the controller's own
 * draw, rounded down to 50 mA and held inside the Board's field bounds.
 */
export function supplyPowerCapMa(supplyRatingMa: number, family: BuildTargetFamily): number {
  const capMa = Math.floor(((SUPPLY_CAP_FRACTION * supplyRatingMa) - CONTROLLER_DRAW_MA[family]) / POWER_CAP_MA.step) * POWER_CAP_MA.step
  return Math.max(POWER_CAP_MA.min, Math.min(POWER_CAP_MA.max, capMa))
}

/**
 * The cap the Board starts at when it is ticked, and that a starter sets. With
 * the user's supplies on the bench it follows them (one global figure over
 * their combined rating, which is FastLED's model); otherwise, and whenever
 * the supply allows more, it is the full-white draw, which never dims.
 */
export function defaultPowerCapMa(
  nodes: readonly StudioNode[],
  family: BuildTargetFamily,
  fullWhiteCapMa: number,
): number {
  const ratingMa = ledSupplyRatingMa(nodes)
  return ratingMa == null ? fullWhiteCapMa : Math.min(fullWhiteCapMa, supplyPowerCapMa(ratingMa, family))
}
