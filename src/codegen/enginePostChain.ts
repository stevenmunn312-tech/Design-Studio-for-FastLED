/**
 * The frame nodes between a show engine and its LED output.
 *
 * A Music Player, Performance Generator or Pattern Slideshow renders into the
 * sketch's own `leds` canvas. A Brightness, Blur or Blend wired between its
 * Frame and the LED output is a post-chain: compiled once into `postFrame()`
 * and run on that canvas after the engine has drawn it. The build used to
 * take the engine only when its Frame went straight to the output, so any
 * node in between quietly turned the build into a normal sketch that drew the
 * engine black.
 *
 * Inside the chain go the nodes on the frame path and whatever feeds them a
 * frame, field, palette or colour. A number or switch wired into one of them
 * comes from the engine's control graph, which already reads pots, buttons,
 * remotes and board links, and arrives as an argument.
 */
import type { StudioEdge, StudioNode } from '../state/graphStore'
import { NODE_LIBRARY } from '../state/nodeLibrary'
import { BOARD_LINK_IN_NODE_TYPE } from '../build/boardLinks'
import { controlInputCpp } from './controlInputCpp'

/**
 * Stands in for the engine inside a compiled post-chain: copies the engine's
 * finished `leds` into the chain's first buffer. Never on a canvas or saved.
 */
export const ENGINE_FRAME_NODE_TYPE = 'EngineFrame'

/** The engines whose sketch can run a post-chain on its canvas. */
export const POST_CHAIN_ENGINE_TYPES: ReadonlySet<string> = new Set(['PatternMaster', 'PerformanceGenerator', 'PatternSlideshow'])

export interface EnginePostChainInput {
  /** The chain node and port the value lands on. */
  nodeId: string
  port: string
  type: 'float' | 'bool'
  /** The `postFrame()` parameter that carries it. */
  param: string
}

export interface EnginePostChain {
  engineId: string
  outputId: string
  /** Every node compiled into `postFrame()`. */
  nodeIds: ReadonlySet<string>
  /** The edge that brings the finished chain into the output's Frame. */
  terminal: StudioEdge
  /** Number and switch wires into the chain, in argument order. */
  inputs: EnginePostChainInput[]
  /** What stops this chain compiling, in words; empty when it builds. */
  errors: string[]
}

/** A post-chain as an engine's control routing resolved it, for its generator. */
export interface RoutedPostChain {
  chain: EnginePostChain
  /** The expanded graph the chain's ids belong to. */
  nodes: StudioNode[]
  edges: StudioEdge[]
  /** The control graph's C++ for each input, in parameter order. */
  args: string[]
}

/**
 * Resolve a chain's inputs through the routing that asked for them. An input
 * the control graph cannot read is an error, never a silent zero.
 */
export function routePostChain(
  chain: EnginePostChain | null, nodes: StudioNode[], edges: StudioEdge[],
  scalarInputs: ReadonlyMap<string, string>, errors: string[],
): RoutedPostChain | null {
  if (!chain) return null
  errors.push(...chain.errors)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const args = chain.inputs.map((input) => {
    const expression = scalarInputs.get(`${input.nodeId}:${input.port}`)
    if (!expression) errors.push(`${label(byId.get(input.nodeId), input.nodeId)}.${input.port}: what is wired here cannot be read in this build. Wire a control, a number node or a board link into it.`)
    return expression ?? '0.0f'
  })
  return { chain, nodes, edges, args }
}

const label = (node: StudioNode | undefined, id: string) => String(node?.data.label || id)

/** The data type an edge carries, read off its source port. */
function edgeType(edge: StudioEdge, byId: ReadonlyMap<string, StudioNode>): string {
  const source = byId.get(edge.source)
  const own = (source?.data.outputs as { id: string; dataType?: string }[] | undefined)
    ?.find((port) => port.id === edge.sourceHandle)?.dataType
  if (own) return own
  return NODE_LIBRARY.find((entry) => entry.type === source?.data.nodeType)?.outputs
    .find((port) => port.id === edge.sourceHandle)?.dataType ?? ''
}

/** Sources the control graph reads and a compiled frame function cannot. */
function controlOnlySource(node: StudioNode): boolean {
  const type = String(node.data.nodeType)
  return type === 'WebRemoteInput' || type === BOARD_LINK_IN_NODE_TYPE || type === 'TouchInput'
    || controlInputCpp(type, 'x', node.data.properties as Record<string, unknown>) !== null
}

/**
 * The post-chain between `engineId` and the LED output it reaches, or null
 * when its Frame goes straight to the output (or reaches none).
 */
export function enginePostChain(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  engineId: string | null | undefined,
): EnginePostChain | null {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const engine = engineId ? byId.get(engineId) : undefined
  if (!engine || !POST_CHAIN_ENGINE_TYPES.has(String(engine.data.nodeType))) return null
  if (edges.some((edge) => edge.source === engine.id && edge.sourceHandle === 'frame'
    && byId.get(edge.target)?.data.nodeType === 'MatrixOutput')) return null

  // The output this engine reaches along frame wires through other nodes.
  const downstream = new Set<string>()
  const queue = [engine.id]
  let outputId: string | null = null
  while (queue.length && !outputId) {
    const id = queue.shift()!
    for (const edge of edges) {
      if (edge.source !== id || edgeType(edge, byId) !== 'frame' || downstream.has(edge.target)) continue
      const target = byId.get(edge.target)
      if (!target) continue
      if (target.data.nodeType === 'MatrixOutput') { if (edge.targetHandle === 'frame') outputId = target.id; continue }
      downstream.add(target.id)
      queue.push(target.id)
    }
  }
  if (!outputId) return null
  const terminal = edges.find((edge) => edge.target === outputId && edge.targetHandle === 'frame')
  if (!terminal) return null

  // Everything the output's frame is made from, short of the engine itself.
  const nodeIds = new Set<string>()
  const inputs: EnginePostChainInput[] = []
  const errors: string[] = []
  const walk = [terminal.source]
  while (walk.length) {
    const id = walk.pop()!
    if (id === engine.id || nodeIds.has(id)) continue
    const node = byId.get(id)
    if (!node) continue
    if (POST_CHAIN_ENGINE_TYPES.has(String(node.data.nodeType))) {
      errors.push(`${label(node, id)} feeds the frame after ${label(engine, engine.id)}: one show engine renders a build.`)
      continue
    }
    if (controlOnlySource(node)) {
      errors.push(`${label(node, id)} feeds a frame node after ${label(engine, engine.id)} with something other than a number or a switch. Wire it into a number input, or into ${label(engine, engine.id)}'s own controls.`)
      continue
    }
    nodeIds.add(id)
    for (const edge of edges) {
      if (edge.target !== id) continue
      if (edge.source === engine.id) {
        if (edge.sourceHandle !== 'frame') errors.push(`${label(node, id)} reads ${label(engine, engine.id)}'s ${edge.sourceHandle}, which a post-chain cannot.`)
        continue
      }
      const type = edgeType(edge, byId)
      if (type === 'float' || type === 'bool') {
        inputs.push({ nodeId: id, port: edge.targetHandle ?? '', type, param: `post_in_${inputs.length}` })
      } else {
        walk.push(edge.source)
      }
    }
  }
  return { engineId: engine.id, outputId, nodeIds, terminal, inputs, errors }
}
