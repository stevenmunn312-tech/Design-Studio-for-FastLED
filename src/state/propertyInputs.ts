import { isPropertyEnabled, NODE_LIBRARY } from './nodeLibrary'
import { partDerivedInputs } from '../build/parts/partPorts'
import type { NodePort } from '../types'

export interface PropertyInput extends NodePort {
  propertyKey: string
}

export interface ExposableInput extends NodePort {
  kind: 'property' | 'action'
  propertyKey?: string
  /**
   * The red, green and blue properties a colour port reads while unwired, when
   * no single property backs it. See `colorChannels`.
   */
  channels?: readonly [string, string, string]
}

// Opt in only after both preview and firmware read the property through this
// port. A matching name alone does not establish that a field is controllable.
const INPUTS = new Map(NODE_LIBRARY.map((definition) => [
  definition.type,
  Object.entries(definition.propertyInputs ?? {}).flatMap(([propertyKey, portId]) => {
    const port = [...definition.inputs, ...(definition.variantInputs ?? [])]
      .find((input) => input.id === portId)
    return port ? [{ ...port, propertyKey }] : []
  }),
]))
const DEFAULTS = new Map(NODE_LIBRARY.map((definition) => [
  definition.type, definition.defaultExposedInputs ?? [],
]))
const EMPTY: PropertyInput[] = []
const EMPTY_EXPOSABLE: ExposableInput[] = []

const EXPOSABLES = new Map(NODE_LIBRARY.map((definition) => {
  const byId = new Map(definition.inputs.map((input) => [input.id, input]))
  const propertyInputs = (INPUTS.get(definition.type) ?? []).map((input): ExposableInput => ({
    ...input,
    kind: 'property',
  }))
  const propertyIds = new Set(propertyInputs.map((input) => input.id))
  const actionInputs = (definition.actionInputs ?? []).flatMap((id): ExposableInput[] => {
    if (propertyIds.has(id)) return []
    const port = byId.get(id)
    return port ? [{ ...port, kind: 'action' }] : []
  })
  return [definition.type, [...propertyInputs, ...actionInputs]]
}))

/*
 * Every input a control could drive, including the ones the node always draws.
 *
 * `EXPOSABLES` answers a narrower question — which sockets the inspector may
 * *draw on demand* — and a port the node draws unconditionally has nothing to
 * expose, so it is deliberately absent from that list. A touch control does
 * not care whether a socket is hidden: what it needs is a property behind the
 * port to set. Reading the narrower list once refused a control on every
 * always-visible property port, on the stated grounds that they were "not
 * controllable properties", which is the opposite of true and reads as a
 * broken gesture rather than a rule. Every number and switch port with a
 * property of its own name is declared now (`propertyInputs.test.ts` holds
 * that), so what still reaches this list implicitly is the colour and
 * palette ports a node draws as its substance.
 *
 * A port qualifies here on the same evidence `propertyInputs` requires, only
 * derived rather than declared: the node's `defaultProperties` carries a key
 * of that name, which is exactly what makes the evaluator's and the
 * generator's wire-then-property reads (`num(id, 'x', props, 'x', …)` /
 * `f('x', 'x', …)`) resolve to it. Keep the two lists separate: widening
 * `EXPOSABLES` instead would hand every one of these ports a property row as
 * well as the port row it already has, which is the duplicate-socket trap the
 * registry's three derived readers exist to avoid.
 */
/**
 * The three channel properties behind a colour port, or null.
 *
 * Most colour inputs hold no colour property of their own: a Solid Colour
 * keeps `r`, `g` and `b` and its `color` port overrides all three while wired,
 * a Blend or Gradient keeps `rA`…`bB` behind `a`/`colorA` and `b`/`colorB`.
 * That is the same wire-then-property read a single property gets, only
 * spread over three fields, so the port is just as controllable. Derived from
 * the names rather than declared, on the same evidence the implicit ports
 * below use: all three channels must be numbers in `defaultProperties`, or the
 * port is not reached this way.
 */
function colorChannels(
  portId: string,
  defaults: Readonly<Record<string, unknown>>,
): [string, string, string] | null {
  const suffix = portId === 'color' || portId === 'rgb'
    ? ''
    : /^(?:colou?r)?([ab])$/i.exec(portId)?.[1]?.toUpperCase()
  if (suffix === undefined) return null
  const channels: [string, string, string] = [`r${suffix}`, `g${suffix}`, `b${suffix}`]
  return channels.every((key) => typeof defaults[key] === 'number') ? channels : null
}

const CONTROLLABLES = new Map(NODE_LIBRARY.map((definition) => {
  const exposable = EXPOSABLES.get(definition.type) ?? []
  const declared = new Set(exposable.map((port) => port.id))
  const defaults = definition.defaultProperties ?? {}
  const implicit = definition.inputs.flatMap((port): ExposableInput[] => {
    if (declared.has(port.id)) return []
    if (port.id in defaults) return [{ ...port, kind: 'property', propertyKey: port.id }]
    const channels = port.dataType === 'color' ? colorChannels(port.id, defaults) : null
    return channels ? [{ ...port, kind: 'property', channels }] : []
  })
  return [definition.type, [...exposable, ...implicit]]
}))

/**
 * The inputs a wired touch control may be created on, hidden socket or not.
 * Use this for "can a control drive it"; use `exposableInputsFor` only for
 * "may the inspector draw this socket on demand".
 */
export function controllableInputsFor(nodeType: string): readonly ExposableInput[] {
  return CONTROLLABLES.get(nodeType) ?? EMPTY_EXPOSABLE
}

export function propertyInputsFor(nodeType: string): readonly PropertyInput[] {
  return INPUTS.get(nodeType) ?? EMPTY
}

/**
 * Is this wire landing on a property its own node is currently ignoring?
 *
 * A node may disable a property from its other properties — a Formula Field
 * knob belongs to one `formulaType` and is dead under the others — and a wire
 * into it is then real but doing nothing. Worth saying rather than refusing:
 * the edge is still correct and a dropdown away from being live again, and
 * nothing downstream needs to change, since the evaluator and the generator
 * each read only the variant they are building.
 */
export function wiredPropertyIsInert(
  nodeType: string,
  targetHandle: string | null | undefined,
  properties: Record<string, unknown>,
): boolean {
  if (!targetHandle) return false
  const input = propertyInputsFor(nodeType).find((port) => port.id === targetHandle)
  return input ? !isPropertyEnabled(nodeType, input.propertyKey, properties) : false
}

export function exposableInputsFor(nodeType: string): readonly ExposableInput[] {
  return EXPOSABLES.get(nodeType) ?? EMPTY_EXPOSABLE
}

/**
 * The same inputs, named as this node draws them. A port a part option adds
 * is registered under a numbered label (Level 2); the selected board may
 * print a letter instead (the Mosfetti's Level B), and a socket or menu entry
 * should say what the node's own port says. Returns `inputs` itself for a
 * node whose ports do not follow its part, so callers can memoise on it.
 */
export function labelledForPart<T extends NodePort>(nodeType: string, partId: unknown, inputs: readonly T[]): readonly T[] {
  const drawn = partDerivedInputs(nodeType, partId)
  if (!drawn) return inputs
  return inputs.map((input) => ({ ...input, label: drawn.find((port) => port.id === input.id)?.label ?? input.label }))
}

/** Bound imported presentation data to declared property ports, in registry order. */
export function normalizeExposedInputs(nodeType: string, value: unknown): string[] {
  const candidates = new Set(Array.isArray(value) ? value : DEFAULTS.get(nodeType) ?? [])
  return exposableInputsFor(nodeType).filter((port) => candidates.has(port.id)).map((port) => port.id)
}

/** Edges always win over visibility preferences, including on a freshly loaded graph. */
export function exposedNodeInputs(
  nodeType: string, value: unknown, connected: ReadonlySet<string>,
): readonly ExposableInput[] {
  const exposed = new Set(normalizeExposedInputs(nodeType, value))
  return exposableInputsFor(nodeType).filter((port) => exposed.has(port.id) || connected.has(port.id))
}

export function exposedPropertyInputs(
  nodeType: string, value: unknown, connected: ReadonlySet<string>,
): readonly PropertyInput[] {
  return exposedNodeInputs(nodeType, value, connected)
    .filter((port): port is PropertyInput & ExposableInput => port.kind === 'property' && !!port.propertyKey)
}
