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
export const SLIDESHOW_MIN_HOLD_SEC = 1

/**
 * The hold a new slideshow draws from. Unequal, so Energy Pacing and Dwells &
 * Bursts have a range to lean within once Audio Reactive is on; equal Min and
 * Max Time is a fixed hold.
 */
export const SLIDESHOW_DEFAULT_MIN_TIME = 8
export const SLIDESHOW_DEFAULT_MAX_TIME = 30
export const SLIDESHOW_DEFAULT_TRANSITION_SEC = 1.5

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
   * Shortest and longest hold in seconds, the Music Player's pair, with or
   * without Audio Reactive. Equal means a fixed hold.
   */
  minTime: number
  maxTime: number
  /** Seconds to cross into the next pattern; 0 is a cut, on both sides. */
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
  minTime?: number | null
  maxTime?: number | null
  transitionSec?: number | null
  /**
   * Whether anything that can beat is wired: the Beat input, or the Audio
   * input whose detector it stands in for. Beat Transitions with nothing
   * wired would wait for a beat that never comes, and the node draws the row
   * disabled, so the resolver treats the switch as off and the show runs on
   * its timer. Omitted means the property alone decides.
   */
  beatSource?: boolean
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
  const audioReactive = props.audioReactive === true
  // The hold is always Min to Max Time; only the timing that listens (Beat
  // Transitions, Energy Pacing, Dwells & Bursts) is switched off with the
  // sound it would follow.
  const minTime = Math.max(SLIDESHOW_MIN_HOLD_SEC, seconds(wired.minTime, props.minTime, SLIDESHOW_DEFAULT_MIN_TIME))
  const seed = Math.round(Number(props.seed ?? 0))
  return {
    order: asSlideshowOrder(props.order),
    minTime,
    maxTime: Math.max(minTime, seconds(wired.maxTime, props.maxTime, SLIDESHOW_DEFAULT_MAX_TIME)),
    // A transition of zero is a cut the user asked for, so it is left alone
    // rather than floored up to a minimum they did not.
    transitionSec: seconds(wired.transitionSec, props.transitionSec, SLIDESHOW_DEFAULT_TRANSITION_SEC),
    beatTransitions: audioReactive && props.beatTransitions === true && wired.beatSource !== false,
    energyPacing: audioReactive && props.energyPacing === true,
    dwellsAndBursts: audioReactive && props.dwellsAndBursts === true,
    audioReactive,
    seed: Number.isFinite(seed) ? Math.max(0, seed) : 0,
  }
}
