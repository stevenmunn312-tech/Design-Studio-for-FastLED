import { NODE_LIBRARY } from './nodeLibrary'
import type { NodePort } from '../types'

export interface PropertyInput extends NodePort {
  propertyKey: string
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

export function propertyInputsFor(nodeType: string): readonly PropertyInput[] {
  return INPUTS.get(nodeType) ?? EMPTY
}

/** Bound imported presentation data to declared property ports, in registry order. */
export function normalizeExposedInputs(nodeType: string, value: unknown): string[] {
  const candidates = new Set(Array.isArray(value) ? value : DEFAULTS.get(nodeType) ?? [])
  return propertyInputsFor(nodeType).filter((port) => candidates.has(port.id)).map((port) => port.id)
}

/** Edges always win over visibility preferences, including on a freshly loaded graph. */
export function exposedPropertyInputs(
  nodeType: string, value: unknown, connected: ReadonlySet<string>,
): readonly PropertyInput[] {
  const exposed = new Set(normalizeExposedInputs(nodeType, value))
  return propertyInputsFor(nodeType).filter((port) => exposed.has(port.id) || connected.has(port.id))
}
