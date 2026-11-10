import { AUDIO_BUNDLED_PATTERNS } from './bundledPatterns'
import { BUNDLED_EXCEPTIONAL_AUDIO_NAMES } from './bundledExceptionalAudio'
import { patternFormTags } from './patternTags'
import type { SavedPattern } from './patternLibrary'

/**
 * How many patterns a show starter's Pattern Collection opens with.
 *
 * The Exceptional list is far longer than this, and every collected pattern
 * is compiled into the sketch, so a starter holding all of them is a show too
 * large for most boards before the user has changed anything. Twenty is a
 * show with real variety that a classic ESP32 can still be expected to carry.
 */
export const STARTER_SHOW_SIZE = 20

/**
 * The patterns a show starter's or example's Pattern Collection opens with:
 * the head of the checked-in Exceptional list (`bundledExceptionalAudio.ts`),
 * the author's chosen patterns first and then best score first.
 *
 * Patterns tagged for a string alone are passed over, because every show
 * starter and example plays on a matrix, where a one-line pattern is a
 * single lit row.
 */
export function starterShowPatterns(): SavedPattern[] {
  const byName = new Map(AUDIO_BUNDLED_PATTERNS.map((pattern) => [pattern.name, pattern]))
  return BUNDLED_EXCEPTIONAL_AUDIO_NAMES
    .map((name) => byName.get(name))
    .filter((pattern): pattern is SavedPattern => {
      if (!pattern) return false
      const tags = patternFormTags(pattern.bestOn)
      return tags.length === 0 || tags.includes('matrix')
    })
    .slice(0, STARTER_SHOW_SIZE)
}
