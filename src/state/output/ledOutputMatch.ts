// "Match LED output": the one rule String Particles and Network Ripple use to
// take their line or network from the LED output instead of a hand-copied
// copy of it. The preview evaluator and the firmware emitter both ask here, so
// they read the same output and agree by construction.
//
// A node saves `ledSource`: `match` (read the output live) or `custom` (use the
// node's own fields). A node saved before the choice existed has no key and
// keeps reading its own fields, so an old pattern looks as it did; a node made
// now starts on `match` through its library default.
//
// Which output: the first LED output on the node's board partition whose form
// fits. A project with one board has one partition, the whole graph. Where no
// output fits, or none is reachable (a standalone pattern, a library
// thumbnail, a group open on its own), the node falls back to its own fields
// and says so (the hint on the result).

import type { StudioEdge, StudioNode } from '../graphStore'
import { boardIdOf, boardMembership, boardNodesIn, primaryBoardId } from '../../build/boardPartition'
import { outputForm } from './ledOutputForm'
import { ledSource } from './ledSource'
import { stringLedCount, usesNetwork } from './stringPositions'

export { LED_SOURCES, ledSource, type LedSource } from './ledSource'

type Props = Record<string, unknown>

const propsOf = (node: StudioNode): Props => (node.data as { properties?: Props }).properties ?? {}

/**
 * The LED outputs a node can match, in graph order: those on the node's board
 * partition. With one board that is every output. A node on several boards'
 * partitions (a pattern two boards show) matches its first board's outputs, and
 * a node this graph does not hold (inside a group, whose root is `nodes`) the
 * primary board's.
 */
export function boardLedOutputs(nodeId: string, nodes: readonly StudioNode[], edges: readonly StudioEdge[]): Props[] {
  const outputs = nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  if (outputs.length === 0 || boardNodesIn(nodes).length <= 1) return outputs.map(propsOf)
  const primary = primaryBoardId(nodes)
  const boardIds = new Set(boardNodesIn(nodes).map((board) => board.id))
  const homes = boardMembership(nodes, edges).get(nodeId)
  const home = homes && homes.size > 0
    ? boardNodesIn(nodes).map((board) => board.id).find((id) => homes.has(id)) ?? primary
    : primary
  return outputs.filter((node) => boardIdOf(node, primary, boardIds) === home).map(propsOf)
}

/** What a node resolved to, and why it did not match when it did not. */
export interface MatchResult<T> {
  value: T
  /** True when the value comes from an LED output. */
  matched: boolean
  /** Set for a `match` node that fell back to its own fields. */
  hint: string | null
}

export const NO_NETWORK_OUTPUT_HINT = 'No LED output with a Network layout here, so this uses its own network.'
export const NO_TRACK_OUTPUT_HINT = 'No ring or strip LED output here, so this uses its own track.'

/** The network fields a Ripple node reads: the output's when it matches, else its own. */
export function resolveRippleNetwork(props: Props, outputs: readonly Props[]): MatchResult<Props> {
  if (ledSource(props.ledSource) !== 'match') return { value: props, matched: false, hint: null }
  const output = outputs.find(usesNetwork)
  if (!output) return { value: props, matched: false, hint: NO_NETWORK_OUTPUT_HINT }
  return {
    value: { ...props, networkPreset: output.networkPreset, network: output.network, ledsPerEdge: output.ledsPerEdge },
    matched: true,
    hint: null,
  }
}

/**
 * The track fields a String Particles node reads. A ring output gives the ring
 * track and its LED count; a strip output (any layout, it is one row) gives the
 * row. A matrix, a corkscrew and a HUB75 panel are not a line.
 */
export function resolveParticleTrack(props: Props, outputs: readonly Props[]): MatchResult<Props> {
  if (ledSource(props.ledSource) !== 'match') return { value: props, matched: false, hint: null }
  const output = outputs.find((candidate) => {
    const form = outputForm(candidate)
    return form === 'ring' || form === 'strip'
  })
  if (!output) return { value: props, matched: false, hint: NO_TRACK_OUTPUT_HINT }
  if (outputForm(output) === 'ring') {
    return { value: { ...props, track: 'ring', ringLeds: stringLedCount(output) }, matched: true, hint: null }
  }
  return { value: { ...props, track: 'row' }, matched: true, hint: null }
}

/** The properties a node type reads once Match is applied; any other type is untouched. */
export function matchedLedProperties(
  nodeType: string,
  nodeId: string,
  props: Props,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): MatchResult<Props> {
  if (nodeType !== 'NetworkRipple' && nodeType !== 'StringParticles') return { value: props, matched: false, hint: null }
  if (ledSource(props.ledSource) !== 'match') return { value: props, matched: false, hint: null }
  const outputs = boardLedOutputs(nodeId, nodes, edges)
  return nodeType === 'NetworkRipple' ? resolveRippleNetwork(props, outputs) : resolveParticleTrack(props, outputs)
}
