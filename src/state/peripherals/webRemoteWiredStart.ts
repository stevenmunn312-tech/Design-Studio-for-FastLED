/**
 * Where a Web Remote control wired to a property starts: at that property's
 * value on the node it drives, quantised to the control.
 *
 * The control's own `initial` is a copy taken when the wire is drawn, so a
 * wire drawn before that copy existed, or a property changed afterwards,
 * would leave the firmware, the phone page and a board link starting
 * somewhere else; on the D-13 bench a remote wired to a Brightness at 0.68
 * started at 0 and a board that restarted came up dark. Builds resolve the
 * start here instead, from the root graph, because a board that only sends
 * never holds the node it drives.
 */

import type { StudioEdge, StudioNode } from '../graphStore'
import { libraryDefaults } from '../nodeLibrary'
import { controllableInputsFor } from '../propertyInputs'
import {
  normalizeWebRemoteControls,
  parseWebRemotePortId,
  patchWebRemoteControl,
  webRemoteControlKind,
  webRemoteQuantize,
  WEB_REMOTE_NODE_TYPE,
  type WebRemoteControl,
} from './webRemote'

/**
 * The start a range or choice control takes from the property `target`'s
 * `targetHandle` sets: the stored value, else the node's default. Undefined
 * for any other control, or a wire into something that is not a property.
 */
export function webRemoteWiredStart(
  control: WebRemoteControl,
  target: StudioNode | undefined,
  targetHandle: string | null | undefined,
): number | undefined {
  const kind = webRemoteControlKind(control.type)
  if (!target || (kind !== 'range' && kind !== 'choice')) return undefined
  const nodeType = String(target.data.nodeType)
  const propertyKey = controllableInputsFor(nodeType).find((port) => port.id === targetHandle)?.propertyKey
  if (!propertyKey) return undefined
  const value = (target.data.properties as Record<string, unknown>)[propertyKey] ?? libraryDefaults(nodeType)[propertyKey]
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const start = webRemoteQuantize(control, value)
  return typeof start === 'number' ? start : undefined
}

/**
 * `nodes` with every Web Remote control wired straight to a property
 * starting where that property is (the first such wire, in edge order).
 * Returns `nodes` itself when nothing changes.
 */
export function withWiredWebRemoteStarts(nodes: readonly StudioNode[], edges: readonly StudioEdge[]): readonly StudioNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  const starts = new Map<string, Map<string, number>>()
  for (const edge of edges) {
    const remote = byId.get(edge.source ?? '')
    if (remote?.data.nodeType !== WEB_REMOTE_NODE_TYPE) continue
    const controlId = parseWebRemotePortId(edge.sourceHandle)
    const control = controlId ? normalizeWebRemoteControls(remote.data.properties?.controls).find((entry) => entry.id === controlId) : undefined
    if (!control || seen.has(`${remote.id}:${control.id}`)) continue
    const start = webRemoteWiredStart(control, byId.get(edge.target ?? ''), edge.targetHandle)
    if (start === undefined) continue
    seen.add(`${remote.id}:${control.id}`)
    if (start === control.properties.initial) continue
    if (!starts.has(remote.id)) starts.set(remote.id, new Map())
    starts.get(remote.id)!.set(control.id, start)
  }
  if (starts.size === 0) return nodes
  return nodes.map((node) => {
    const own = starts.get(node.id)
    if (!own) return node
    const properties = node.data.properties as Record<string, unknown>
    let controls: unknown = properties.controls
    for (const [controlId, initial] of own) controls = patchWebRemoteControl(controls, controlId, { properties: { initial } })
    return { ...node, data: { ...node.data, properties: { ...properties, controls } } }
  })
}
