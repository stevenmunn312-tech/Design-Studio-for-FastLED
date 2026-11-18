/**
 * The power supply the user already owns: one bench node per physical supply,
 * rated with the figures off its own label. There is no catalogue to pick
 * from, so any supply on hand can be entered.
 *
 * Config only, like the DC-DC converter: no ports and no firmware. The Build
 * Diagram reads its rating, and each LED output names the supply that feeds it
 * through `poweredBy`.
 */

export const POWER_SUPPLY_NODE_TYPE = 'PowerSupply'

/** Bounds the rating fields accept: every common LED supply sits inside them. */
export const POWER_SUPPLY_VOLTAGE = { min: 3, max: 48, step: 0.1, default: 5 } as const
export const POWER_SUPPLY_CURRENT_A = { min: 0.5, max: 200, step: 0.1, default: 10 } as const

/** The LED loads that draw from a supply: what `poweredBy` is set on. */
export const SUPPLY_POWERED_NODE_TYPES: ReadonlySet<string> = new Set(['MatrixOutput', 'StereoVuMeter'])

interface NodeLike {
  id: string
  data: { nodeType: string; label?: unknown; properties: Record<string, unknown> }
}

export interface PowerSupplyRating {
  voltage: number
  ratedCurrentA: number
  wattage: number
}

function bounded(value: unknown, range: { min: number; max: number; default: number }): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(range.min, Math.min(range.max, parsed)) : range.default
}

/** The rating as typed, held inside the field bounds, with the wattage it implies. */
export function powerSupplyRating(props: Record<string, unknown>): PowerSupplyRating {
  const voltage = bounded(props.voltage, POWER_SUPPLY_VOLTAGE)
  const ratedCurrentA = bounded(props.ratedCurrentA, POWER_SUPPLY_CURRENT_A)
  return { voltage, ratedCurrentA, wattage: Number((voltage * ratedCurrentA).toFixed(1)) }
}

/** "5 V 10 A (50 W)": how every surface names a rating. */
export function powerSupplyRatingLabel(rating: PowerSupplyRating): string {
  return `${Number(rating.voltage.toFixed(2))} V ${Number(rating.ratedCurrentA.toFixed(2))} A (${rating.wattage} W)`
}

/** The supplies on the bench, in graph order. */
export function powerSupplies<T extends NodeLike>(nodes: readonly T[]): T[] {
  return nodes.filter((node) => node.data.nodeType === POWER_SUPPLY_NODE_TYPE)
}

/**
 * What a supply is called wherever several can be told apart: its label, with
 * its place among the supplies sharing that label when the label repeats
 * ("Power Supply 2"). Two supplies added from the shelf share a label.
 */
export function powerSupplyName<T extends NodeLike>(nodes: readonly T[], supply: T): string {
  const label = String(supply.data.label ?? 'Power Supply')
  const namesake = powerSupplies(nodes).filter((node) => String(node.data.label ?? 'Power Supply') === label)
  return namesake.length > 1 ? `${label} ${namesake.indexOf(supply) + 1}` : label
}

/**
 * The supply that feeds an LED load: the one its `poweredBy` names, else the
 * first on the bench. With one supply there is nothing to choose, and a choice
 * left pointing at a removed supply falls back the same way.
 */
export function supplyForLoad<T extends NodeLike>(
  nodes: readonly T[],
  loadProps: Record<string, unknown>,
): T | undefined {
  const supplies = powerSupplies(nodes)
  return supplies.find((supply) => supply.id === loadProps.poweredBy) ?? supplies[0]
}
