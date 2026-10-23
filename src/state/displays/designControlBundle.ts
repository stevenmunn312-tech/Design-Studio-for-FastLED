/*
 * What a screen design publishes on its Touch node's Controls output.
 *
 * A template places its controls knowing what each one is for — the Previous
 * button is a Previous button — and stamps that purpose on the widget as a
 * `controlRole`. This module turns those roles into fields of the one
 * `playercontrols` bundle, so a Now Playing screen drives a Music Player
 * through a single Controls wire, the same wire a fixed layout's touch
 * regions, a Player Controls node or a row of GPIO buttons would use.
 *
 * Read by the evaluator, the three generators and validation, so the preview,
 * the firmware and Graph Health cannot disagree about which widget presses
 * which field.
 *
 * Three rules.
 *
 * **Only stamped roles.** A hand-placed slider has no declared purpose, and
 * guessing one from its label is what `templateControlPlan` already refuses to
 * do. It publishes on its own port and nowhere else.
 *
 * **One job per widget.** A widget whose own output is wired somewhere already
 * has a job, and adding its press to the bundle too would fire the same action
 * twice — a Next button wired straight to Music Player's Next and also carried
 * by Controls would skip two tracks. The individual wire wins, because it is
 * the more specific statement.
 *
 * **The field follows the panel's source only where the finger means two
 * things.** Previous/Next step the track on a player's screen and the pattern
 * on a slideshow's, exactly as `templateControlPlan` maps them. Everything else
 * lands on its one field; a destination that has no use for a field ignores it,
 * which is the bundle's contract already (an LED output reads only the lamp).
 */

import { placedWidgets, type DisplayDocument, type DisplayWidget } from './displayDocument'
import type { StudioEdge, StudioNode } from '../graphStore'
import {
  displayWidgetIsRangedControl, displayWidgetPortId, normalizeDisplayControlRole, parseDisplayWidgetPortId,
} from './displayRegistry'
import { panelDisplaySourceKind } from './mountedDisplays'

/** The bundle field a role lands on. */
export type DesignBundleField =
  | 'playPause' | 'previous' | 'next'
  | 'patternPrevious' | 'patternNext'
  | 'ledToggle' | 'volume' | 'brightness'

/**
 * How a widget's value becomes that field.
 *
 * `press` is the rising edge of a momentary Button. `tap` is a finger flipping
 * a latching Toggle, in either direction — Play / Pause and Blackout are
 * *actions*, and a switch reporting its position would fire only every other
 * flick. It is counted from the touch itself, never from the Toggle's value:
 * a template binds Play's Set to the player's `playing`, so the value also
 * moves when the transport is driven from anywhere else, and reading it would
 * echo every such change back as a press. `level` is a ranged control's
 * absolute value (Slider, Dial or Step Control).
 */
export type DesignBundleEdge = 'press' | 'tap' | 'level'

export interface DesignBundleControl {
  widgetId: string
  /** The Touch node port the widget's value is sampled from. */
  portId: string
  field: DesignBundleField
  edge: DesignBundleEdge
}

const PRESS_WIDGETS: ReadonlySet<string> = new Set(['Button'])
const LATCH_WIDGETS: ReadonlySet<string> = new Set(['Toggle'])

/** Fields a finger commands, as opposed to a level it sets. */
const ACTION_FIELDS: ReadonlySet<DesignBundleField> = new Set([
  'playPause', 'previous', 'next', 'patternPrevious', 'patternNext', 'ledToggle',
])

function fieldFor(role: string, slideshow: boolean): DesignBundleField | null {
  switch (role) {
    case 'transportPrevious': return slideshow ? 'patternPrevious' : 'previous'
    case 'transportNext': return slideshow ? 'patternNext' : 'next'
    case 'transportPlayPause': return 'playPause'
    case 'transportVolume': return 'volume'
    case 'outputBrightness': return 'brightness'
    // Blackout is true-means-dark and the bundle's lamp is a toggle, so the
    // switch changing *is* the command, in either direction.
    case 'outputBlackout': return 'ledToggle'
    default: return null
  }
}

function edgeFor(widget: Pick<DisplayWidget, 'type'>, field: DesignBundleField): DesignBundleEdge | null {
  if (ACTION_FIELDS.has(field)) {
    if (PRESS_WIDGETS.has(widget.type)) return 'press'
    if (LATCH_WIDGETS.has(widget.type)) return 'tap'
    return null
  }
  return displayWidgetIsRangedControl(widget.type) ? 'level' : null
}

/** One widget that could feed the bundle: on the screen, with a stamped role. */
export interface DesignBundleCandidate {
  widgetId: string
  type: string
  role: unknown
}

/**
 * The bundle's rule over a list of candidate widgets, in screen order. Shared
 * by `designControlBundle`, which reads them from the document, and the board
 * link, which reads them from the Touch node's ports (`controlRole`,
 * `widgetType`) because a board's partition has no documents.
 *
 * `slideshow` is whether the panel shows a slideshow; `wired` says whether a
 * widget's own output is wired elsewhere, which takes it out of the bundle.
 */
export function designBundleControls(
  candidates: readonly DesignBundleCandidate[],
  slideshow: boolean,
  wired: (portId: string) => boolean,
): DesignBundleControl[] {
  const controls: DesignBundleControl[] = []
  const claimed = new Set<DesignBundleField>()
  for (const candidate of candidates) {
    const role = normalizeDisplayControlRole(candidate.role)
    if (!role) continue
    const field = fieldFor(role, slideshow)
    if (!field) continue
    const edge = edgeFor({ type: candidate.type } as Pick<DisplayWidget, 'type'>, field)
    if (!edge) continue
    const portId = displayWidgetPortId(candidate.widgetId, 'out')
    if (wired(portId)) continue
    // One widget per field. A level has one value per pass, so two sliders
    // on volume would leave whichever was read last; and the firmware keys a
    // field's edge state by the field, so a second press source would share it.
    if (claimed.has(field)) continue
    claimed.add(field)
    controls.push({ widgetId: candidate.widgetId, portId, field, edge })
  }
  return controls
}

/** Whether a Touch node's output `portId` is wired anywhere. */
function wiredFrom(touchNodeId: string | null | undefined, edges: readonly StudioEdge[]) {
  return (portId: string) => Boolean(touchNodeId)
    && edges.some((candidate) => candidate.source === touchNodeId && candidate.sourceHandle === portId)
}

/**
 * The controls a panel's design publishes on its Touch node's Controls output.
 *
 * `touchNodeId` is the Touch node reading this panel, used only to tell which
 * widget outputs are already wired elsewhere; without one nothing is excluded.
 */
export function designControlBundle(
  panel: StudioNode,
  document: DisplayDocument,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  touchNodeId?: string | null,
): DesignBundleControl[] {
  const slideshow = panelDisplaySourceKind(panel, nodes, edges) === 'slideshow'
  // Placed widgets only: a control in the Connected group is on no screen, so
  // no finger can reach it and the firmware emits no object for it.
  const candidates = placedWidgets(document)
    .map((widget) => ({ widgetId: widget.id, type: widget.type, role: widget.properties?.controlRole }))
  return designBundleControls(candidates, slideshow, wiredFrom(touchNodeId, edges))
}

/**
 * The same controls read off a Touch node's own ports, for a graph with no
 * documents to hand (a board partition). Each carried port says its widget's
 * role and type; the rest of the rule is the same.
 */
export function touchNodeBundleControls(
  touch: StudioNode,
  panel: StudioNode,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): DesignBundleControl[] {
  const slideshow = panelDisplaySourceKind(panel, nodes, edges) === 'slideshow'
  const candidates: DesignBundleCandidate[] = []
  for (const port of (touch.data.outputs ?? []) as readonly { id: string; controlRole?: string; widgetType?: string }[]) {
    const parsed = parseDisplayWidgetPortId(port.id)
    if (!parsed || parsed.role !== 'out' || !port.controlRole || !port.widgetType) continue
    candidates.push({ widgetId: parsed.widgetId, type: port.widgetType, role: port.controlRole })
  }
  return designBundleControls(candidates, slideshow, wiredFrom(touch.id, edges))
}

/**
 * The screen Toggle behind a wire, when a wire's source is one.
 *
 * A Toggle's output follows its Set input once released, and a template binds
 * Play's Set to the player's `playing`. So anything that reads a *press* from
 * that output — a Music Player action, a Player Controls node row, an LED output's
 * blackout toggle — must count the finger's taps instead of watching the value,
 * or every transport change echoes back as a command: pressing Play in the app
 * starts the track, the toggle follows, and the rising edge pauses it again.
 * Each edge-reading consumer asks this and, for a Toggle, reads its tap count.
 */
export function toggleWidgetSource(
  source: StudioNode | undefined,
  sourcePort: string,
  nodeById: ReadonlyMap<string, StudioNode>,
  documents: Readonly<Record<string, DisplayDocument | undefined>>,
): { documentId: string; panelId: string; widgetId: string } | null {
  if (source?.data.nodeType !== 'TouchInput') return null
  const parsed = parseDisplayWidgetPortId(sourcePort)
  if (parsed?.role !== 'out') return null
  const panel = nodeById.get(String(source.data.properties?.panelId ?? ''))
  const documentId = String(panel?.data.properties?.displayId ?? '')
  const widget = documentId ? documents[documentId]?.widgets.find((entry) => entry.id === parsed.widgetId) : undefined
  if (!panel || !widget || !LATCH_WIDGETS.has(widget.type)) return null
  return { documentId, panelId: panel.id, widgetId: widget.id }
}
