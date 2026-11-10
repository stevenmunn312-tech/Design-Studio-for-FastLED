// What a library pattern adds to a sketch's flash, as Pattern Insights and
// the Pattern Collection picker show it.
//
// An estimate from the firmware the pattern would generate, not a compile:
// the pattern's render function and the helpers it brings are generated the
// way a show sketch generates them (`buildPatternRenderers`), their code is
// measured with comments and spacing removed, and that length is scaled by a
// ratio fitted to real builds. It is the pattern alone: two patterns that
// share a helper each count it, so a collection costs less than the sum.
//
// Kept apart from patternCost.ts because it imports the show generator.

import { buildPatternRenderers } from '../../codegen/showGenerator'
import type { GroupRegistry } from '../graphEvaluator'
import type { SavedPattern } from './patternLibrary'

export interface PatternFlashEstimate {
  /** Estimated bytes of program storage. */
  bytes: number
  /** Generated code the estimate was made from, in characters. */
  codeChars: number
}

// Fitted on 2026-11-11 to the four `pattern-collections` compile fixtures
// (every bundled pattern, as show sketches on an ESP32-S3 with arduino-cli):
// flash grew by 0.57 bytes for each character of pattern code, over a fixed
// 1.03 MB for the player itself. The three larger sketches land within 10% of
// that line and the smallest, forty short string patterns, within 50%, so the
// figure ranks patterns and sizes a collection roughly; it is not a
// measurement, and another chip family compiles to a different density.
// Refit with: python scripts/compile-fixtures/compile-matrix.py --only pattern-collections/
export const FLASH_BYTES_PER_CODE_CHAR = 0.57

export const FLASH_TITLE = 'About how much program storage this pattern adds to a sketch on its own, estimated from the firmware it generates. Patterns in one collection share helper code, so a collection takes less than the sum.'

/** Code only: comments say nothing to the compiler, and neither does layout. */
function codeLength(source: string): number {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').length
}

const cache = new WeakMap<SavedPattern['subgraph'], PatternFlashEstimate>()

/**
 * Estimated flash of one pattern. `groups` supplies any groups the pattern
 * nests. Cached per subgraph object: a library pattern's subgraph is replaced,
 * never edited in place, when the pattern changes.
 */
export function patternFlashEstimate(pattern: SavedPattern, groups: GroupRegistry = {}): PatternFlashEstimate {
  const cached = cache.get(pattern.subgraph)
  if (cached) return cached
  let codeChars = 0
  try {
    const renderers = buildPatternRenderers([pattern.id], { ...groups, [pattern.id]: pattern.subgraph } as GroupRegistry, [], true)
    codeChars = [...renderers.functions, ...renderers.helpers].reduce((sum, source) => sum + codeLength(source), 0)
  } catch {
    // A pattern the generator cannot emit has no flash to state.
    codeChars = 0
  }
  const estimate = { bytes: Math.round(codeChars * FLASH_BYTES_PER_CODE_CHAR), codeChars }
  cache.set(pattern.subgraph, estimate)
  return estimate
}
