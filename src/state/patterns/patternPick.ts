// One rule for the next pattern in a collection.
//
// The Music Player preview, the Pattern Slideshow preview, both sketches, and
// the Performance Generator all call this. patternPickCpp.ts emits the same
// decisions. When every weight is equal and positive and the moment does not
// narrow the collection, the result is today's formula, including how many
// random numbers it draws, so a seeded slideshow replays and an unweighted
// sketch stays byte-identical.

export const PATTERN_WEIGHT_MIN = 0
export const PATTERN_WEIGHT_MAX = 16
export const PATTERN_WEIGHT_DEFAULT = 1

export const ENERGY_BANDS = ['calm', 'lively', 'peak'] as const
export type EnergyBand = (typeof ENERGY_BANDS)[number]

export type PatternEntryPolicy = 'restart' | 'resume'

const BAND_BITS: Record<EnergyBand, number> = { calm: 1, lively: 2, peak: 4 }

export function clampPatternWeight(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : PATTERN_WEIGHT_DEFAULT
  return Math.max(PATTERN_WEIGHT_MIN, Math.min(PATTERN_WEIGHT_MAX, n))
}

export function isEnergyBand(value: unknown): value is EnergyBand {
  return value === 'calm' || value === 'lively' || value === 'peak'
}

/** Calm below 1/3, lively below 2/3, peak at and above 2/3. */
export function energyBandFromIntensity(intensity: number): EnergyBand {
  const x = Number.isFinite(intensity) ? intensity : 0.5
  if (x < 1 / 3) return 'calm'
  if (x < 2 / 3) return 'lively'
  return 'peak'
}

/**
 * Where one section's energy sits in the song's own section-energy range.
 * A spread under 0.05 is neutral (0.5), the same floor as pacingIntensity.
 */
export function sectionEnergyIntensity(energy: number, energies: readonly number[]): number {
  if (energies.length === 0) return 0.5
  let lo = energies[0]
  let hi = energies[0]
  for (const value of energies) {
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  const range = hi - lo
  if (!(range >= 0.05)) return 0.5
  return Math.max(0, Math.min(1, (energy - lo) / range))
}

export function energyMask(tags: readonly EnergyBand[]): number {
  let mask = 0
  for (const band of tags) mask |= BAND_BITS[band]
  return mask
}

/** What the engine knows right now. A null dimension is not filtered. */
export interface PickMoment {
  energy: EnergyBand | null
  /** One section type, or null when this engine does not tag by section. */
  section: string | null
  /**
   * A sequence step may name several sections or energies. An entry matches
   * when its tags intersect the list, and an untagged entry matches anything.
   * Null means that list is not in play. A single `energy` / `section` is the
   * live moment; these lists are the authored step.
   */
  energies?: readonly EnergyBand[] | null
  sections?: readonly string[] | null
}

export interface PickEntry {
  weight: number
  energy: readonly EnergyBand[]
  sections: readonly string[]
}

export type PickMode = 'first' | 'next' | 'sequential' | 'opening'

export interface PickResult {
  index: number
  /** True when exactly one call to `rand` was consumed. */
  drew: boolean
}

export function entryMatchesMoment(entry: PickEntry, moment: PickMoment): boolean {
  if (moment.energy !== null && entry.energy.length > 0 && !entry.energy.includes(moment.energy)) return false
  if (moment.section !== null && entry.sections.length > 0 && !entry.sections.includes(moment.section)) return false
  if (moment.energies && moment.energies.length > 0 && entry.energy.length > 0
    && !entry.energy.some((band) => moment.energies!.includes(band))) return false
  if (moment.sections && moment.sections.length > 0 && entry.sections.length > 0
    && !entry.sections.some((section) => moment.sections!.includes(section))) return false
  return true
}

/** Indices whose tags match. An empty match falls back to the whole collection. */
export function tagEligibleIndices(entries: readonly PickEntry[], moment: PickMoment): number[] {
  const matched: number[] = []
  for (let i = 0; i < entries.length; i++) {
    if (entryMatchesMoment(entries[i], moment)) matched.push(i)
  }
  if (matched.length > 0) return matched
  return entries.map((_, index) => index)
}

/**
 * Today's formula: the eligible set is the whole collection and every weight
 * is the same positive number. Callers then emit the historical expression
 * instead of drawing through the weighted table.
 */
export function classicFormula(entries: readonly PickEntry[], moment: PickMoment): boolean {
  const n = entries.length
  if (n === 0) return true
  const tagged = tagEligibleIndices(entries, moment)
  if (tagged.length !== n) return false
  const weight = entries[0]?.weight ?? 0
  if (weight <= 0) return false
  for (let i = 0; i < n; i++) {
    if (tagged[i] !== i) return false
    if (entries[i].weight !== weight) return false
  }
  return true
}

/**
 * The table is emitted only when the historical expression would be wrong:
 * unequal weights, a weight of 0, or any energy tag. Section tags are the
 * Performance Generator's own filter and never force a sketch table.
 */
export function patternPickNeedsTable(weights: readonly number[], energy: readonly (readonly EnergyBand[])[]): boolean {
  if (weights.length < 2) return false
  if (energy.some((tags) => tags.length > 0)) return true
  const first = weights[0]
  for (const weight of weights) {
    if (weight !== first || weight <= 0) return true
  }
  return false
}

function positivePool(entries: readonly PickEntry[], tagged: readonly number[]): number[] {
  return tagged.filter((index) => entries[index].weight > 0)
}

function weightedIndex(entries: readonly PickEntry[], choices: readonly number[], rand: () => number): number {
  let total = 0
  for (const index of choices) total += entries[index].weight
  let ticket = Math.floor(rand() * total)
  for (const index of choices) {
    ticket -= entries[index].weight
    if (ticket < 0) return index
  }
  return choices[choices.length - 1]
}

/**
 * Choose the next collection index.
 *
 * Tag filters run first, and only on dimensions the moment supplies. An
 * untagged group matches anything. If that leaves nobody, the whole collection
 * is eligible. Weight 0 is then dropped. If nobody has a positive weight, the
 * current pattern stays and no number is drawn. One remaining choice is taken
 * without a draw. Equal positive weights over the full collection use today's
 * formula and draw exactly once (except sequential, which never draws).
 */
export function nextPatternIndex(
  entries: readonly PickEntry[],
  current: number,
  moment: PickMoment,
  mode: PickMode,
  rand: () => number,
): PickResult {
  const n = entries.length
  if (n === 0) return { index: 0, drew: false }
  const cur = ((current % n) + n) % n
  const pool = positivePool(entries, tagEligibleIndices(entries, moment))
  if (pool.length === 0) return { index: mode === 'first' || mode === 'opening' ? 0 : cur, drew: false }

  if (classicFormula(entries, moment)) {
    if (mode === 'sequential') return { index: (cur + 1) % n, drew: false }
    if (mode === 'opening') return { index: 0, drew: false }
    if (mode === 'first') return { index: Math.floor(rand() * n) % n, drew: true }
    if (n === 1) return { index: 0, drew: false }
    return { index: (cur + 1 + Math.floor(rand() * (n - 1))) % n, drew: true }
  }

  if (mode === 'opening') return { index: pool[0], drew: false }

  if (mode === 'sequential') {
    for (let step = 1; step <= n; step++) {
      const index = (cur + step) % n
      if (pool.includes(index)) return { index, drew: false }
    }
    return { index: cur, drew: false }
  }

  let choices = pool
  if (mode === 'next' && pool.length > 1) {
    const without = pool.filter((index) => index !== cur)
    if (without.length > 0) choices = without
  }
  if (choices.length === 1) return { index: choices[0], drew: false }
  return { index: weightedIndex(entries, choices, rand), drew: true }
}

export interface CollectionProfileProps {
  patternIds?: readonly string[]
  patternSections?: Record<string, readonly string[] | undefined>
  patternWeights?: Record<string, unknown>
  patternEnergy?: Record<string, readonly unknown[] | undefined>
  patternEntry?: Record<string, unknown>
}

export interface CollectionProfiles {
  ids: string[]
  sectionTags: string[][]
  weights: number[]
  energyTags: EnergyBand[][]
  entry: PatternEntryPolicy[]
}

/** Missing weight is 1. Missing energy tags match any band. Missing entry restarts. */
export function collectionProfiles(ids: readonly string[], props: CollectionProfileProps): CollectionProfiles {
  const sections = props.patternSections ?? {}
  const weights = props.patternWeights ?? {}
  const energy = props.patternEnergy ?? {}
  const entry = props.patternEntry ?? {}
  return {
    ids: [...ids],
    sectionTags: ids.map((id) => [...(sections[id] ?? [])].filter((tag): tag is string => typeof tag === 'string')),
    weights: ids.map((id) => clampPatternWeight(weights[id] ?? PATTERN_WEIGHT_DEFAULT)),
    energyTags: ids.map((id) => [...(energy[id] ?? [])].filter(isEnergyBand)),
    entry: ids.map((id) => (entry[id] === 'resume' ? 'resume' : 'restart')),
  }
}

export function pickEntries(profiles: CollectionProfiles): PickEntry[] {
  return profiles.ids.map((_, index) => ({
    weight: profiles.weights[index] ?? PATTERN_WEIGHT_DEFAULT,
    energy: profiles.energyTags[index] ?? [],
    sections: profiles.sectionTags[index] ?? [],
  }))
}

/** Drop one pattern's weight, energy and entry records so a removed row leaves nothing behind. */
export function withoutPatternProfiles<T extends CollectionProfileProps>(props: T, groupId: string): Pick<CollectionProfileProps, 'patternWeights' | 'patternEnergy' | 'patternEntry'> {
  const patternWeights = { ...(props.patternWeights ?? {}) }
  const patternEnergy = { ...(props.patternEnergy ?? {}) }
  const patternEntry = { ...(props.patternEntry ?? {}) }
  delete patternWeights[groupId]
  delete patternEnergy[groupId]
  delete patternEntry[groupId]
  return { patternWeights, patternEnergy, patternEntry }
}
