/*
 * Where a template's controls should be wired, and why some of them are not.
 *
 * A template arrives as a screen full of widgets whose *purpose* is known — a
 * button labelled Next is a Next button, that is what the template is for —
 * but whose destination is a fact about the graph rather than about the
 * template. This module answers the second half: given a panel, the source
 * wired into it, and the graph around it, which of those controls have one
 * unambiguous destination, and what it would take to reach it.
 *
 * Three rules shape the whole thing.
 *
 * **The role is stamped, not read off the label.** `applyDisplayTemplate`
 * writes `controlRole` onto the widget it places, the same way it writes
 * `source`. Resolving from the label instead would mean a user renaming
 * "Next" to "Skip" silently broke the wire — and renaming a widget must
 * preserve its connections, which is the whole reason widget ports are keyed
 * by id.
 *
 * **The destination comes from the wire, not from proximity.** A control
 * targets the node feeding this panel's Display input. Nothing is inferred
 * from what happens to be nearby on the canvas, and nothing is guessed when
 * the panel has no source: an unwired template is left alone with a hint
 * rather than attached to whichever node looked plausible.
 *
 * **A conversion is a node, not a silent reinterpretation.** A Blackout toggle
 * says "true means dark" and an LED output's Enabled says "true means lit".
 * Wiring them together would invert every press. The plan says `invert` and
 * the applier places a `Not` — visible on the canvas, removed by one undo, and
 * the same shape as the Map Range a Graph Health repair inserts. Silently
 * flipping the value inside the evaluator would make one boolean mean two
 * things depending on which port it landed on. A Toggle driving Play / Pause
 * needs no adapter: every press-reading input counts a screen Toggle's taps
 * rather than watching its value (`toggleWidgetSource`), because that value
 * also follows the player's `playing` and a Changed trigger on it echoed every
 * transport change back as a press.
 *
 * **One wire where the destination takes one.** Music Player, Pattern
 * Slideshow and an LED output all have a Controls input, and the design's
 * role-stamped widgets already travel on the Touch node's Controls bundle
 * (`designControlBundle`). So when that input is free the plan asks for the
 * single Touch Controls wire instead of a cable per control, and `wires`
 * remain as the record of what each control reaches.
 *
 * Nothing here mutates. It is read by the applier, by the "Connect template
 * controls" action, and by tests, which is what keeps the second and third
 * from drifting from the first.
 *
 * Named for the plan it produces, deliberately not "routing": `codegen/
 * templateControlRouting.ts` is a different thing entirely — how a *generator*
 * resolves the controls a template sketch already has — and the two sat under
 * one name long enough to be worth separating. This one decides what *should*
 * be wired on the canvas; that one emits what already is.
 */

import type { DisplayDocument, DisplayWidget } from './displayDocument'
import type { StudioEdge, StudioNode } from './graphStore'
import { NODE_LIBRARY } from './nodeLibrary'

/** A node's declared inputs, from the library rather than the instance. */
const LIBRARY_INPUTS = (node: StudioNode) =>
  NODE_LIBRARY.find((definition) => definition.type === node.data.nodeType)?.inputs ?? []
import { DISPLAY_SOURCE_NODE_TYPES, type DisplaySignalKind } from './displaySignal'
import {
  displayWidgetPortId, normalizeDisplayControlRole, type TemplateControlRole,
} from './displayRegistry'

export type { TemplateControlRole }

/**
 * The role each template widget carries, keyed by the template's own label.
 *
 * Keyed by label here and only here — at placement time, where the label is
 * still the template's. `applyDisplayTemplate` copies the result onto the
 * widget, and every later reader takes it from there.
 *
 * Previous/Next are transport roles even on the Pattern Deck: what the finger
 * did is "go back one", and which collection that steps is the graph's answer,
 * not the template's.
 */
export const TEMPLATE_CONTROL_ROLES: Readonly<Record<string, TemplateControlRole>> = {
  Previous: 'transportPrevious',
  Play: 'transportPlayPause',
  Next: 'transportNext',
  Volume: 'transportVolume',
  Confirm: 'patternConfirm',
  Brightness: 'outputBrightness',
  Blackout: 'outputBlackout',
}

/** The role a placed widget carries, if any. */
export function widgetControlRole(widget: Pick<DisplayWidget, 'properties'>): TemplateControlRole | null {
  return normalizeDisplayControlRole(widget.properties?.controlRole)
}

/**
 * How a control's value has to be changed on the way to its destination.
 *
 * `none` is one edge. `invert` is a `Not`, for a control whose true means the
 * opposite of its destination's true. Anything a conversion cannot fix is not
 * an adapter — it is a refusal, and appears in `unrouted` instead.
 */
export type TemplateControlAdapter = 'none' | 'invert'

export interface TemplateControlWire {
  widgetId: string
  role: TemplateControlRole
  /** The Touch node port this control publishes on. */
  sourcePort: string
  /** The node this control commands. */
  targetId: string
  /** The input on it. A property input is exposed as part of applying this. */
  targetPort: string
  adapter: TemplateControlAdapter
}

export interface TemplateControlRefusal {
  widgetId: string
  role: TemplateControlRole
  /** Shown to the user beside the control. Says what is missing, not "failed". */
  reason: string
}

export interface TemplateControlPlan {
  /** Connections that can be made, each unambiguous and supported. */
  wires: TemplateControlWire[]
  /**
   * Set when every wire above lands on a node with a free Controls input: the
   * one Touch Controls → Controls wire that carries them all, drawn instead of
   * the individual cables.
   */
  controlsWire?: { sourceId: string; targetId: string }
  /** Controls deliberately left alone, each with a reason worth reading. */
  unrouted: TemplateControlRefusal[]
}

/** The destination kinds each role can command, and the port it lands on. */
interface RoleTarget {
  /** The input port id on the destination node. */
  port: string
  adapter?: TemplateControlAdapter
}

/**
 * What each role means to each kind of source.
 *
 * A role with no entry for a kind is not an error — it is a control that
 * source has no equivalent for, which is the ordinary case for a Brightness
 * slider on a panel showing a clock.
 *
 * `transportPrevious`/`transportNext` land on a player's track transport and
 * on a slideshow's pattern steps, which is the one place the same finger
 * gesture means two different ports. Both are momentary bool actions the
 * destination already declares, so neither needs teaching.
 */
const ROLE_TARGETS: Readonly<Record<TemplateControlRole, Partial<Record<DisplaySignalKind, RoleTarget>>>> = {
  transportPrevious: { player: { port: 'previous' }, slideshow: { port: 'patternPrevious' } },
  transportNext: { player: { port: 'next' }, slideshow: { port: 'patternNext' } },
  transportPlayPause: { player: { port: 'playPause' } },
  patternConfirm: { player: { port: 'patternConfirm' }, slideshow: { port: 'patternConfirm' } },
  // A fixture's own two level controls. `enabled` is true-means-lit and the
  // Blackout toggle is true-means-dark, so it arrives through a Not.
  outputBrightness: { ledOutput: { port: 'brightness' } },
  outputBlackout: { ledOutput: { port: 'enabled', adapter: 'invert' } },
  transportVolume: { player: { port: 'volume' } },
}

/**
 * Widget types a finger operates, which are the only ones with an output.
 *
 * Asked as a set rather than read off `portRoles` because a role is only
 * stamped on these in the first place; a Text or a Progress carrying one would
 * be a template authoring mistake, and returning null here reports it as an
 * ignored widget rather than minting a port that does not exist.
 */
const CONTROL_WIDGETS: ReadonlySet<string> = new Set(['Button', 'Toggle', 'Slider', 'Dial'])

/**
 * Plan the connections for one panel's screen design.
 *
 * `document` is the design drawn on `panel`; `nodes`/`edges` are the graph it
 * sits in. Only controls carrying a stamped role are considered, so a
 * hand-placed slider is never auto-wired to anything — it has no declared
 * purpose, and guessing one from its label is exactly what this module exists
 * not to do.
 */
export function templateControlPlan(
  panel: StudioNode,
  document: DisplayDocument,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): TemplateControlPlan {
  const wires: TemplateControlWire[] = []
  const unrouted: TemplateControlRefusal[] = []

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const sourceEdge = edges.find((edge) => edge.target === panel.id && edge.targetHandle === 'display')
  const sourceNode = sourceEdge ? byId.get(sourceEdge.source) : undefined
  const sourceKind: DisplaySignalKind | undefined = sourceNode
    ? DISPLAY_SOURCE_NODE_TYPES[String(sourceNode.data.nodeType ?? '')]
    : undefined

  // The Touch node is where a screen's controls leave. Without one there is no
  // port to wire from at all, which is a different problem from having no
  // destination and reads differently to the user.
  const touchNode = nodes.find((node) => node.data.nodeType === 'TouchInput'
    && String(node.data.properties?.panelId ?? '') === panel.id)

  // A wired Touch Controls already carries every role-stamped control, so the
  // controls have a job. Reaching this panel's source, a rerun has nothing to
  // add; reaching anything else, cables to the new source would quietly move
  // controls the user pointed somewhere, so it says so instead.
  const controlsEdge = touchNode
    ? edges.find((edge) => edge.source === touchNode.id && edge.sourceHandle === 'controls')
    : undefined
  if (controlsEdge) {
    if (!sourceNode || controlsEdge.target === sourceNode.id) return { wires, unrouted }
    const holder = byId.get(controlsEdge.target)
    for (const widget of document.widgets) {
      const role = widgetControlRole(widget)
      if (!role || !CONTROL_WIDGETS.has(widget.type)) continue
      unrouted.push({
        widgetId: widget.id, role,
        reason: `This screen's controls already travel on its Touch node's Controls to ${holder ? sourceLabel(holder) : 'another node'}. `
          + 'Move that wire if they should command this source instead.',
      })
    }
    return { wires, unrouted }
  }

  for (const widget of document.widgets) {
    const role = widgetControlRole(widget)
    if (!role) continue
    if (!CONTROL_WIDGETS.has(widget.type)) continue

    if (!touchNode) {
      unrouted.push({
        widgetId: widget.id, role,
        reason: 'This panel has no Touch node, so its controls have nowhere to publish from.',
      })
      continue
    }

    if (!sourceNode || !sourceKind) {
      unrouted.push({
        widgetId: widget.id, role,
        reason: "Nothing is wired to this panel's Display input, so there is no destination to connect to yet.",
      })
      continue
    }

    const target = ROLE_TARGETS[role][sourceKind]
    if (!target) {
      unrouted.push({
        widgetId: widget.id, role,
        reason: role === 'transportVolume'
          ? `Volume has no direct input on ${sourceLabel(sourceNode)}. Wire it through Control Map, which carries it.`
          : `${sourceLabel(sourceNode)} has nothing this control commands.`,
      })
      continue
    }

    // Every control widget publishes on the one `out` role.
    const sourcePort = displayWidgetPortId(widget.id, 'out')

    /*
     * A control that already has a job keeps it.
     *
     * One press is one event — the rule `sharedControlSourceIssues` enforces
     * for a Control Map — and it is what stops a panel rewired from a player
     * to a slideshow ending up with its Next button driving both. Checked on
     * the control's own output rather than on the destination, because the
     * destination is exactly the thing that just changed.
     */
    if (edges.some((edge) => edge.source === touchNode.id && edge.sourceHandle === sourcePort)) continue
    // Never overwrite an occupied input, and never wire the same control
    // twice: repeated use has to be idempotent, and a manual rewire has to
    // survive. Both are the same check — something is already there.
    const occupied = edges.find((edge) => edge.target === sourceNode.id && edge.targetHandle === target.port)
    if (occupied) {
      const existing = occupied.source === touchNode.id && occupied.sourceHandle === sourcePort
      if (!existing) {
        unrouted.push({
          widgetId: widget.id, role,
          reason: `${sourceLabel(sourceNode)} already has something wired to ${target.port}. `
            + 'Disconnect it first if this control should take over.',
        })
      }
      continue
    }

    wires.push({
      widgetId: widget.id,
      role,
      sourcePort,
      targetId: sourceNode.id,
      targetPort: target.port,
      adapter: target.adapter ?? 'none',
    })
  }

  const takesControls = !!sourceNode && LIBRARY_INPUTS(sourceNode).some((port) => port.id === 'controls')
  const controlsFree = !!sourceNode && !edges.some((edge) => edge.target === sourceNode.id && edge.targetHandle === 'controls')
  const touchControlsFree = !!touchNode && !edges.some((edge) => edge.source === touchNode.id && edge.sourceHandle === 'controls')
  if (wires.length > 0 && touchNode && sourceNode && takesControls && controlsFree && touchControlsFree) {
    return { wires, unrouted, controlsWire: { sourceId: touchNode.id, targetId: sourceNode.id } }
  }
  return { wires, unrouted }
}

function sourceLabel(node: StudioNode): string {
  return String(node.data.label ?? node.data.nodeType ?? 'The source')
}
