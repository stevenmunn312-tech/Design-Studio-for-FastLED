import type { StudioNode, StudioEdge } from '../state/graphStore'
import { DISPLAY_SOURCE_NODE_TYPES, type DisplaySignalKind } from '../state/displays/displaySignal'
import { displaySourceFields } from '../state/displays/displaySourceFields'
import { asTransportDisplayLayout, shownDesignId, transportLayoutForKind } from '../state/displays/transportDisplay'
import { SONG_INFO_PORTS } from '../state/player/songInfo'
import type { BoardLinkWireKind } from './boardLinks'

/**
 * Which fields of a display wire a link sends.
 *
 * A display signal is an envelope, not a value: a Music Player's carries a
 * whole track report and the LEDs' picture. A link sends only the fields the
 * receiving board reads, decided here from each receiver — a fixed layout's
 * rows, a screen design's bound widgets, a Song Info node's wired outputs —
 * so a panel showing a title and a position costs two values on the wire. The
 * picture is never a field. See "What a link carries" in
 * docs/design/board-links.md.
 */

/** A clock is sent whole, as Unix seconds: every clock field is read off it. */
export const BOARD_LINK_CLOCK_FIELD = 'dateTime'

/** The kinds a linked display can carry. An LED output's status is not one: its name and size are the sender's compile-time facts. */
export const LINKED_DISPLAY_KINDS: readonly DisplaySignalKind[] = ['player', 'slideshow', 'clock', 'powerMonitor']

/** The fields each fixed layout draws, by layout name. */
const LAYOUT_FIELDS: Record<string, readonly string[]> = {
  'Now Playing': ['title', 'artist', 'patternName', 'elapsed', 'duration', 'progress', 'playing', 'volume'],
  'Fixed Transport': ['title', 'patternName', 'playing', 'volume'],
  'Show Status': ['patternName', 'patternIndex', 'patternCount'],
  'Power Monitor': ['volts', 'amps', 'watts'],
}

/** The OLED's Now Playing draws fewer rows than the colour panel's. */
const INFO_LAYOUT_FIELDS: Partial<Record<DisplaySignalKind, readonly string[]>> = {
  player: ['title', 'elapsed', 'duration', 'progress', 'playing', 'volume'],
  // A Pattern Browser pictures the collection from a thumbnail table only the
  // sending sketch has, so a linked slideshow draws the waiting screen there.
  slideshow: [],
  powerMonitor: ['volts', 'amps', 'watts'],
}

const SEGMENT_FIELDS: Partial<Record<DisplaySignalKind, readonly string[]>> = {
  player: ['elapsed'],
  slideshow: ['patternIndex'],
  powerMonitor: ['volts', 'amps', 'watts'],
}

/** The kind of display a node publishes on its `display` port, or null. */
export function displayKindOfSource(node: StudioNode | undefined): DisplaySignalKind | null {
  if (!node) return null
  return DISPLAY_SOURCE_NODE_TYPES[String((node.data as { nodeType?: string }).nodeType ?? '')] ?? null
}

/** How a display field is written: text, a level or a number. */
export function displayFieldWireKind(kind: DisplaySignalKind, id: string): BoardLinkWireKind | null {
  if (kind === 'clock') return id === BOARD_LINK_CLOCK_FIELD ? 'datetime' : null
  const field = displaySourceFields(kind).find((entry) => entry.id === id)
  if (!field) return null
  if (field.dataType === 'bool') return 'bool'
  if (field.dataType === 'float') return 'float'
  // The selection is read as the running pattern's name, as every generator
  // answers a Pattern Browser widget.
  return 'text'
}

/** The fields a screen design's bound widgets read. */
function boundFields(properties: Readonly<Record<string, unknown>>): string[] {
  const sources = properties.widgetSources
  if (!sources || typeof sources !== 'object') return []
  return Object.values(sources as Record<string, { field?: unknown }>)
    .map((entry) => String(entry?.field ?? ''))
    .filter(Boolean)
}

/**
 * What one receiver reads of a display wire. `members` is the receiving
 * board's partition, which decides which of a Song Info node's outputs are
 * wired onward there.
 */
export function receiverDisplayFields(
  receiver: StudioNode,
  handle: string,
  kind: DisplaySignalKind,
  edges: readonly StudioEdge[],
  members: ReadonlySet<string>,
): string[] {
  if (handle !== 'display' || !LINKED_DISPLAY_KINDS.includes(kind)) return []
  const type = String((receiver.data as { nodeType?: string }).nodeType ?? '')
  const p = (receiver.data.properties ?? {}) as Record<string, unknown>
  // Every clock layout and every clock field is read off the one time.
  const wanted = (fields: readonly string[]): string[] => (kind === 'clock'
    ? (fields.length > 0 ? [BOARD_LINK_CLOCK_FIELD] : [])
    : [...fields])
  if (type === 'SongInfo') {
    if (kind !== 'player') return []
    const ports = new Set<string>(SONG_INFO_PORTS.map((port) => port.id))
    return [...new Set(edges
      .filter((edge) => edge.source === receiver.id && members.has(edge.target ?? '') && ports.has(edge.sourceHandle ?? ''))
      .map((edge) => edge.sourceHandle ?? ''))]
  }
  if (type === 'InfoDisplay') return wanted(kind === 'clock' ? ['clock'] : INFO_LAYOUT_FIELDS[kind] ?? [])
  if (type === 'SegmentDisplay') return wanted(kind === 'clock' ? ['clock'] : SEGMENT_FIELDS[kind] ?? [])
  if (type === 'TransportDisplay') {
    if (shownDesignId(p)) return wanted(boundFields(p))
    if (asTransportDisplayLayout(p.tftLayout) === 'Diagnostics') return []
    if (kind === 'clock') return [BOARD_LINK_CLOCK_FIELD]
    const layout = transportLayoutForKind(kind, p.tftLayout)
    return layout ? [...(LAYOUT_FIELDS[layout] ?? [])] : []
  }
  return []
}

/**
 * The union of fields every receiver of one display slot reads, in the
 * catalogue's own order so the frame indexes do not depend on which panel was
 * wired first, each with how it is written.
 */
export function displaySlotFields(
  kind: DisplaySignalKind | null,
  wanted: Iterable<string>,
): { id: string; kind: BoardLinkWireKind }[] {
  if (!kind) return []
  const set = new Set(wanted)
  const order = kind === 'clock' ? [BOARD_LINK_CLOCK_FIELD] : displaySourceFields(kind).map((field) => field.id)
  const fields: { id: string; kind: BoardLinkWireKind }[] = []
  for (const id of order) {
    if (!set.has(id)) continue
    const wire = displayFieldWireKind(kind, id)
    if (wire) fields.push({ id, kind: wire })
  }
  return fields
}
