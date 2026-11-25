import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/evaluator/types'
import { NODE_EVALUATOR_TABLES } from '../../state/graphEvaluator'

/*
 * Which graphs the live preview may evaluate in its worker.
 *
 * The worker loads the same evaluator, but of the stores it reads only the
 * live ones (both audio stores and the test-signal switch) are sent to it with
 * each request; the rest (inputs, touch, the player, the graph itself) are
 * empty there. A graph qualifies only when every node in it, and in every
 * group it reaches, is a type whose preview reads no other store. The list is
 * closed: a store read happens either in a node's own handler or because a
 * store-reading node is upstream of it, and a graph built only from these
 * types has neither. workerGate.test.ts spies on every store while each type
 * runs, wired and unwired, and records which live fields it reads; the
 * worker makes any other store read throw, so a miss falls back rather than
 * reading defaults. See docs/plans/evaluator-worker-design.md.
 */
const WORKER_CATEGORIES = [
  'audio', 'audioReactive', 'color', 'composite', 'field', 'generative', 'graph', 'math', 'shapes', 'signal', 'simulations',
] as const satisfies readonly (keyof typeof NODE_EVALUATOR_TABLES)[]

/** Types in those categories whose preview reads state the worker lacks. */
const WORKER_EXCLUDED_TYPES = new Set<string>([
  // Reads its clip from sdVideoStore's in-memory cache, which the main thread
  // fills from IndexedDB. Not a Zustand store, so the spy cannot see it.
  'SDVideo',
])

/** Types outside those categories that read no store but the live ones
 *  sent with each request: the audio stores and the test-signal switch. */
const WORKER_EXTRA_TYPES = ['Audio', 'FormulaPattern', 'MatrixOutput', 'MasterSpeed', 'StereoVuMeter']

const EVALUATED_TYPES = new Set(Object.values(NODE_EVALUATOR_TABLES).flatMap((table) => Object.keys(table)))

export const WORKER_NODE_TYPES: ReadonlySet<string> = new Set([
  ...WORKER_CATEGORIES.flatMap((category) => Object.keys(NODE_EVALUATOR_TABLES[category])),
  ...WORKER_EXTRA_TYPES,
].filter((type) => !WORKER_EXCLUDED_TYPES.has(type)))

export interface WorkerGateResult {
  /** The ids of the groups the graph reaches, to send to the worker. */
  groupIds: string[]
}

let cacheKey: readonly unknown[] = []
let cacheResult: WorkerGateResult | null = null

/**
 * The groups the graph reaches when the worker may evaluate it, or null.
 * Cached on the identity of its inputs: the loop asks every frame, and the
 * store keeps the same arrays until an edit.
 */
export function workerEvaluable(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  groups: GroupRegistry,
): WorkerGateResult | null {
  const key = [nodes, edges, ...Object.entries(groups).flatMap(([id, def]) => [id, def.nodes, def.edges])]
  if (key.length === cacheKey.length && key.every((value, i) => value === cacheKey[i])) return cacheResult
  cacheKey = key
  cacheResult = gate(nodes, groups)
  return cacheResult
}

function gate(nodes: readonly StudioNode[], groups: GroupRegistry): WorkerGateResult | null {
  const groupIds: string[] = []
  const seen = new Set<string>()
  const pending: (readonly StudioNode[])[] = [nodes]
  while (pending.length) {
    for (const node of pending.pop()!) {
      const type = String(node.data.nodeType ?? '')
      // A type with no preview (the Board, power parts, other hardware) is
      // read elsewhere through the root graph and publishes nothing here.
      if (!WORKER_NODE_TYPES.has(type) && EVALUATED_TYPES.has(type)) return null
      if (type !== 'Group') continue
      const groupId = String((node.data.properties as { groupId?: unknown } | undefined)?.groupId ?? '')
      const def = groups[groupId]
      if (!def || seen.has(groupId)) continue
      seen.add(groupId)
      groupIds.push(groupId)
      pending.push(def.nodes)
    }
  }
  return { groupIds }
}
