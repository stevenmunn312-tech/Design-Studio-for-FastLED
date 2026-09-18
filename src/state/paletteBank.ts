// Palette Bank — the ordered set of presets a build ships, and the cursor that
// steps through it.
//
// One module because three sides have to agree exactly: the evaluator (preview),
// `cppGenerator` (firmware) and the node body that draws the chips. The bank's
// whole purpose is that a build carries the palettes its author ticked and no
// others — `customPaletteDeclarationsCpp` declares only the palettes a sketch
// names, at 48 bytes of RAM each — so what counts as "in the bank" cannot be
// decided twice.
import { isStudioPalette, PALETTE_DEFS, resolvePaletteId } from './paletteCatalog'

/**
 * What an empty bank reports.
 *
 * A bank with nothing ticked still has to produce a palette: every consumer
 * downstream reads one, and a build that refuses to render is a worse answer
 * than one that renders the library default while Graph Health says the bank
 * is empty. It is the same default `resolvePaletteId` falls back to, so preview
 * and firmware agree without either side stating it again.
 */
export const PALETTE_BANK_FALLBACK = resolvePaletteId('')

/**
 * The presets this bank ships, in order.
 *
 * Resolved against the catalogue rather than trusted: these ids become C++
 * identifiers (`paldef_<id>`), and an imported workspace can carry anything at
 * all. Duplicates are dropped because the index is a position in this list — a
 * palette appearing twice would make Next stop on it twice with no way to tell
 * the two apart.
 */
export function paletteBankEntries(properties: Record<string, unknown>): string[] {
  const raw = properties.palettes
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const id = entry.trim().toLowerCase()
    if (!isStudioPalette(id)) continue
    seen.add(id)
  }
  return [...seen]
}

/** The palette a bank at `index` reports, and what an empty one falls back to. */
export function paletteBankSelection(entries: readonly string[], index: number): string {
  return entries[clampPaletteBankIndex(index, entries.length)] ?? PALETTE_BANK_FALLBACK
}

/**
 * A press moves the cursor one place and wraps at both ends, the same rule
 * `patternSelection.ts` fixes for patterns: reaching the last palette and
 * pressing Next again is how you get back to the first, and a bank of one
 * stays where it is rather than dividing by zero.
 */
export function stepPaletteBankIndex(index: number, count: number, delta: number): number {
  if (count <= 0) return 0
  const next = (Math.round(index) + Math.round(delta)) % count
  return next < 0 ? next + count : next
}

/**
 * Hold the cursor inside a bank that has since changed size.
 *
 * Unticking a palette shortens the list under a cursor that may be past its
 * end, and an out-of-range index would report the fallback rather than a
 * palette the bank actually holds.
 */
export function clampPaletteBankIndex(index: number, count: number): number {
  if (count <= 0) return 0
  const whole = Number.isFinite(index) ? Math.round(index) : 0
  return Math.min(count - 1, Math.max(0, whole))
}

/**
 * Move one entry to another position, as a drag does.
 *
 * Order is the bank's contract — Next steps through it — so this is a real
 * edit, not a view concern, and it lives here with the rest of the bank's
 * rules. Out-of-range indices are clamped rather than refused: a drop past
 * the end of the list means the end of the list, which is what the gesture
 * looks like.
 */
export function movePaletteBankEntry(
  entries: readonly string[], from: number, to: number,
): string[] {
  const next = [...entries]
  if (next.length < 2) return next
  const source = clampPaletteBankIndex(from, next.length)
  const target = clampPaletteBankIndex(to, next.length)
  if (source === target) return next
  const [moved] = next.splice(source, 1)
  next.splice(target, 0, moved)
  return next
}

/** How a palette reads on a screen — the catalogue's own label. */
export function paletteBankLabel(id: string): string {
  return PALETTE_DEFS.find((palette) => palette.id === id)?.label ?? id
}
