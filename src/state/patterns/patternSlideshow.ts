// What a Pattern Slideshow's properties mean.
//
// The slideshow is the generative show with the music taken out, so the two
// halves that have to agree about it are the evaluator (preview) and
// `showGenerator.ts` (firmware). Both read this, rather than each reading the
// raw properties and rounding, defaulting and clamping them their own way —
// which is how a preview that fades for a second and a device that cuts get
// built from the same graph.
//
// See docs/design/generative-pattern-show.md#pattern-slideshow.

export const PATTERN_SLIDESHOW_ORDERS = ['Random', 'Sequential', 'Sequence'] as const
export type PatternSlideshowOrder = (typeof PATTERN_SLIDESHOW_ORDERS)[number]

export function asSlideshowOrder(value: unknown): PatternSlideshowOrder {
  const order = String(value ?? '')
  return (PATTERN_SLIDESHOW_ORDERS as readonly string[]).includes(order)
    ? (order as PatternSlideshowOrder)
    : 'Random'
}

/** Shortest hold worth offering: below this a slideshow is a strobe. */
export const SLIDESHOW_MIN_INTERVAL_SEC = 1

/** Average bass/mids/treble level at or below which the room is silent. */
export const SLIDESHOW_SILENCE_THRESHOLD = 0.025
/** Seconds for an audio-reactive slideshow to reach black after silence. */
export const SLIDESHOW_SILENCE_FADE_OUT_SEC = 0.5
/** Seconds to restore full brightness when sound returns. */
export const SLIDESHOW_SILENCE_FADE_IN_SEC = 0.25

/** Advance the audio-reactive silence envelope by real elapsed time. */
export function advanceSlideshowSilenceFade(
  level: number,
  audioEnergy: number,
  elapsedSec: number,
): number {
  const current = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1
  const energy = Number.isFinite(audioEnergy) ? Math.max(0, audioEnergy) : 0
  const target = energy <= SLIDESHOW_SILENCE_THRESHOLD ? 0 : 1
  const duration = target < current ? SLIDESHOW_SILENCE_FADE_OUT_SEC : SLIDESHOW_SILENCE_FADE_IN_SEC
  const step = Math.max(0, Number.isFinite(elapsedSec) ? elapsedSec : 0) / duration
  return target < current
    ? Math.max(target, current - step)
    : Math.min(target, current + step)
}

export interface SlideshowSettings {
  order: PatternSlideshowOrder
  /**
   * Shortest and longest hold in seconds, the Music Player's pair. Without
   * Audio Reactive both are the fixed Interval.
   */
  minTime: number
  maxTime: number
  /**
   * Seconds to cross into the next pattern. Zero when transitions are off,
   * which both sides already render as a cut, so "off" needs no second path.
   */
  transitionSec: number
  /**
   * Wait for a fresh beat once the hold ends; a Sequence hold counts beats.
   * This and the pacing switches are Audio Reactive's, and off without it.
   */
  beatTransitions: boolean
  /** Hold pacing, as on the Music Player (patternPacing.ts). */
  energyPacing: boolean
  dwellsAndBursts: boolean
  /** Whether wired audio reaches the slideshow at all: patterns and timing. */
  audioReactive: boolean
  seed: number
}

/** Wired timing inputs, which take over from the matching properties. */
export interface SlideshowWiredTiming {
  interval?: number | null
  minTime?: number | null
  maxTime?: number | null
  transitionSec?: number | null
}

/** The longest hold the firmware's unsigned millisecond clock can count. */
const MAX_HOLD_SEC = 86400

function seconds(wired: number | null | undefined, value: unknown, fallback: number): number {
  const n = wired != null ? wired : Number(value ?? fallback)
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_HOLD_SEC, n)) : fallback
}

/** Resolve a slideshow node's properties, with wired timing taking over. */
export function slideshowSettings(
  props: Record<string, unknown>,
  wired: SlideshowWiredTiming = {},
): SlideshowSettings {
  const transitionsOn = props.transitionsEnabled !== false
  const audioReactive = props.audioReactive === true
  // Without Audio Reactive the hold is one Interval, and the timing that
  // varies it is switched off with the sound it would vary it by.
  const interval = Math.max(SLIDESHOW_MIN_INTERVAL_SEC, seconds(wired.interval, props.interval, 20))
  const minTime = audioReactive
    ? Math.max(SLIDESHOW_MIN_INTERVAL_SEC, seconds(wired.minTime, props.minTime, 20))
    : interval
  const seed = Math.round(Number(props.seed ?? 0))
  return {
    order: asSlideshowOrder(props.order),
    minTime,
    maxTime: audioReactive ? Math.max(minTime, seconds(wired.maxTime, props.maxTime, 20)) : interval,
    // A fade of zero with transitions on is a cut the user asked for, so it is
    // left alone rather than floored up to a minimum they did not.
    transitionSec: transitionsOn ? seconds(wired.transitionSec, props.transitionSec, 1.5) : 0,
    beatTransitions: audioReactive && props.beatTransitions === true,
    energyPacing: audioReactive && props.energyPacing === true,
    dwellsAndBursts: audioReactive && props.dwellsAndBursts === true,
    audioReactive,
    seed: Number.isFinite(seed) ? Math.max(0, seed) : 0,
  }
}
