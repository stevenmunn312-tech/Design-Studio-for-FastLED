// A bounded, typed dependency graph for scalar paths outside pattern renderers.
// Building the IR performs no I/O or evaluation of authored scripts. Template
// generators use the same resolver for validation and emission.
import type { StudioNode, StudioEdge } from '../state/graphStore'
import { inputClampRange, resolveNodeScalarExpressions } from '../state/nodeLibrary'
import { compositionDims } from '../state/outputRouting'
import { controlInputCpp, type ControlInputEmission } from './controlInputCpp'
import { DISPLAY_TEXT_CPP_HELPERS } from './displayTextCpp'
import { MAP_FLOAT_CPP, SCALAR_CONTROL_NODES, scalarControlCpp, scalarControlInputDefaults, type ControlDataType } from './scalarControlCpp'

export const MAX_CONTROL_GRAPH_NODES = 256
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')

export interface ControlReference { nodeId: string; port: string; type: ControlDataType }
export type ControlOperand =
  | { kind: 'literal'; value: number }
  | { kind: 'reference'; reference: ControlReference; clamp?: { min: number; max: number } }

export type ControlInstruction =
  | { kind: 'gpio'; nodeId: string; emission: ControlInputEmission }
  | { kind: 'scalar'; nodeId: string; nodeType: string; properties: Record<string, unknown>; inputs: Record<string, ControlOperand> }

export function controlReferenceCpp(reference: ControlReference): string {
  return `n_${safeId(reference.nodeId)}_${safeId(reference.port)}`
}

export function createControlGraph(nodes: StudioNode[], edges: StudioEdge[], sampledSources: readonly ControlReference[] = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(edges.map((edge) => [`${edge.target}:${edge.targetHandle}`, edge]))
  const { w, h } = compositionDims(nodes, edges)
  const instructions: ControlInstruction[] = []
  const errors = new Set<string>()
  const done = new Set<string>(), visiting = new Set<string>()
  const symbols = new Map<string, string>()
  const label = (id: string) => String(byId.get(id)?.data.label || id)
  const fail = (message: string): null => { errors.add(message); return null }
  const samples = new Map(sampledSources.map((source) => [JSON.stringify([source.nodeId, source.port]), source]))
  // Samples are declared before the graph even when no consumer reads them.
  // Reserve all their symbols so an otherwise unused output cannot collide.
  for (const source of sampledSources) {
    const symbol = controlReferenceCpp(source), owner = JSON.stringify([source.nodeId, source.port])
    if (symbols.has(symbol) && symbols.get(symbol) !== owner) fail(`${label(source.nodeId)}: control identifiers collide after sanitization. Rename or recreate this node.`)
    symbols.set(symbol, owner)
  }

  const resolve = (nodeId: string, port: string, type: ControlDataType): ControlReference | null => {
    const node = byId.get(nodeId)
    if (!node) return fail(`Control graph: missing source ${nodeId}.`)
    const scalar = Object.hasOwn(SCALAR_CONTROL_NODES, node.data.nodeType) ? SCALAR_CONTROL_NODES[node.data.nodeType] : undefined
    const gpio = scalar ? null : controlInputCpp(node.data.nodeType, safeId(node.id), node.data.properties)
    const sample = samples.get(JSON.stringify([nodeId, port]))
    const actualType = sample?.type ?? (scalar ? (port === scalar.port ? scalar.type : undefined) : gpio?.outputs[port])
    if (actualType !== type) return fail(`${label(nodeId)}.${port}: control graph requires ${type}; this source or port is unsupported.`)
    const reference = { nodeId, port, type }
    const symbol = controlReferenceCpp(reference)
    const owner = JSON.stringify([nodeId, port])
    if (symbols.has(symbol) && symbols.get(symbol) !== owner) return fail(`${label(nodeId)}: control identifiers collide after sanitization. Rename or recreate this node.`)
    symbols.set(symbol, owner)
    // Touch outputs depend on the pre-pass sample, never on a wired Set value.
    if (sample) return reference
    if (done.has(nodeId)) return reference
    if (visiting.has(nodeId)) return fail(`${label(nodeId)}: control graph contains an instantaneous cycle. Remove a feedback wire.`)
    if (visiting.size + done.size >= MAX_CONTROL_GRAPH_NODES) return fail(`Control graph exceeds ${MAX_CONTROL_GRAPH_NODES} nodes. Split or simplify its wiring.`)
    visiting.add(nodeId)
    if (gpio) {
      instructions.push({ kind: 'gpio', nodeId, emission: gpio })
    } else {
      const properties = resolveNodeScalarExpressions(node.data.nodeType, node.data.properties, w, h)
      const inputs: Record<string, ControlOperand> = {}
      for (const [input, fallback] of Object.entries(scalarControlInputDefaults(node.data.nodeType, properties))) {
        const edge = incoming.get(`${nodeId}:${input}`)
        if (edge) {
          const upstream = resolve(edge.source, edge.sourceHandle ?? '', 'float')
          if (!upstream) { visiting.delete(nodeId); return null }
          const clamp = properties.clampInputs ? inputClampRange(node.data.nodeType, input) : null
          inputs[input] = { kind: 'reference', reference: upstream, ...(clamp ? { clamp } : {}) }
        } else {
          const value = Number(properties[input] ?? fallback)
          if (!Number.isFinite(value)) { visiting.delete(nodeId); return fail(`${label(nodeId)}.${input}: control value must be finite.`) }
          inputs[input] = { kind: 'literal', value }
        }
      }
      instructions.push({ kind: 'scalar', nodeId, nodeType: node.data.nodeType, properties, inputs })
    }
    visiting.delete(nodeId)
    done.add(nodeId)
    return reference
  }

  const input = (nodeId: string, port: string, type: ControlDataType): ControlReference | null => {
    const edge = incoming.get(`${nodeId}:${port}`)
    return edge ? resolve(edge.source, edge.sourceHandle ?? '', type) : null
  }
  return { instructions, errors, resolve, input }
}

/** Emit each producer exactly once in dependency order. Values live for the
 * whole loop, so all downstream consumers observe the same GPIO sample. */
export function controlGraphCpp(graph: ReturnType<typeof createControlGraph>) {
  if (graph.errors.size) throw new Error([...graph.errors].join('\n'))
  const setup = new Set<string>(), helpers = new Set<string>(), loop: string[] = []
  for (const instruction of graph.instructions) {
    if (instruction.kind === 'gpio') {
      instruction.emission.setup.forEach((line) => setup.add(line))
      loop.push(...instruction.emission.loop)
      continue
    }
    const emitted = scalarControlCpp(instruction.nodeType, safeId(instruction.nodeId), instruction.properties, (port) => {
      const operand = instruction.inputs[port]
      if (operand.kind === 'literal') return String(operand.value)
      const expression = controlReferenceCpp(operand.reference)
      return operand.clamp ? `constrain(${expression}, ${operand.clamp.min}, ${operand.clamp.max})` : expression
    })!
    loop.push(...emitted.loop)
    if (emitted.needsMapFloat) helpers.add(MAP_FLOAT_CPP)
    if (emitted.needsDisplayText) helpers.add(DISPLAY_TEXT_CPP_HELPERS)
  }
  return { setup: [...setup], helpers: [...helpers], loop }
}
