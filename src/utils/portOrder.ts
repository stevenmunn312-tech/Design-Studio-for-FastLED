import { exposableInputsFor } from '../state/propertyInputs'

export interface OrderedPort {
  id: string
}

/**
 * Library order, permuted by any order the graph has saved.
 *
 * A saved order may only rearrange the ports it actually names. Those ports
 * are permuted among the *positions they already occupy*; every other port
 * keeps its library position. Ports the library no longer has are dropped, and
 * a save that never reordered anything comes back unchanged.
 *
 * Sorting the whole list by saved rank instead — appending anything the save
 * did not name — reads a stale save as a deliberate reorder, and the two are
 * not distinguishable by rank alone. It moved `PerformanceGenerator`'s Music
 * input behind Patterns for any workspace saved before Music existed, and put
 * a Control Map's trailing `add-control` socket ahead of the rows it mints
 * from its own wires, since those rows are not in a pre-feature save either.
 * Permuting in place says what a Tidy swap means and nothing more: only the
 * ports in the crossed bundle move, which is what `untanglePortOrders` below
 * does in the first place.
 */
export function orderPorts<T extends OrderedPort>(canonical: readonly T[], saved: readonly OrderedPort[] | undefined): T[] {
  if (!saved?.length) return [...canonical]
  const rank = new Map(saved.map((port, index) => [port.id, index]))
  const slots = canonical.reduce<number[]>((found, port, index) => {
    if (rank.has(port.id)) found.push(index)
    return found
  }, [])
  const permuted = slots
    .map((index) => canonical[index])
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const ordered = [...canonical]
  slots.forEach((index, position) => { ordered[index] = permuted[position] })
  return ordered
}

export interface UntangleNode {
  id: string
  nodeType: string
  inputs: readonly OrderedPort[]
  outputs: readonly OrderedPort[]
}

export interface UntangleEdge {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

interface WorkingNode extends UntangleNode {
  inputs: OrderedPort[]
  outputs: OrderedPort[]
}

const columnInputs = (node: WorkingNode) => {
  const hidden = new Set(exposableInputsFor(node.nodeType).map((port) => port.id))
  return node.inputs.filter((port) => !hidden.has(port.id))
}

/**
 * Two wires between the same pair cross when the order of the ports they
 * leave is the opposite of the order of the ports they arrive at. Moving the
 * nodes cannot undo that. Swap the reversed side — the one that is not also
 * feeding a third node, and the source when either side would do — so the
 * wires run in parallel.
 *
 * Only the ports in the crossed bundle move, and only when the swap lowers
 * the number of crossings in the whole graph.
 */
export function untanglePortOrders(
  nodes: readonly UntangleNode[],
  edges: readonly UntangleEdge[],
): Map<string, { inputs: OrderedPort[]; outputs: OrderedPort[] }> {
  const working = new Map<string, WorkingNode>(nodes.map((node) => [node.id, {
    ...node,
    inputs: node.inputs.map((port) => ({ ...port })),
    outputs: node.outputs.map((port) => ({ ...port })),
  }]))
  const original = new Map(nodes.map((node) => [node.id, {
    inputs: node.inputs.map((port) => port.id).join('\0'),
    outputs: node.outputs.map((port) => port.id).join('\0'),
  }]))

  const pairs = new Map<string, UntangleEdge[]>()
  for (const edge of edges) {
    if (!edge.source || !edge.target || edge.source === edge.target) continue
    if (!working.has(edge.source) || !working.has(edge.target)) continue
    const key = `${edge.source}\0${edge.target}`
    pairs.set(key, [...(pairs.get(key) ?? []), edge])
  }

  const score = () => {
    let crossings = 0
    for (const [key, bundle] of pairs) {
      const [sourceId, targetId] = key.split('\0')
      crossings += countCrossings(working.get(sourceId)!, working.get(targetId)!, bundle)
    }
    return crossings
  }

  for (let pass = 0; pass < 8; pass++) {
    let best: { id: string; side: 'inputs' | 'outputs'; ports: OrderedPort[] } | null = null
    let bestScore = score()
    if (bestScore === 0) break
    for (const [key, bundle] of pairs) {
      const [sourceId, targetId] = key.split('\0')
      const source = working.get(sourceId)!
      const target = working.get(targetId)!
      if (countCrossings(source, target, bundle) === 0) continue
      for (const candidate of candidates(source, target, bundle)) {
        const previous = candidate.side === 'outputs' ? source.outputs : target.inputs
        const node = candidate.side === 'outputs' ? source : target
        const slot = candidate.side
        node[slot] = candidate.ports
        const next = score()
        node[slot] = previous
        // A tie keeps the node being fed. Its port order is the one the
        // wires were aimed at; the source is the side that was reversed.
        const preferSource = candidate.side === 'outputs'
        if (next < bestScore || (next === bestScore && preferSource && best?.side === 'inputs')) {
          bestScore = next
          best = { id: node.id, side: slot, ports: candidate.ports }
        }
      }
    }
    if (!best || bestScore === score()) break
    working.get(best.id)![best.side] = best.ports
  }

  const changed = new Map<string, { inputs: OrderedPort[]; outputs: OrderedPort[] }>()
  for (const [id, node] of working) {
    const before = original.get(id)!
    if (node.inputs.map((port) => port.id).join('\0') === before.inputs
      && node.outputs.map((port) => port.id).join('\0') === before.outputs) continue
    changed.set(id, { inputs: node.inputs, outputs: node.outputs })
  }
  return changed
}

function candidates(source: WorkingNode, target: WorkingNode, bundle: readonly UntangleEdge[]) {
  // Outputs are all drawn. Inputs hide the on-demand property sockets, so a
  // crossing is judged on the rows the wires actually leave and arrive at.
  const landed = landedPairs(source.outputs, columnInputs(target), bundle)
  if (landed.length < 2) return []
  return [
    { side: 'outputs' as const, ports: rewrite(source.outputs, desiredOrder(landed, 'source')) },
    { side: 'inputs' as const, ports: rewrite(target.inputs, desiredOrder(landed, 'target')) },
  ]
}

interface Landed {
  sourceId: string
  targetId: string
  sourceIndex: number
  targetIndex: number
}

function landedPairs(outputs: readonly OrderedPort[], inputs: readonly OrderedPort[], bundle: readonly UntangleEdge[]): Landed[] {
  const sourceAt = new Map(outputs.map((port, index) => [port.id, index]))
  const targetAt = new Map(inputs.map((port, index) => [port.id, index]))
  const pairs: Landed[] = []
  for (const edge of bundle) {
    if (!edge.sourceHandle || !edge.targetHandle) continue
    const sourceIndex = sourceAt.get(edge.sourceHandle)
    const targetIndex = targetAt.get(edge.targetHandle)
    if (sourceIndex === undefined || targetIndex === undefined) continue
    pairs.push({ sourceId: edge.sourceHandle, targetId: edge.targetHandle, sourceIndex, targetIndex })
  }
  return pairs
}

function desiredOrder(pairs: readonly Landed[], side: 'source' | 'target'): string[] {
  const ranks = new Map<string, number[]>()
  for (const pair of pairs) {
    const id = side === 'source' ? pair.sourceId : pair.targetId
    const rank = side === 'source' ? pair.targetIndex : pair.sourceIndex
    ranks.set(id, [...(ranks.get(id) ?? []), rank])
  }
  return [...ranks.entries()]
    .sort((a, b) => median(a[1]) - median(b[1]) || a[0].localeCompare(b[0]))
    .map(([id]) => id)
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/** Fill the bundle's existing rows with `desired`, top to bottom. Everything else stays. */
function rewrite(ports: readonly OrderedPort[], desired: readonly string[]): OrderedPort[] {
  const byId = new Map(ports.map((port) => [port.id, port]))
  const queue = desired.map((id) => byId.get(id)).filter((port): port is OrderedPort => !!port)
  const moving = new Set(queue.map((port) => port.id))
  let cursor = 0
  return ports.map((port) => (moving.has(port.id) ? queue[cursor++] : port))
}

function countCrossings(source: WorkingNode, target: WorkingNode, bundle: readonly UntangleEdge[]): number {
  const pairs = landedPairs(source.outputs, columnInputs(target), bundle)
  let crossings = 0
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const ds = pairs[i].sourceIndex - pairs[j].sourceIndex
      const dt = pairs[i].targetIndex - pairs[j].targetIndex
      if (ds !== 0 && dt !== 0 && (ds > 0) !== (dt > 0)) crossings++
    }
  }
  return crossings
}
