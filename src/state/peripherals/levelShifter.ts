import { PART_CATALOGUE, memoByCatalogue, partById, type PartLevelShifterSpec } from '../../build/parts/partCatalogue'
import { resolveLevelShifterPads, type LevelShifterPads } from '../../build/parts/manifest/levelShifterBlock'
import { partIdOrDefault } from './partSpec'

/**
 * The level shifter a Board starts with, and the one a Board that names none
 * uses. A starting value, like every default part: nothing else branches on it.
 */
export const DEFAULT_LEVEL_SHIFTER_PART_ID = 'sn74ahct125n-dip14'

/**
 * The level shifter part the whole board's LED data lines run through: one part
 * per board, chosen on the Board node. Empty or missing means the default; an
 * unknown id stays as itself and resolves to no spec.
 */
export function levelShifterPartIdFor(boardProperties: Record<string, unknown> | undefined): string {
  return partIdOrDefault(boardProperties?.levelShifterPartId, DEFAULT_LEVEL_SHIFTER_PART_ID)
}

/** The facts of a level shifter part, or null for a part that carries no such block. */
export function levelShifterSpec(partId: string): PartLevelShifterSpec | null {
  return partById(partId)?.levelShifter ?? null
}

/** Every part a Board may name as its level shifter, in catalogue order. */
export const levelShifterPartIds: () => readonly string[] = memoByCatalogue(() =>
  Object.values(PART_CATALOGUE).filter((entry) => entry.levelShifter).map((entry) => entry.partId))

/** What the Build Diagram and the exports read about a Board's level shifter. */
export interface LevelShifter {
  partId: string
  label: string
  spec: PartLevelShifterSpec
  pads: LevelShifterPads
  /** The measured render, in its own pixels. */
  render: { widthPx: number; heightPx: number }
}

/**
 * The shifter a part resolves to, or null when the part is unknown, carries no
 * block, or its labels do not name measured pads (which a valid manifest never
 * does). Never another part's facts.
 */
export function levelShifterFor(partId: string): LevelShifter | null {
  const entry = partById(partId)
  if (!entry?.levelShifter || !entry.render) return null
  const resolved = resolveLevelShifterPads(entry.levelShifter, entry.pads, entry.render.widthPx)
  if ('issue' in resolved) return null
  return {
    partId,
    label: entry.label,
    spec: entry.levelShifter,
    pads: resolved.layout,
    render: { widthPx: entry.render.widthPx, heightPx: entry.render.heightPx },
  }
}
