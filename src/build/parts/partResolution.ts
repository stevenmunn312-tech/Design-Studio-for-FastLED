// What a saved node refers to, and whether this version can build it.
//
// A part-backed node keeps its module in one property: `partId`, or `model` for
// an Amplifier (`PART_OPTIONS` names which). Three cases, kept apart on purpose:
//
//   missing   no value, or an empty one. A node nobody has chosen a module for
//             (a fresh one, a hand-written fixture). The type's default part is
//             right, and nothing is reported.
//   known     the value is one of the type's options (by id or alias).
//   unknown   a non-empty value this version has no part for: a project saved
//             by a newer version, or a part pack that is not installed. This is
//             never the default part. Reading it as one generated an ultrasonic
//             pulse sensor for a laser one and dropped a relay board's extra
//             channels on load.
//
// A node can also be unbuildable for a reason that is not its part: it wires a
// pin or an I2C bus to another part (`partReferences.ts`), which this version
// cannot resolve. Both reasons are one thing to a caller: this node is held.
//
// A held node is kept exactly as saved: properties, ports and wires survive a
// load, a save and a reload untouched. What changes is what reads it:
//
//   validation   `unresolvedNodeIssues` is a blocking error that names the node
//                and the id (Graph Health, the deploy gate, `validateGraph`).
//   Upload       blocked through that gate and `uploadBlockReason`.
//   code         `withoutUnresolved` takes the node, and the wires on it, out of
//                the graph every generator walks. No spec is ever substituted,
//                so no code comes from a guess.
//   drawing      renders, footprints and labels may still fall back to a generic
//                stand-in (`resolvePartIdentity` marks it `unresolved`). That is
//                cosmetic: nothing is built from it.
//
// Per-kind spec readers (`distanceSensorSpec`, `powerMonitorSpec`, the
// `FALLBACK_SPEC` family) keep their own defaults for a missing id and for
// drawing. They are not the place a build is gated, because they receive an
// id and not a node; this module is, and every kind goes through it.

import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { findPartReferences, type ReferenceFinding } from './partReferences'
import { partOptionFor, partOptionProperty } from './partOptions'

/** The saved value naming a part, or null when the node has none or the type has no part. */
export function savedPartId(nodeType: string, properties: Record<string, unknown> | undefined): string | null {
  const property = partOptionProperty(nodeType)
  if (!property || !properties) return null
  const value = properties[property]
  if (value === undefined || value === null) return null
  const id = String(value)
  return id.trim() === '' ? null : id
}

/**
 * The saved id when it names a part this version does not have, else null.
 * Null for a missing id (the default part applies) and for a known one.
 */
export function unknownPartId(nodeType: string, properties: Record<string, unknown> | undefined): string | null {
  const id = savedPartId(nodeType, properties)
  if (id === null) return null
  return partOptionFor(nodeType, id) ? null : id
}

/** Convenience for the callers that only branch: is this node's part unknown? */
export function hasUnknownPart(nodeType: string, properties: Record<string, unknown> | undefined): boolean {
  return unknownPartId(nodeType, properties) !== null
}

/** Why a node is held. */
export type UnresolvedReason =
  | { kind: 'part'; property: string; id: string }
  | ReferenceFinding

export interface UnresolvedNode {
  node: StudioNode
  reasons: UnresolvedReason[]
}

function propertiesOf(node: StudioNode): Record<string, unknown> {
  return (node.data.properties ?? {}) as Record<string, unknown>
}

/** Every reason this one node cannot be built by this version; empty when it can. */
export function unresolvedReasons(nodeType: string, properties: Record<string, unknown> | undefined): UnresolvedReason[] {
  const reasons: UnresolvedReason[] = []
  const property = partOptionProperty(nodeType)
  const id = unknownPartId(nodeType, properties)
  if (property && id !== null) reasons.push({ kind: 'part', property, id })
  reasons.push(...findPartReferences(properties))
  return reasons
}

/** The nodes of a graph this version cannot build, with why, in graph order. */
export function unresolvedNodes(nodes: readonly StudioNode[]): UnresolvedNode[] {
  const held: UnresolvedNode[] = []
  for (const node of nodes) {
    const reasons = unresolvedReasons(node.data.nodeType, propertiesOf(node))
    if (reasons.length > 0) held.push({ node, reasons })
  }
  return held
}

/**
 * The graph without its held nodes, or the very same arrays when nothing is held
 * (the common case, so callers can compare by identity and pay nothing).
 * Wires on a held node go with it for this read only; the stored graph is not
 * touched.
 */
export function withoutUnresolved<N extends StudioNode, E extends StudioEdge>(
  nodes: readonly N[], edges: readonly E[],
): { nodes: N[]; edges: E[]; held: UnresolvedNode[] } {
  const held = unresolvedNodes(nodes)
  if (held.length === 0) return { nodes: nodes as N[], edges: edges as E[], held }
  const heldIds = new Set(held.map((entry) => entry.node.id))
  return {
    nodes: nodes.filter((node) => !heldIds.has(node.id)),
    edges: edges.filter((edge) => !heldIds.has(edge.source) && !heldIds.has(edge.target)),
    held,
  }
}

/** One plain sentence per reason, for the first line of a card or a gate message. */
export function describeUnresolved(reason: UnresolvedReason): { title: string; detail: string; fix: string } {
  if (reason.kind === 'part') {
    return {
      title: "This project uses a part this version doesn't have",
      detail: `"${reason.id}"`,
      fix: 'Choose a part this version lists on the node, or open the project in a newer Design Studio. Its settings and wires are kept as they are either way.',
    }
  }
  if (reason.kind === 'pin') {
    return {
      title: "This node uses a pin on another part, which this version can't wire yet",
      detail: `${reason.key} is on ${reason.ref.part}, pin ${reason.ref.pin}`,
      fix: 'Open the project in a newer Design Studio, or delete this part and add it again to wire it to the board’s own pins. Its settings and wires are kept as they are until you do.',
    }
  }
  return {
    title: "This node uses an I2C bus on another part, which this version can't wire yet",
    detail: reason.key,
    fix: 'Open the project in a newer Design Studio, or delete this part and add it again to put it on the board’s own I2C bus. Its settings and wires are kept as they are until you do.',
  }
}

/** A node's name for a message: its label, else its type. */
export function unresolvedNodeLabel(node: StudioNode): string {
  return String(node.data.label ?? node.data.nodeType)
}

/** The same reason as one sentence about a named node, for the deploy gate. */
export function unresolvedMessage(node: StudioNode, reason: UnresolvedReason): string {
  const { title, detail, fix } = describeUnresolved(reason)
  return `${title}: ${unresolvedNodeLabel(node)} — ${detail}. ${fix}`
}

/** One sentence per held node (its first reason), for the Upload tab's reason line. */
export function unresolvedPartSummaries(nodes: readonly StudioNode[]): string[] {
  return unresolvedNodes(nodes).map(({ node, reasons }) => {
    const { title, detail } = describeUnresolved(reasons[0])
    return `${title}: ${detail} (${unresolvedNodeLabel(node)}).`
  })
}

/**
 * Comment lines to lead a sketch generated without its held nodes, so View Code
 * and Export .ino say what is missing instead of looking complete. Upload never
 * runs on such a sketch; the gate refuses first.
 */
export function unresolvedSketchNotice(held: readonly UnresolvedNode[]): string {
  // A saved id is user text: keep it on this one comment line. No line break
  // (or Unicode separator) can end the comment, and no backslash can splice it
  // onto the next line.
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const oneLine = (text: string) => text.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/[\\\u0000-\u001f\u007f]/g, '?')
  return held.flatMap((entry) => entry.reasons.map((reason) =>
    `// Not generated: ${oneLine(unresolvedMessage(entry.node, reason))}\n`)).join('')
}
