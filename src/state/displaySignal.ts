// What a simple display is told, and by whom.
//
// A small non-touch panel — the `InfoDisplay` OLED, the `SegmentDisplay`
// module — has exactly one content input, `Display`, and no layout property.
// What is plugged in decides what it shows. One layout per source: no
// variants, no dropdown, nothing to get wrong, and two sources can never fight
// over one panel because there is only one socket.
//
// The signal is a routing envelope, not a fourth place a reading gets defined.
// Each arm carries the type that is already the authority for its subject —
// `SongInfo` from songInfo.ts, `PatternSelectValue` from patternSelection.ts,
// the RTC preview from rtc.ts — so a panel and the node feeding it cannot
// disagree about what the value is, only about how to draw it.
//
// See docs/development/design/simple-displays.md.

import type { LedOutputStatus } from './ledOutputRuntime'
import type { SongInfo } from './songInfo'
import type { PatternSelectValue } from './patternSelection'
import type { RtcPreview } from './rtc'

/**
 * Which source is plugged in, which *is* the layout choice.
 *
 * Adding a kind is adding a layout to every simple display at once, which is
 * the point: a panel cannot support a source in one place and not another.
 */
export const DISPLAY_SIGNAL_KINDS = ['clock', 'player', 'slideshow', 'ledOutput'] as const
export type DisplaySignalKind = (typeof DISPLAY_SIGNAL_KINDS)[number]

export type DisplaySignal =
  | { kind: 'clock'; clock: RtcPreview }
  /**
   * A player answers for two things at once, so its arm carries both.
   *
   * `SongInfo` is the track. The selection is which pattern is running, which
   * a player owns just as much (it is the same `PatternSelectValue` published
   * on `patternSelect`, from the same cursor) and which a colour panel needs:
   * a Now Playing screen names the pattern and draws its baked artwork, and
   * neither reading exists anywhere in `SongInfo`. Null when the player holds
   * no collection at all — a panel then draws the track and omits the pattern
   * row rather than captioning the artwork frame with an empty name.
   */
  | { kind: 'player'; song: SongInfo; selection: PatternSelectValue | null }
  | { kind: 'slideshow'; selection: PatternSelectValue }
  /**
   * A fixture reporting on itself.
   *
   * The odd one out, and deliberately so: the other three kinds are published
   * by a node whose whole job is to hold the thing being reported, while this
   * one comes off the LED output that is *also* the end of the render chain.
   * That is what makes a status screen possible in a graph with no player and
   * no slideshow in it — a Juggle, a string, and a panel saying how bright it
   * is. See state/ledOutputRuntime.ts for why the reading is the resolved
   * runtime rather than the wires feeding it.
   */
  | { kind: 'ledOutput'; status: LedOutputStatus }

/** Whether a port value is a display signal. */
export function isDisplaySignal(value: unknown): value is DisplaySignal {
  if (!value || typeof value !== 'object') return false
  const kind = (value as { kind?: unknown }).kind
  return typeof kind === 'string' && (DISPLAY_SIGNAL_KINDS as readonly string[]).includes(kind)
}

/**
 * What a panel says with nothing plugged in.
 *
 * Not blank. A blank OLED and a dead OLED look identical on a bench, and the
 * panel that tells you which one it is costs nothing. A segment module cannot
 * render words, so it says the same thing in the vocabulary it has — dashes,
 * which is already how it reports a reading it does not trust.
 */
export const DISPLAY_WAITING_TEXT = 'WAITING FOR A SIGNAL'

/** The label a source's node carries, for an error that has to name it. */
export const DISPLAY_SOURCE_LABELS: Record<DisplaySignalKind, string> = {
  clock: 'RTC Clock',
  player: 'Music Player',
  slideshow: 'Pattern Slideshow',
  ledOutput: 'LED output',
}

/**
 * The sources a *simple* display can be filled from in a normal sketch.
 *
 * A normal sketch compiles the whole graph, so it can read anything the graph
 * computes — but a player and a slideshow are not computed there, they *are*
 * the other two generators. Wiring one into an OLED or a segment module in a
 * normal sketch builds a different generator entirely, which validation
 * reports before upload; the panel draws its Waiting screen meanwhile rather
 * than a layout it cannot fill.
 *
 * An LED output is the opposite case, and the reason this is a list rather
 * than `kind === 'clock'` written at each display: the fixture is part of the
 * compiled graph, its resolved state is right there in the loop, and a normal
 * sketch is the only generator that can report it at all.
 *
 * A colour `TransportDisplay` deliberately does *not* narrow this way. Its
 * layouts carry touch regions as well as content, and Fixed Transport's
 * finger-sized buttons driving a Juggle in a player-less sketch is a supported
 * shape — the rows read blank and the glass still works.
 */
export const SKETCH_DISPLAY_SOURCE_KINDS: readonly DisplaySignalKind[] = ['clock', 'ledOutput']

/**
 * The node types that publish each kind, for resolution without evaluation.
 *
 * Two nodes publish `player`, and they are not a duplication: both are holding
 * a file off the card, and both build the same SD player sketch. Music Player
 * decodes a track and rotates its collection live; Performance Generator plays
 * a track against a timed show file. What a panel can say about either is the
 * same list of things, so they answer on the same kind rather than on two kinds
 * that would each need their own layouts, field catalogue and templates.
 */
export const DISPLAY_SOURCE_NODE_TYPES: Record<string, DisplaySignalKind> = {
  RTCInput: 'clock',
  PatternMaster: 'player',
  PerformanceGenerator: 'player',
  PatternSlideshow: 'slideshow',
  MatrixOutput: 'ledOutput',
}
