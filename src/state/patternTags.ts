// **Author tags** on a saved pattern: where its author thinks it looks best.
//
// This is deliberately not the same question as "will this render". Whether a
// pattern *works* on an output is mostly mechanical and mostly yes — Juggle
// reads well on a string, a matrix and a ring alike, and a library that hid it
// from a string search because it happened to be authored on a matrix would be
// worse than one with no tags at all. Where a pattern *shines* is a matter of
// taste, and the only person holding it is the author, who has just spent an
// hour looking at the thing.
//
// So the tag promotes, it does not exclude. Three states, and the default one
// is the useful one:
//
//   best   the author said so — sorts to the top of a search for that output
//   works  nothing known against it — the default, and what an untagged
//          pattern is forever; it still appears in every search
//   poor   the pattern's whole content is a 2-D form (a clock face, a text
//          banner, a wireframe) with no meaningful reading on one line
//
// Only `poor` is derived, and it is derived narrowly on purpose: it is the one
// case a machine can answer honestly, and a rule that fires rarely is the right
// failure mode for a rule nobody asked for. An author naming an output beats
// the derivation for that output — if someone says their clock belongs on a
// string, they have seen it there and we have not.

import type { StudioNode } from './graphStore'
import { type LedOutputForm } from './ledOutputForm'

/**
 * The tag vocabulary — deliberately coarser than `LedOutputForm`.
 *
 * A ring and a corkscrew are both a chain read around a seam, and a HUB75
 * panel is a matrix in every sense a pattern can perceive, so five output forms
 * collapse to the three distinctions an author can actually feel. Four buttons
 * where three will do is a worse question, not a more precise one.
 */
export type PatternFormTag = 'string' | 'matrix' | 'ring'

export const PATTERN_FORM_TAGS: { id: PatternFormTag; label: string; hint: string }[] = [
  { id: 'string', label: 'LED String', hint: 'Reads well as one line of light.' },
  { id: 'matrix', label: 'LED Matrix / HUB75', hint: 'Uses the second axis — shapes, fields, text.' },
  { id: 'ring', label: 'LED Ring', hint: 'Loops around a circle without an obvious seam.' },
]

const PATTERN_FORM_TAG_IDS = new Set<string>(PATTERN_FORM_TAGS.map((tag) => tag.id))

/** Which tag an actual output on the bench answers to. */
export function formTagForOutputForm(form: LedOutputForm): PatternFormTag {
  if (form === 'strip') return 'string'
  if (form === 'ring' || form === 'corkscrew') return 'ring'
  return 'matrix'
}

/** How well a pattern suits one output, in the order a search should rank them. */
export type PatternFit = 'best' | 'works' | 'poor'

export const PATTERN_FIT_ORDER: Record<PatternFit, number> = { best: 0, works: 1, poor: 2 }

/**
 * Nodes whose entire content *is* a two-dimensional form.
 *
 * Squeezed onto one line a clock face is a smear and a text banner is a
 * flicker — there is no slice of them that still says what they say. This is
 * not "uses X and Y": a plasma or a noise field sampled along a single row is
 * still a plasma, and belongs nowhere near this set. Kept short so that `poor`
 * stays rare and defensible; when in doubt, leave a type out and let the
 * pattern be `works`.
 */
const TWO_D_FORM_TYPES = new Set([
  'Text', 'ClockDisplay', 'Clock', 'Wireframe3D', 'Shape', 'Circle', 'Image',
])

function nodeType(node: StudioNode): string {
  return String((node.data as { nodeType?: unknown }).nodeType ?? '')
}

/** True when the pattern's content has no meaningful one-line reading. */
export function needsTwoDimensions(nodes: StudioNode[]): boolean {
  return nodes.some((node) => TWO_D_FORM_TYPES.has(nodeType(node)))
}

/** The author's tags, defended against anything a hand-edited or imported
 *  pattern file might carry. */
export function patternFormTags(bestOn: unknown): PatternFormTag[] {
  if (!Array.isArray(bestOn)) return []
  const seen = new Set<PatternFormTag>()
  for (const entry of bestOn) {
    if (typeof entry === 'string' && PATTERN_FORM_TAG_IDS.has(entry)) seen.add(entry as PatternFormTag)
  }
  // Ordered by the tag list rather than by however the file listed them, so two
  // patterns tagged the same way always render the same chips in the same place.
  return PATTERN_FORM_TAGS.filter((tag) => seen.has(tag.id)).map((tag) => tag.id)
}

/**
 * How a pattern suits one output form.
 *
 * The author wins for the output they named; the derivation only ever speaks
 * about outputs nobody has vouched for. A matrix is never a poor fit — it is
 * the shape everything else is a reduction of.
 */
export function patternFit(
  pattern: { bestOn?: unknown; subgraph: { nodes: StudioNode[] } },
  tag: PatternFormTag,
): PatternFit {
  if (patternFormTags(pattern.bestOn).includes(tag)) return 'best'
  if (tag !== 'matrix' && needsTwoDimensions(pattern.subgraph.nodes)) return 'poor'
  return 'works'
}
