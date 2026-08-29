export const DEFAULT_SUPPLY_HEADROOM_PERCENT = 20

function roundToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

/** Standard continuous PSU nameplate current for an operating budget. */
export function recommendedSupplyCurrentMa(psuSizingCurrentMa: number): number {
  const targetCurrentMa = psuSizingCurrentMa * (1 + (DEFAULT_SUPPLY_HEADROOM_PERCENT / 100))
  if (targetCurrentMa <= 10000) return roundToStep(targetCurrentMa, 1000)

  const lowerTenAmps = Math.floor(targetCurrentMa / 10000) * 10000
  const roundedCurrentMa = targetCurrentMa - lowerTenAmps < 2000
    ? lowerTenAmps
    : lowerTenAmps + 10000

  // Never recommend a nameplate current below the cap-aware operating budget.
  return Math.max(roundToStep(psuSizingCurrentMa, 1000), roundedCurrentMa)
}
