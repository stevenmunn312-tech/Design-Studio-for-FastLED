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

import type { SongInfo } from './songInfo'
import type { PatternSelectValue } from './patternSelection'
import type { RtcPreview } from './rtc'

/**
 * Which source is plugged in, which *is* the layout choice.
 *
 * Adding a kind is adding a layout to every simple display at once, which is
 * the point: a panel cannot support a source in one place and not another.
 */
export const DISPLAY_SIGNAL_KINDS = ['clock', 'player', 'slideshow'] as const
export type DisplaySignalKind = (typeof DISPLAY_SIGNAL_KINDS)[number]

export type DisplaySignal =
  | { kind: 'clock'; clock: RtcPreview }
  | { kind: 'player'; song: SongInfo }
  | { kind: 'slideshow'; selection: PatternSelectValue }

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
}

/** The node types that publish each kind, for resolution without evaluation. */
export const DISPLAY_SOURCE_NODE_TYPES: Record<string, DisplaySignalKind> = {
  RTCInput: 'clock',
  PatternMaster: 'player',
  PatternSlideshow: 'slideshow',
}
