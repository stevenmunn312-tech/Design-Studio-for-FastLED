// The rules an `ledOutput` block must meet beyond the shapes in blockSpecs.ts:
// which size fields its form needs, and which fields only one form may carry.
// Pure, so the manifest validator and the LED product resolver
// (state/output/ledProduct.ts) apply the same rule and a registered part can
// never be known yet unusable.

/** The widest and tallest grid an LED output drives (`MAX_MATRIX_SIDE`). */
export const LED_OUTPUT_MAX_SIDE = 64

/** The longest chain an LED output drives (`MAX_LED_RUN`). */
export const LED_OUTPUT_MAX_RUN = LED_OUTPUT_MAX_SIDE * LED_OUTPUT_MAX_SIDE

/** The supply rails the power plan sizes an LED strip from. */
export const LED_OUTPUT_SUPPLY_VOLTS = [5, 12] as const

/** Why an `ledOutput` block cannot be used, or null when it can. */
export function ledOutputBlockIssue(block: unknown): string | null {
  if (typeof block !== 'object' || block === null) return 'is not an object'
  const b = block as Record<string, unknown>
  const has = (key: string) => b[key] !== undefined
  const form = b.form
  const hub75 = form === 'hub75'
  if (hub75 !== (b.chipset === 'HUB75')) return 'chipset HUB75 and form hub75 go together'
  if (hub75) {
    if (!has('width') || !has('height')) return 'a HUB75 panel needs width and height'
    if (!has('scan')) return 'a HUB75 panel needs its scan (16 or 32)'
  } else {
    if (has('scan')) return 'scan belongs to a HUB75 panel'
    if (!has('colorOrder')) return 'needs the colour order the product ships in'
  }
  if (form === 'strip' || form === 'ring') {
    if (!has('count') && !has('maxCount')) return 'needs count (fixed) or maxCount (cut to length)'
    if (has('count') && (has('maxCount') || has('cutEvery'))) return 'count is a fixed length, so maxCount and cutEvery do not apply'
    if (has('cutEvery') && !has('maxCount')) return 'cutEvery needs maxCount'
    if (has('width') || has('height')) return 'a chain has no width or height'
    if (has('wiring')) return 'wiring is a grid field'
    if (typeof b.count === 'number' && b.count > LED_OUTPUT_MAX_RUN) return 'count is longer than this version drives'
    if (typeof b.maxCount === 'number') {
      if (b.maxCount > LED_OUTPUT_MAX_RUN) return 'maxCount is longer than this version drives'
      const cut = typeof b.cutEvery === 'number' ? b.cutEvery : 1
      if (cut > b.maxCount || b.maxCount % cut !== 0) return 'maxCount must be a whole number of cut units'
    }
  } else {
    if (!has('width') || !has('height')) return 'a grid needs width and height'
    if (has('count') || has('maxCount') || has('cutEvery')) return 'a grid is sized by width and height, not a count'
  }
  if (form !== 'ring' && !has('pitchMm')) return 'needs the LED pitch'
  if (form === 'ring') {
    if (!has('count')) return 'a ring has a fixed count'
    if (!has('diameterMm')) return 'a ring needs its diameter'
  } else if (has('diameterMm')) {
    return 'diameterMm belongs to a ring'
  }
  if (b.supplyVolts !== undefined && !(LED_OUTPUT_SUPPLY_VOLTS as readonly unknown[]).includes(b.supplyVolts)) {
    return `supplyVolts must be ${LED_OUTPUT_SUPPLY_VOLTS.join(' or ')}`
  }
  return null
}
