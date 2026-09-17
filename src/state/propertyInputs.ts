import { isPropertyEnabled, NODE_LIBRARY } from './nodeLibrary'
import type { NodePort } from '../types'

export interface PropertyInput extends NodePort {
  propertyKey: string
}

export interface ExposableInput extends NodePort {
  kind: 'property' | 'action'
  propertyKey?: string
}

// Opt in only after both preview and firmware read the property through this
// port. A matching name alone does not establish that a field is controllable.
const INPUTS = new Map(NODE_LIBRARY.map((definition) => [
  definition.type,
  Object.entries(definition.propertyInputs ?? {}).flatMap(([propertyKey, portId]) => {
    const port = definition.inputs.find((input) => input.id === portId)
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
 * port to set. Reading the narrower list refused a control on every
 * always-visible property port — Field → Frame's Brightness, Field Noise's
 * Speed, Master Speed's own Speed, sixty-odd more — on the stated grounds
 * that they were "not controllable properties", which is the opposite of true
 * and reads as a broken gesture rather than a rule.
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
const CONTROLLABLES = new Map(NODE_LIBRARY.map((definition) => {
  const exposable = EXPOSABLES.get(definition.type) ?? []
  const declared = new Set(exposable.map((port) => port.id))
  const defaults = definition.defaultProperties ?? {}
  const implicit = definition.inputs.flatMap((port): ExposableInput[] => (
    declared.has(port.id) || !(port.id in defaults)
      ? []
      : [{ ...port, kind: 'property', propertyKey: port.id }]
  ))
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
