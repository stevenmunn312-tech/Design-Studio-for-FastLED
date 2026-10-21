import { isPropertyEnabled, nodeDisplayLabel, propertyLabel, propertyMeta } from '../nodeLibrary'
import { controllableInputsFor, wiredPropertyIsInert, type ExposableInput } from '../propertyInputs'
import type {
  DisplayDocument,
  DisplayWidget,
  DisplayWidgetProperty,
  DisplayWidgetType,
} from '../displays/displayDocument'
import {
  defaultDisplayWidgetProperties,
  displayColorHue,
  displayPickerSeed,
  displayWidgetDefinition,
  displayWidgetIsControl,
  displayWidgetIsRangedControl,
  isDisplayRgb,
  parseDisplayWidgetPortId,
  type DisplayRgb,
  type DisplayWidgetPortRoleId,
} from '../displays/displayRegistry'
import { hexToRgb, isHexColor } from '../palettes/customPalette'
import { placeDisplayWidget } from '../displays/displayEditor'
import type { StudioEdge, StudioNode } from '../graphStore'
import { useDisplayRuntimeStore } from '../displays/displayRuntimeStore'
import { displayRuntimeId } from '../displays/mountedDisplays'

/**
 * What a touch control should be, read off the property it will drive.
 *
 * The property is the only thing that knows all five facts a control needs —
 * its type, range, step, label and default — so a control created by dropping
 * a wire on it arrives fully specified rather than needing the range repair
 * afterwards. See docs/design/wire-first-touch-controls.md.
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
  // takes a value, an action input takes a press. Controllable, not merely
  // exposable — a port the node always draws is still backed by a property,
  // and refusing those was refusing most of the ports worth a control.
  const input = controllableInputsFor(nodeType).find((port) => port.id === portId)
  if (!input) {
    return {
      ok: false,
      refusal: {
        code: 'not-a-property-input',
        message: 'That input takes a signal from another node, not a value of its own, so there is nothing for a control to set.',
      },
    }
  }

  const label = inputLabel(nodeType, input)

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
  // A colour held in three channels is switched on and off as one; its red
  // channel answers for all three.
  const backing = input.propertyKey ?? input.channels?.[0]
  if (backing && !isPropertyEnabled(nodeType, backing, properties)) {
    return {
      ok: false,
      refusal: {
        code: 'disabled',
        message: `${label} is switched off by this node's other settings, so a control would do nothing.`,
      },
    }
  }

  const spec = specFor(input, nodeType, label, properties)
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
 * Shared with the widget-first path: `withAdoptedDisplayControl` in
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

/**
 * The colour a colour input holds while nothing is wired to it: its own
 * `#rrggbb` property, or the three channel properties behind it. Null when it
 * holds neither, which leaves a Colour Picker at its own defaults.
 */
export function controllableInputColor(
  input: Pick<ExposableInput, 'propertyKey' | 'channels'>,
  properties: Readonly<Record<string, unknown>>,
): DisplayRgb | null {
  if (input.propertyKey) {
    const value = properties[input.propertyKey]
    return isHexColor(value) ? hexToRgb(value) : null
  }
  if (!input.channels) return null
  const [r, g, b] = input.channels.map((key) => properties[key])
  if (![r, g, b].every((channel) => typeof channel === 'number' && Number.isFinite(channel))) return null
  const byte = (channel: unknown) => Math.max(0, Math.min(255, Math.round(channel as number)))
  return { r: byte(r), g: byte(g), b: byte(b) }
}

/**
 * What a new control takes from the input it is wired to: the input's label,
 * and the range a ranged control moves in or the colour a Colour Picker starts
 * at. Null when the input has nothing to hand this kind of control.
 *
 * One derivation for the three moments a control meets its target — created by
 * a wire (`specFor`), an existing unconfigured control wired to it
 * (`withAdoptedDisplayControl` in `graphStore.ts`), and placement
 * (`placeTouchControlIn`) — so none can start a control differently. A picker
 * starts at the colour the target already has, as a slider starts at its
 * value, so wiring one does not turn the LEDs red.
 */
export function adoptedControlProperties(
  widgetType: DisplayWidgetType,
  nodeType: string,
  input: Pick<ExposableInput, 'label' | 'dataType' | 'propertyKey' | 'channels'>,
  properties: Readonly<Record<string, unknown>>,
): { label: string; properties: Record<string, DisplayWidgetProperty> } | null {
  if (widgetType === 'Colour Picker') {
    if (input.dataType !== 'color') return null
    const color = controllableInputColor(input, properties)
    return { label: inputLabel(nodeType, input), properties: color ? { ...displayPickerSeed(color) } : {} }
  }
  if (!displayWidgetIsRangedControl(widgetType) || input.dataType !== 'float' || !input.propertyKey) return null
  const adopted = adoptedControlRange(nodeType, input.propertyKey, input.label)
  return adopted
    ? { label: adopted.label, properties: { min: adopted.min, max: adopted.max, step: adopted.step } }
    : null
}

function inputLabel(nodeType: string, input: Pick<ExposableInput, 'label' | 'propertyKey'>): string {
  return input.propertyKey ? readableLabel(nodeType, input.propertyKey, input.label) : input.label
}

function readableLabel(nodeType: string, propertyKey: string, portLabel: string): string {
  const label = propertyLabel(nodeType, propertyKey)
  // `propertyLabel` returns the key itself when nothing nicer is declared, and
  // the port's own label is the better of the two in that case. A declared
  // row label is lower case ("dot size"); a widget sits beside port-named
  // ones ("Speed"), so it takes their case.
  return label === propertyKey ? portLabel : titleCase(label)
}

/** "peak hold (s)" → "Peak Hold (s)": words keep their own capitals and units their parentheses. */
function titleCase(label: string): string {
  return label.replace(/(^|\s)([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
}

function specFor(
  input: ExposableInput,
  nodeType: string,
  label: string,
  properties: Readonly<Record<string, unknown>>,
): TouchControlSpec | null {
  // An action is a press, not a value it can hold — a momentary Button, never
  // a latch. A Toggle here would keep saying "pressed" after the finger left.
  if (input.kind === 'action') {
    return { type: 'Button', label, properties: defaultDisplayWidgetProperties('Button') }
  }
  if (input.dataType === 'bool') {
    return { type: 'Toggle', label, properties: defaultDisplayWidgetProperties('Toggle') }
  }
  // A colour wants a Colour Picker, starting at the colour already there.
  if (input.dataType === 'color') {
    const adopted = adoptedControlProperties('Colour Picker', nodeType, input, properties)
    return {
      type: 'Colour Picker',
      label,
      properties: { ...defaultDisplayWidgetProperties('Colour Picker'), ...adopted?.properties },
    }
  }
  if (input.dataType !== 'float') return null

  // A number with no declared range is still controllable, but the control has
  // to guess at it; 0–1 is what an undeclared slider means everywhere else.
  const adopted = adoptedControlProperties('Slider', nodeType, input, properties)
  const range = adopted?.properties ?? { min: 0, max: 1, step: 0.01 }
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
 * The screen widget a graph source is, when that source is a Touch output.
 *
 * A property driven by one of these is still adjustable in the graph: the
 * slider is a remote for the widget, not a second control fighting it. A pot
 * or an audio band has no such remote, so those rows stay read-only.
 *
 * `displayId` is the runtime key that glass publishes under. One panel
 * showing the design keeps the document id. Two panels showing it each
 * publish under their own panel id, so the remote moves only that glass.
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
  const documentId = panel ? String(panel.data.properties.displayId ?? '') : ''
  if (!documentId || !panel) return null
  return { displayId: displayRuntimeId(panel.id, documentId, nodes), widgetId: parsed.widgetId }
}

/**
 * Set a widget the way the editor's Run surface does for a completed drag.
 *
 * A colour — `#rrggbb` from a colour property's row, or `{ r, g, b }` from a
 * channel swatch — is a Colour Picker's hue, its state; the picker keeps its
 * own saturation and brightness. Anything else that is not a number or a
 * boolean has no control state to stand for, and is ignored.
 */
export function writeTouchControlValue(
  displayId: string,
  widgetId: string,
  value: unknown,
): void {
  const state = typeof value === 'number' || typeof value === 'boolean' ? value
    : isHexColor(value) ? displayColorHue(hexToRgb(value))
      : isDisplayRgb(value) ? displayColorHue(value)
        : null
  if (state === null) return
  const store = useDisplayRuntimeStore.getState()
  store.touchDisplayWidget(displayId, widgetId, state)
  store.releaseDisplayWidget(displayId, widgetId)
}

/**
 * The single edge each widget's `out` port drives, for one screen design.
 *
 * One walk rather than one per widget: the panel and its Touch node are found
 * once, and the map is keyed on the widget id that `parseDisplayWidgetPortId`
 * reads back out of the port. A widget driving two things is deliberately left
 * out — "what does this control?" has no single answer then, and the Connected
 * group would have to invent one.
 *
 * With no panel id, a design named by two panels also has no single answer:
 * each glass may wire the same widget differently. Pass the panel id when the
 * caller already knows which glass it is emitting, and that glass's wires
 * come back on their own.
 */
export function displayControlEdges(
  displayId: string,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  panelId?: string,
): Map<string, StudioEdge> {
  const naming = nodes.filter((node) => (
    node.data.nodeType === 'TransportDisplay'
    && String(node.data.properties.displayId ?? '') === displayId
  ))
  const panels = panelId ? naming.filter((node) => node.id === panelId) : naming
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

/** One wire on one of a widget's ports, as the designer's inspector lists it. */
export interface DisplayWidgetWire {
  edge: StudioEdge
  /** `in` reads a value onto the screen; `out` sends a touch into the graph. */
  direction: 'in' | 'out'
  role: DisplayWidgetPortRoleId
  /** The other end, in the words the canvas uses for it. */
  otherEnd: string
}

/**
 * Every wire on a widget's ports, in both directions.
 *
 * A widget's readings arrive on its panel (`value`, `set`) and its touches
 * leave from the panel's Touch node (`out`), so asking only one of them would
 * report a wired Toggle as half connected. Unlike `displayControlEdges`, a
 * port wired twice lists both wires: this is an inventory, not a caption that
 * needs one answer. A design named by several panels lists every glass, and
 * the panel's name leads `otherEnd` so the two wires stay tellable apart.
 */
export function displayWidgetWires(
  displayId: string,
  widgetId: string,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): DisplayWidgetWire[] {
  const panels = nodes.filter((node) => (
    node.data.nodeType === 'TransportDisplay'
    && String(node.data.properties.displayId ?? '') === displayId
  ))
  if (panels.length === 0) return []
  const shared = panels.length > 1
  const labelOf = (id: string) => {
    const node = nodes.find((entry) => entry.id === id)
    return node ? nodeDisplayLabel(node.data.nodeType, node.data.properties, node.data.label) : 'a missing node'
  }

  const wires: DisplayWidgetWire[] = []
  for (const panel of panels) {
    const panelId = panel.id
    const panelName = nodeDisplayLabel(panel.data.nodeType, panel.data.properties, panel.data.label)
    const touchIds = new Set(nodes
      .filter((node) => (
        node.data.nodeType === 'TouchInput'
        && String(node.data.properties.panelId ?? '') === panelId
      ))
      .map((node) => node.id))
    for (const edge of edges) {
      if (edge.target === panelId) {
        const port = parseDisplayWidgetPortId(edge.targetHandle ?? '')
        if (port?.widgetId === widgetId) {
          const end = labelOf(edge.source)
          wires.push({
            edge, direction: 'in', role: port.role,
            otherEnd: shared ? `${panelName} · ${end}` : end,
          })
        }
      } else if (touchIds.has(edge.source)) {
        const port = parseDisplayWidgetPortId(edge.sourceHandle ?? '')
        if (port?.widgetId === widgetId) {
          const end = controlDestinationLabel(edge, nodes) ?? labelOf(edge.target)
          wires.push({
            edge, direction: 'out', role: port.role,
            otherEnd: shared ? `${panelName} · ${end}` : end,
          })
        }
      }
    }
  }
  return wires
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
  const input = controllableInputsFor(nodeType).find((port) => port.id === edge.targetHandle)
  const node = nodeDisplayLabel(nodeType, target.data.properties, target.data.label)
  if (!input) return { node, property: null }
  return { node, property: inputLabel(nodeType, input) }
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
 * broken. See docs/design/wire-first-touch-controls.md.
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
 * The screen design a Touch node draws on, or `''` when it has none.
 *
 * A Touch node names its panel with an internal `panelId` link and the panel
 * names its design with `displayId`, so every question about "which screen is
 * this control on" is that same two-hop walk. It is asked from three places
 * now — the inert lookup below, the wiring action, and the canvas deciding
 * whether the glass in front of the author is this node's — so it is one
 * function rather than three copies that could disagree about what a missing
 * panel means.
 */
export function touchControlDisplayId(
  touchNode: StudioNode | undefined,
  nodes: readonly StudioNode[],
): string {
  if (!touchNode || touchNode.data.nodeType !== 'TouchInput') return ''
  const panelId = String((touchNode.data.properties as Record<string, unknown>).panelId ?? '')
  const panel = nodes.find((node) => (
    node.id === panelId && node.data.nodeType === 'TransportDisplay'
  ))
  return panel ? String(panel.data.properties.displayId ?? '') : ''
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
  const displayId = touchControlDisplayId(touch, state.nodes)
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
  // A Colour Picker nobody has tuned: no starting hue, and the default tone.
  if (widget.type === 'Colour Picker') {
    return widget.label === displayWidgetDefinition(widget.type).label
      && widget.properties.initial === undefined
      && widget.properties.saturation === defaults.saturation
      && widget.properties.brightness === defaults.brightness
  }
  return displayWidgetIsRangedControl(widget.type)
    && widget.label === displayWidgetDefinition(widget.type).label
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
  /** The screen of the design it goes on; the first when omitted. */
  screenId?: string,
): DisplayDocument {
  const placed = placeDisplayWidget(document, widgetId, screenId)
  if (placed === document) return document
  const widget = placed.widgets.find((entry) => entry.id === widgetId)
  if (!widget || !displayControlIsUnconfigured(widget)) return placed

  const edge = displayControlEdges(displayId, nodes, edges).get(widgetId)
  const target = edge ? nodes.find((node) => node.id === edge.target) : undefined
  if (!edge || !target) return placed
  const input = controllableInputsFor(target.data.nodeType).find((port) => port.id === edge.targetHandle)
  if (!input) return placed
  const adopted = adoptedControlProperties(
    widget.type, target.data.nodeType, input, target.data.properties as Record<string, unknown>)
  if (!adopted) return placed

  return {
    ...placed,
    widgets: placed.widgets.map((entry) => entry.id === widgetId ? {
      ...entry,
      label: adopted.label,
      properties: { ...entry.properties, ...adopted.properties },
    } : entry),
  }
}
