import { isPropertyEnabled, nodeDisplayLabel, propertyLabel, propertyMeta } from './nodeLibrary'
import { exposableInputsFor, wiredPropertyIsInert } from './propertyInputs'
import type {
  DisplayDocument,
  DisplayWidget,
  DisplayWidgetProperty,
  DisplayWidgetType,
} from './displayDocument'
import {
  defaultDisplayWidgetProperties,
  displayWidgetDefinition,
  displayWidgetIsControl,
  parseDisplayWidgetPortId,
} from './displayRegistry'
import { placeDisplayWidget } from './displayEditor'
import type { StudioEdge, StudioNode } from './graphStore'
import { useDisplayRuntimeStore } from './displayRuntimeStore'

/**
 * What a touch control should be, read off the property it will drive.
 *
 * The property is the only thing that knows all five facts a control needs —
 * its type, range, step, label and default — so a control created by dropping
 * a wire on it arrives fully specified rather than needing the range repair
 * afterwards. See docs/development/design/wire-first-touch-controls.md.
 *
 * Deriving the widget *type* rather than asking is deliberate: a bounded
 * number wants a Slider, a boolean wants a Toggle, and a momentary action
 * wants a Button. Dial is the one genuine alternative to a Slider and is
 * offered as a swap afterwards rather than as a question first.
 */

export interface TouchControlSpec {
  type: DisplayWidgetType
  label: string
  /** Widget properties the target's own range and step decide. */
  properties: Record<string, DisplayWidgetProperty>
}

/** Why a property cannot take a wired touch control. */
export type TouchControlRefusal =
  | { code: 'not-a-property-input'; message: string }
  | { code: 'unsupported-type'; message: string }
  | { code: 'already-driven'; message: string }
  | { code: 'disabled'; message: string }

export type TouchControlPlan =
  | { ok: true; spec: TouchControlSpec }
  | { ok: false; refusal: TouchControlRefusal }

/**
 * The widget a property input asks for, or the reason it cannot have one.
 *
 * `driven` is whether something is already wired to this port. A second
 * control on one value has no honest precedence — whichever is sampled last
 * wins, which is a frame-ordering accident — so the second wire is refused
 * with a reason, the stance `templateControlPlan` already takes.
 */
export function touchControlPlan(
  nodeType: string,
  portId: string,
  properties: Record<string, unknown>,
  driven = false,
): TouchControlPlan {
  // Both kinds, because both are things a finger can drive: a property input
  // takes a value, an action input takes a press.
  const input = exposableInputsFor(nodeType).find((port) => port.id === portId)
  if (!input) {
    return {
      ok: false,
      refusal: {
        code: 'not-a-property-input',
        message: 'That input is not a controllable property, so there is nothing for a control to set.',
      },
    }
  }

  const label = input.propertyKey
    ? readableLabel(nodeType, input.propertyKey, input.label)
    : input.label

  if (driven) {
    return {
      ok: false,
      refusal: {
        code: 'already-driven',
        message: `${label} already has a control. Unplug it first — two controls on one value have no order to fall back on.`,
      },
    }
  }

  // Refused rather than merely dimmed: a control that does nothing the moment
  // it is made is a worse thing to hand someone than a sentence. A wire that
  // goes inert *later*, because the variant changed, is the dim case instead.
  if (input.propertyKey && !isPropertyEnabled(nodeType, input.propertyKey, properties)) {
    return {
      ok: false,
      refusal: {
        code: 'disabled',
        message: `${label} is switched off by this node's other settings, so a control would do nothing.`,
      },
    }
  }

  const spec = specFor(input.kind, input.dataType, nodeType, input.propertyKey, label)
  if (!spec) {
    return {
      ok: false,
      refusal: {
        code: 'unsupported-type',
        message: `A touch control cannot drive ${label}: no widget produces a ${input.dataType}.`,
      },
    }
  }
  return { ok: true, spec }
}

/**
 * The label and range a property hands a control it drives.
 *
 * Shared with the widget-first path: `withAdoptedDisplayControlRange` in
 * `graphStore.ts` applies exactly this when an existing, unconfigured Slider
 * is wired to a property, and the wire-first path applies it at creation. One
 * derivation, two moments — see the design note.
 */
export function adoptedControlRange(
  nodeType: string,
  propertyKey: string,
  portLabel: string,
): { label: string; min: number; max: number; step: number } | null {
  const meta = propertyMeta(nodeType, propertyKey)
  if (meta?.control !== 'slider') return null
  return {
    label: readableLabel(nodeType, propertyKey, portLabel),
    min: meta.min,
    max: meta.max,
    step: meta.step,
  }
}

function readableLabel(nodeType: string, propertyKey: string, portLabel: string): string {
  const label = propertyLabel(nodeType, propertyKey)
  // `propertyLabel` returns the key itself when nothing nicer is declared, and
  // the port's own label is the better of the two in that case.
  return label === propertyKey ? portLabel : label
}

function specFor(
  kind: 'property' | 'action',
  dataType: string,
  nodeType: string,
  propertyKey: string | undefined,
  label: string,
): TouchControlSpec | null {
  // An action is a press, not a value it can hold — a momentary Button, never
  // a latch. A Toggle here would keep saying "pressed" after the finger left.
  if (kind === 'action') {
    return { type: 'Button', label, properties: defaultDisplayWidgetProperties('Button') }
  }
  if (dataType === 'bool') {
    return { type: 'Toggle', label, properties: defaultDisplayWidgetProperties('Toggle') }
  }
  if (dataType !== 'float') return null

  // A number with no declared range is still controllable, but the control has
  // to guess at it; 0–1 is what an undeclared slider means everywhere else.
  const adopted = propertyKey ? adoptedControlRange(nodeType, propertyKey, label) : null
  const range = adopted
    ? { min: adopted.min, max: adopted.max, step: adopted.step }
    : { min: 0, max: 1, step: 0.01 }
  return {
    type: 'Slider',
    label,
    properties: { ...defaultDisplayWidgetProperties('Slider'), ...range },
  }
}

/**
 * The widget itself, ready to go into a document — with no bounds, because
 * nobody has said where it goes yet. It is connected, not placed.
 */
export function touchControlWidget(id: string, spec: TouchControlSpec): DisplayWidget {
  return { id, type: spec.type, label: spec.label, properties: { ...spec.properties } }
}

/**
 * The single edge each widget's `out` port drives, for one screen design.
 *
 * One walk rather than one per widget: the panel and its Touch node are found
 * once, and the map is keyed on the widget id that `parseDisplayWidgetPortId`
 * reads back out of the port. A widget driving two things is deliberately left
 * out — "what does this control?" has no single answer then, and the Connected
 * group would have to invent one.
 */
/**
 * The screen widget a graph source is, when that source is a Touch output.
 *
 * A property driven by one of these is still adjustable in the graph: the
 * slider is a remote for the widget, not a second control fighting it. A pot
 * or an audio band has no such remote, so those rows stay read-only.
 */
export function touchControlDriver(
  source: { srcId: string; srcPort: string } | undefined,
  nodes: readonly StudioNode[],
): { displayId: string; widgetId: string } | null {
  if (!source) return null
  const parsed = parseDisplayWidgetPortId(source.srcPort)
  if (parsed?.role !== 'out') return null
  const touch = nodes.find((node) => node.id === source.srcId)
  if (touch?.data.nodeType !== 'TouchInput') return null
  const panelId = String((touch.data.properties as Record<string, unknown>).panelId ?? '')
  const panel = nodes.find((node) => node.id === panelId && node.data.nodeType === 'TransportDisplay')
  const displayId = panel ? String(panel.data.properties.displayId ?? '') : ''
  return displayId ? { displayId, widgetId: parsed.widgetId } : null
}

/** Set a widget the way the editor's Run surface does for a completed drag. */
export function writeTouchControlValue(
  displayId: string,
  widgetId: string,
  value: number | boolean,
): void {
  const store = useDisplayRuntimeStore.getState()
  store.touchDisplayWidget(displayId, widgetId, value)
  store.releaseDisplayWidget(displayId, widgetId)
}

export function displayControlEdges(
  displayId: string,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): Map<string, StudioEdge> {
  const panels = nodes.filter((node) => (
    node.data.nodeType === 'TransportDisplay'
    && String(node.data.properties.displayId ?? '') === displayId
  ))
  if (panels.length !== 1) return new Map()
  const touchIds = new Set(nodes
    .filter((node) => (
      node.data.nodeType === 'TouchInput'
      && String(node.data.properties.panelId ?? '') === panels[0].id
    ))
    .map((node) => node.id))
  if (touchIds.size !== 1) return new Map()

  const found = new Map<string, StudioEdge>()
  const ambiguous = new Set<string>()
  for (const edge of edges) {
    if (!touchIds.has(edge.source)) continue
    const port = parseDisplayWidgetPortId(edge.sourceHandle ?? '')
    if (port?.role !== 'out') continue
    if (found.has(port.widgetId)) ambiguous.add(port.widgetId)
    found.set(port.widgetId, edge)
  }
  for (const widgetId of ambiguous) found.delete(widgetId)
  return found
}

/**
 * What a control drives: the node and the property, kept apart.
 *
 * Apart because a caption in a narrow panel often has room for only one of
 * them, and which one is worth keeping depends on what is beside it — a
 * wire-first control is already named after its property, so repeating it
 * there would spend the whole line saying the same word twice.
 *
 * The node is read through `nodeDisplayLabel` rather than off `node.data.label`,
 * because nothing persists a node label — a load overwrites it with the
 * library default, so an LED String would name itself "LED Matrix" here.
 */
export interface ControlDestination {
  node: string
  property: string | null
}

export function controlDestination(
  edge: StudioEdge,
  nodes: readonly StudioNode[],
): ControlDestination | null {
  const target = nodes.find((node) => node.id === edge.target)
  if (!target || !edge.targetHandle) return null
  const nodeType = target.data.nodeType
  const input = exposableInputsFor(nodeType).find((port) => port.id === edge.targetHandle)
  const node = nodeDisplayLabel(nodeType, target.data.properties, target.data.label)
  if (!input) return { node, property: null }
  return {
    node,
    property: input.propertyKey
      ? readableLabel(nodeType, input.propertyKey, input.label)
      : input.label,
  }
}

/** Both halves, for somewhere with room for both: "Formula Field · Petals". */
export function controlDestinationLabel(
  edge: StudioEdge,
  nodes: readonly StudioNode[],
): string | null {
  const destination = controlDestination(edge, nodes)
  if (!destination) return null
  return destination.property ? `${destination.node} · ${destination.property}` : destination.node
}

/**
 * Why a touch control is doing nothing, or `null` if it is live.
 *
 * One predicate for all three causes rather than three that drift, because
 * they are read in two places that must agree — the wire on the graph canvas
 * and the widget in the designer — and because they are genuinely the same
 * statement: this control exists and nothing is reaching the pixels or the
 * firmware through it.
 *
 *   `unplaced`        — connected, but not on a screen, so no finger can reach it
 *   `unconnected`     — on a screen, but nothing is wired to what it sets
 *   `target-disabled` — wired, but the target ignores that property right now
 *
 * Which causes can be seen depends on where you are looking, and that falls
 * out rather than needing a rule: a widget nobody placed has no pixels to dim
 * but does have a wire, and a widget nobody wired has no wire to dim but does
 * have pixels.
 *
 * Asked only of the four widget types with an `out` port
 * (`displayWidgetIsControl`). A Label or a bound readout has no connection to
 * be missing, and reporting one as inert would call most of a finished screen
 * broken. See docs/development/design/wire-first-touch-controls.md.
 */
export type DisplayControlInertReason = 'unplaced' | 'unconnected' | 'target-disabled'

export function displayControlInertReason(
  widget: DisplayWidget,
  edge: Pick<StudioEdge, 'target' | 'targetHandle'> | undefined,
  nodes: readonly StudioNode[],
): DisplayControlInertReason | null {
  if (!displayWidgetIsControl(widget.type)) return null
  if (!edge) return widget.bounds === undefined ? 'unplaced' : 'unconnected'
  // Unplaced is reported ahead of a disabled target: both are true, and the
  // one the author can act on from the screen they are looking at is the one
  // worth saying.
  if (widget.bounds === undefined) return 'unplaced'
  const target = nodes.find((node) => node.id === edge.target)
  if (!target) return 'unconnected'
  return wiredPropertyIsInert(
    target.data.nodeType,
    edge.targetHandle,
    target.data.properties as Record<string, unknown>,
  ) ? 'target-disabled' : null
}

/** The reason as a sentence, for a tooltip or an announcement. */
export function displayControlInertMessage(reason: DisplayControlInertReason): string {
  if (reason === 'unplaced') return 'Wired, but not yet placed on the screen, so no finger can reach it.'
  if (reason === 'unconnected') return 'On the screen, but nothing is wired to what it would set.'
  return 'Wired, but the node it drives is ignoring that property under its current settings.'
}

/**
 * The same question asked of a wire on the graph canvas, where the widget has
 * to be found from the port the wire leaves.
 *
 * `null` means "not a control wire" — not "live" — so the caller falls back to
 * the ordinary target-side rule every property wire is judged by. Almost every
 * edge exits on the first line, which is what keeps this cheap enough to ask
 * once per edge per render.
 */
export function touchControlWireInert(
  state: {
    nodes: readonly StudioNode[]
    displayDocuments: Readonly<Record<string, DisplayDocument>>
  },
  source: string,
  sourceHandle: string | null | undefined,
  target: string,
  targetHandle: string | null | undefined,
): boolean | null {
  const port = parseDisplayWidgetPortId(sourceHandle ?? '')
  if (port?.role !== 'out') return null
  const touch = state.nodes.find((node) => node.id === source)
  if (!touch || touch.data.nodeType !== 'TouchInput') return null
  const panelId = String((touch.data.properties as Record<string, unknown>).panelId ?? '')
  const panel = state.nodes.find((node) => (
    node.id === panelId && node.data.nodeType === 'TransportDisplay'
  ))
  const displayId = panel ? String(panel.data.properties.displayId ?? '') : ''
  const widget = displayId
    ? state.displayDocuments[displayId]?.widgets.find((entry) => entry.id === port.widgetId)
    : undefined
  if (!widget) return null
  return displayControlInertReason(widget, { target, targetHandle }, state.nodes) !== null
}

/**
 * Whether a control still carries everything its widget type shipped with.
 *
 * The gate on adopting a target's range, at both moments it can happen: when
 * an existing control is wired to a property, and when a connected one is
 * placed on a screen. A control whose label or range has been edited has a
 * contract of its own — a deliberately coarse 0–10 slider on a 0–255 property
 * is a decision, not a mistake — so adoption declines rather than reverting
 * it, and the explicit "Match target range" repair stays the way to change
 * one's mind.
 */
export function displayControlIsUnconfigured(widget: DisplayWidget): boolean {
  const defaults = defaultDisplayWidgetProperties(widget.type)
  return widget.label === displayWidgetDefinition(widget.type).label
    && widget.properties.source === undefined
    && widget.properties.min === defaults.min
    && widget.properties.max === defaults.max
    && widget.properties.step === defaults.step
}

/**
 * Put a connected control on its screen, taking its target's range with it.
 *
 * Placement is the second moment the range can flow, and it is a real one: a
 * control drawn from the palette, wired, then deleted from the screen waits in
 * the Connected group as an unconfigured widget with a live wire, and the
 * property it drives may have changed in between. One derivation
 * (`adoptedControlRange`), two moments — rather than a second copy for this
 * path. A control that has been edited keeps what it was given.
 */
export function placeTouchControlIn(
  document: DisplayDocument,
  displayId: string,
  widgetId: string,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): DisplayDocument {
  const placed = placeDisplayWidget(document, widgetId)
  if (placed === document) return document
  const widget = placed.widgets.find((entry) => entry.id === widgetId)
  if (!widget || !displayControlIsUnconfigured(widget)) return placed

  const edge = displayControlEdges(displayId, nodes, edges).get(widgetId)
  const target = edge ? nodes.find((node) => node.id === edge.target) : undefined
  if (!edge || !target) return placed
  const input = exposableInputsFor(target.data.nodeType).find((port) => port.id === edge.targetHandle)
  if (!input?.propertyKey) return placed
  const adopted = adoptedControlRange(target.data.nodeType, input.propertyKey, input.label)
  if (!adopted) return placed

  return {
    ...placed,
    widgets: placed.widgets.map((entry) => entry.id === widgetId ? {
      ...entry,
      label: adopted.label,
      properties: { ...entry.properties, min: adopted.min, max: adopted.max, step: adopted.step },
    } : entry),
  }
}
