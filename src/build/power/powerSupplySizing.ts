export const DEFAULT_SUPPLY_HEADROOM_PERCENT = 20

function roundToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

/**
 * Standard continuous PSU nameplate current for a full-white design load:
 * the load plus headroom, rounded up to a whole amp to 10 A and to the next
 * 10 A above that. Never rounded down, so the headroom is never eaten.
 */
export function recommendedSupplyCurrentMa(designCurrentMa: number): number {
  const targetCurrentMa = designCurrentMa * (1 + (DEFAULT_SUPPLY_HEADROOM_PERCENT / 100))
  return roundToStep(targetCurrentMa, targetCurrentMa <= 10000 ? 1000 : 10000)
}
