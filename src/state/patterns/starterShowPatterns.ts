import { AUDIO_BUNDLED_PATTERNS, STANDARD_BUNDLED_PATTERNS } from './bundledPatterns'
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
    .filter((pattern): pattern is SavedPattern => !!pattern && playsOnMatrix(pattern))
    .slice(0, STARTER_SHOW_SIZE)
}

/** How many patterns a slideshow starter opens with: enough to step through,
 *  few enough that a browser's baked thumbnails stay small. */
export const STARTER_SLIDESHOW_SIZE = 5

/**
 * The patterns a slideshow starter's Pattern Collection opens with: the head
 * of the standard (non-audio) shelf, so they move with no microphone and the
 * starter shows something to step through before any pattern is built.
 */
export function starterSlideshowPatterns(): SavedPattern[] {
  return STANDARD_BUNDLED_PATTERNS.filter(playsOnMatrix).slice(0, STARTER_SLIDESHOW_SIZE)
}

/** Every starter plays on a matrix, where a string-only pattern is one lit row. */
function playsOnMatrix(pattern: SavedPattern): boolean {
  const tags = patternFormTags(pattern.bestOn)
  return tags.length === 0 || tags.includes('matrix')
}
