import type { StudioNode } from './graphStore'
import type { PhysicalBoardProfile } from '../build/boardProfiles'
import { collectPinUses } from '../build/hardwareManifest'

/** Every GPIO the graph already claims, from any node and any pin property. */
export function claimedPins(nodes: StudioNode[]): Set<number> {
  return new Set(collectPinUses(nodes).map((use) => use.pin))
}

/**
 * The pin a new addressable LED output should start on, for this board.
 *
 * Preference order is the board's own recommendation, then the alternatives it
 * names, then its general-purpose pool — skipping anything the graph already
 * uses, so adding a second strip cannot silently collide with the first. This
 * is what makes more than one LED output safe to add: without it every new
 * output would default to the same library pin.
 *
 * Returns null when the board has nothing left, which callers should treat as
 * "this board is full" rather than falling back to a guess — a wrong pin that
 * looks deliberate is worse than an action that explains why it is unavailable.
 */
export function nextFreeLedDataPin(
  profile: PhysicalBoardProfile | undefined,
  nodes: StudioNode[],
): number | null {
  const claimed = claimedPins(nodes)
  const reserved = new Set(
    Object.keys(profile?.pinSafety?.boardReservedOrNotExposed ?? {}).map((key) => Number(key)),
  )
  const candidates: number[] = []
  const led = profile?.peripheralPins?.fastLedData
  if (led) {
    candidates.push(led.recommendedDefault, ...led.commonAlternatives)
  }
  candidates.push(...(profile?.pinSafety?.safeGeneralPurpose ?? []))

  for (const pin of candidates) {
    if (!Number.isFinite(pin)) continue
    if (claimed.has(pin) || reserved.has(pin)) continue
    return pin
  }
  return null
}
