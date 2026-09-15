// What a widget can read from the one source wired into its panel.
//
// A screen used to get its values the way any node does: every readout minted
// an input port and you drew a cable into it. A Now Playing screen with five
// readings was five cables from one Music Player that was already wired to the
// panel beside them — the values were there, just not offered.
//
// So a widget names a *field* of the connected source instead, and draws no
// cable. Which fields exist is a fact about the source, and every one of them
// is already listed somewhere for the fixed layouts to draw: the player's are
// `SONG_INFO_PORTS`, the clock's are its snapshot, the slideshow's are its
// selection. This reads those lists rather than restating them, so a field
// added to the player arrives here without being mentioned twice.
//
// A widget that genuinely needs a number from elsewhere in the graph — an audio
// band, a computed value — says so, and mints the port it used to always have.
// See `DISPLAY_SOURCE_FROM_GRAPH`.

import type { DisplaySignal, DisplaySignalKind } from './displaySignal'
import { SONG_INFO_PORTS } from './songInfo'

/** The value a widget's `source` holds when it wants a cable instead. */
export const DISPLAY_SOURCE_FROM_GRAPH = 'graph'

export interface DisplaySourceField {
  /** Stored on the widget. Stable: renaming a label must not move a binding. */
  id: string
  label: string
  dataType: 'string' | 'bool' | 'float'
}

/** The pattern a player or a slideshow is showing, which both arms carry. */
const SELECTION_FIELDS: readonly DisplaySourceField[] = [
  { id: 'patternName', label: 'Pattern name', dataType: 'string' },
  { id: 'patternIndex', label: 'Pattern number', dataType: 'float' },
  { id: 'patternCount', label: 'Pattern count', dataType: 'float' },
]

const CLOCK_FIELDS: readonly DisplaySourceField[] = [
  { id: 'time', label: 'Time', dataType: 'string' },
  { id: 'date', label: 'Date', dataType: 'string' },
  { id: 'hour', label: 'Hour', dataType: 'float' },
  { id: 'minute', label: 'Minute', dataType: 'float' },
  { id: 'second', label: 'Second', dataType: 'float' },
  { id: 'valid', label: 'Clock set', dataType: 'bool' },
]

const SLIDESHOW_FIELDS: readonly DisplaySourceField[] = [
  ...SELECTION_FIELDS,
  { id: 'highlightName', label: 'Highlighted pattern', dataType: 'string' },
  { id: 'browsing', label: 'Browsing', dataType: 'bool' },
]

/**
 * The player's own fields, taken from the list the Song Info node spreads.
 *
 * Mapped rather than copied: one list means a field added to a track report is
 * offered on a screen the same day, and cannot be offered here under a name
 * nothing publishes.
 */
const PLAYER_FIELDS: readonly DisplaySourceField[] = [
  ...SONG_INFO_PORTS.map((port) => ({ id: port.id, label: port.label, dataType: port.dataType })),
  ...SELECTION_FIELDS,
]

/**
 * A fixture's own readings, the same five the LED Status layouts draw.
 *
 * `level` is a percentage rather than the 0-1 the signal carries, because a
 * widget binding lands in a text or numeric readout and "85" is what a person
 * reads off a panel; a widget that wants the 0-1 for a bar has `brightness`
 * beside it. Both are the *effective* values, so a bound readout and the fixed
 * layout beside it cannot disagree about whether the lights are on.
 */
const LED_OUTPUT_FIELDS: readonly DisplaySourceField[] = [
  { id: 'outputName', label: 'Output name', dataType: 'string' },
  { id: 'outputForm', label: 'Output type', dataType: 'string' },
  { id: 'ledCount', label: 'LED count', dataType: 'float' },
  { id: 'lit', label: 'Lit', dataType: 'bool' },
  { id: 'brightness', label: 'Brightness', dataType: 'float' },
  { id: 'level', label: 'Brightness percent', dataType: 'float' },
]

const BY_KIND: Record<DisplaySignalKind, readonly DisplaySourceField[]> = {
  player: PLAYER_FIELDS,
  clock: CLOCK_FIELDS,
  slideshow: SLIDESHOW_FIELDS,
  ledOutput: LED_OUTPUT_FIELDS,
}

/**
 * What a widget on this panel can be bound to.
 *
 * Empty when nothing is wired, which is the honest answer: there are no fields
 * until there is a source, and the editor offers the graph instead.
 */
export function displaySourceFields(kind: DisplaySignalKind | null | undefined): readonly DisplaySourceField[] {
  return kind ? BY_KIND[kind] ?? [] : []
}

/**
 * A widget's stored `source`, as a document may safely carry it.
 *
 * The boundary check for an untrusted document, and it deliberately cannot ask
 * which source is wired in: a document has no panel in hand, and a design saved
 * against a player then moved to a slideshow must keep the binding it was drawn
 * with rather than have it silently erased. So it validates against every field
 * any source offers — the same relationship `normalizeDisplayAssetId` has with
 * the installed pack — and a field the wired source does not carry is reported
 * by name at build time instead.
 *
 * Returns an empty string for anything unknown, which reads as "from the graph"
 * everywhere a binding is asked about.
 */
export function normalizeDisplaySource(value: unknown): string {
  if (typeof value !== 'string') return ''
  const id = value.trim()
  if (id === DISPLAY_SOURCE_FROM_GRAPH) return id
  return ALL_SOURCE_FIELD_IDS.has(id) ? id : ''
}

const ALL_SOURCE_FIELD_IDS: ReadonlySet<string> = new Set(
  Object.values(BY_KIND).flatMap((fields) => fields.map((field) => field.id)),
)

export function displaySourceField(
  kind: DisplaySignalKind | null | undefined,
  id: unknown,
): DisplaySourceField | undefined {
  if (typeof id !== 'string' || id === DISPLAY_SOURCE_FROM_GRAPH) return undefined
  return displaySourceFields(kind).find((field) => field.id === id)
}

function pad(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0')
}

/**
 * Read one bound field out of a live envelope.
 *
 * Returns null for a field this source does not carry, which the caller shows
 * as its blank rather than as a zero: a screen wired to a slideshow asking for
 * a track title has no title, and saying "0" would be a lie about the music.
 */
export function readDisplaySourceField(
  signal: DisplaySignal | null | undefined,
  id: string,
): string | number | boolean | null {
  if (!signal) return null
  if (signal.kind === 'clock') {
    const clock = signal.clock
    switch (id) {
      case 'time': return `${pad(clock.hour)}:${pad(clock.minute)}:${pad(clock.second)}`
      case 'date': return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`
      case 'hour': return clock.hour
      case 'minute': return clock.minute
      case 'second': return clock.second
      case 'valid': return clock.valid
      default: return null
    }
  }
  if (signal.kind === 'ledOutput') {
    const status = signal.status
    switch (id) {
      case 'outputName': return status.name
      case 'outputForm': return status.formLabel
      case 'ledCount': return status.ledCount
      case 'lit': return status.enabled
      case 'brightness': return status.brightness
      case 'level': return Math.round(Math.max(0, Math.min(1, status.brightness)) * 100)
      default: return null
    }
  }
  const selection = signal.selection
  if (signal.kind === 'player') {
    const port = SONG_INFO_PORTS.find((entry) => entry.id === id)
    if (port) {
      const value = signal.song[port.field]
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : null
    }
  }
  switch (id) {
    case 'patternName': return selection?.names[selection.activeIndex] ?? null
    // Shown to a person, so it counts from one: a panel reading "3 of 12" is
    // the third pattern, not the fourth.
    case 'patternIndex': return selection ? selection.activeIndex + 1 : null
    case 'patternCount': return selection?.count ?? null
    case 'highlightName': return selection?.names[selection.highlightIndex] ?? null
    case 'browsing': return selection?.browsing ?? null
    default: return null
  }
}
