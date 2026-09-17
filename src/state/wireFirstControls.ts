import { isPropertyEnabled, nodeDisplayLabel, propertyLabel, propertyMeta } from './nodeLibrary'
import { exposableInputsFor } from './propertyInputs'
import type { DisplayWidget, DisplayWidgetProperty, DisplayWidgetType } from './displayDocument'
import { defaultDisplayWidgetProperties, parseDisplayWidgetPortId } from './displayRegistry'
import type { StudioEdge, StudioNode } from './graphStore'

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
