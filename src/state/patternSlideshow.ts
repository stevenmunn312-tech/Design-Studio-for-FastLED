// What a Pattern Slideshow's properties mean.
//
// The slideshow is the generative show with the music taken out, so the two
// halves that have to agree about it are the evaluator (preview) and
// `showGenerator.ts` (firmware). Both read this, rather than each reading the
// raw properties and rounding, defaulting and clamping them their own way —
// which is how a preview that fades for a second and a device that cuts get
// built from the same graph.
//
// See docs/development/design/generative-pattern-show.md#pattern-slideshow.

export const PATTERN_SLIDESHOW_ORDERS = ['Random', 'Sequential'] as const
export type PatternSlideshowOrder = (typeof PATTERN_SLIDESHOW_ORDERS)[number]

export function asSlideshowOrder(value: unknown): PatternSlideshowOrder {
  const order = String(value ?? '')
  return (PATTERN_SLIDESHOW_ORDERS as readonly string[]).includes(order)
    ? (order as PatternSlideshowOrder)
    : 'Random'
}

/** Shortest interval worth offering: below this a slideshow is a strobe. */
export const SLIDESHOW_MIN_INTERVAL_SEC = 1

export interface SlideshowSettings {
  order: PatternSlideshowOrder
  /** Seconds one pattern holds. One number, not a range: see the design note. */
  intervalSec: number
  /**
   * Seconds to cross into the next pattern. Zero when transitions are off,
   * which both sides already render as a cut, so "off" needs no second path.
   */
  transitionSec: number
  /** Whether wired audio reaches the collected patterns at all. */
  audioReactive: boolean
  seed: number
}

function positive(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function nonNegative(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Resolve a slideshow node's properties, with a wired interval taking over. */
export function slideshowSettings(
  props: Record<string, unknown>,
  wiredInterval?: number | null,
): SlideshowSettings {
  const transitionsOn = props.transitionsEnabled !== false
  const interval = wiredInterval != null && Number.isFinite(wiredInterval) && wiredInterval > 0
    ? wiredInterval
    : positive(props.interval, 20)
  const seed = Math.round(Number(props.seed ?? 0))
  return {
    order: asSlideshowOrder(props.order),
    intervalSec: Math.max(SLIDESHOW_MIN_INTERVAL_SEC, interval),
    // A fade of zero with transitions on is a cut the user asked for, so it is
    // left alone rather than floored up to a minimum they did not.
    transitionSec: transitionsOn ? nonNegative(props.transitionSec, 1.5) : 0,
    audioReactive: props.audioReactive === true,
    seed: Number.isFinite(seed) ? Math.max(0, seed) : 0,
  }
}
