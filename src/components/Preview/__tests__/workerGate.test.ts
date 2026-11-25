// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { STARTER_TEMPLATES } from '../../../state/patterns/starterTemplates'
import { useUiStore } from '../../../state/uiStore'
import { EVALUATOR_STORES } from '../evaluatorStores'
import { CAUGHT_ACTIONS, LIVE_FIELDS, LIVE_STATE_STORES } from '../previewWorker'
import { WORKER_NODE_TYPES, workerEvaluable } from '../workerGate'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? '', properties: { ...(def?.defaultProperties ?? {}), ...props },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id: `${source}:${sourceHandle}->${target}:${targetHandle}`, source, target, sourceHandle, targetHandle } as unknown as StudioEdge
}

// For each data type, an allowed node that produces it, preferring one with
// the fewest inputs: every input of a type under test is wired from one, so a
// read that only happens on a wired port is exercised too.
const SOURCE_BY_DATA_TYPE = new Map<string, { type: string; port: string }>()
const allowedByInputs = NODE_LIBRARY
  .filter((def) => WORKER_NODE_TYPES.has(def.type))
  .sort((a, b) => a.inputs.length - b.inputs.length)
for (const def of allowedByInputs) {
  for (const output of def.outputs) {
    if (output.dataType && !SOURCE_BY_DATA_TYPE.has(output.dataType)) {
      SOURCE_BY_DATA_TYPE.set(output.dataType, { type: def.type, port: output.id })
    }
  }
}

/**
 * What a run reads that the worker would not have: any blocked store, and any
 * field of a live store the snapshot does not carry (an action, or a UI
 * field other than the test-signal switch).
 */
function unsentReadsWhile(run: () => void): string[] {
  const reads = new Set<string>()
  const spies = EVALUATOR_STORES.map(([name, store]) => {
    const real = store.getState.bind(store)
    return vi.spyOn(store, 'getState').mockImplementation(() => {
      if (!LIVE_STATE_STORES.has(name)) {
        reads.add(name)
        return real()
      }
      const state = real() as Record<string, unknown>
      return new Proxy(state, {
        get(target, key) {
          const value = target[key as string]
          const fields = LIVE_FIELDS[name]
          const sent = fields ? fields.includes(String(key))
            : typeof value !== 'function' || CAUGHT_ACTIONS.includes(`${name}.${String(key)}`)
          if (!sent) reads.add(`${name}.${String(key)}`)
          return value
        },
      })
    })
  })
  try {
    run()
    return [...reads]
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
}

afterEach(() => resetEvaluatorState())

describe('preview worker gate', () => {
  it('has a source for the common port types', () => {
    for (const dataType of ['float', 'bool', 'frame', 'field', 'palette', 'color']) {
      expect(SOURCE_BY_DATA_TYPE.has(dataType), dataType).toBe(true)
    }
  })

  it.each([...WORKER_NODE_TYPES].sort())('%s reads nothing the worker lacks, unwired or wired', (type) => {
    const nodes = [node('n', type)]
    const edges: StudioEdge[] = []
    const def = NODE_LIBRARY.find((entry) => entry.type === type)
    for (const port of def?.inputs ?? []) {
      const source = port.dataType ? SOURCE_BY_DATA_TYPE.get(port.dataType) : undefined
      if (!source) continue
      const id = `src_${port.id}`
      nodes.push(node(id, source.type))
      edges.push(edge(id, source.port, 'n', port.id))
    }
    const reads = unsentReadsWhile(() => {
      // Once as it is, once on the test signal, which most audio nodes follow
      // when no live audio is playing.
      for (const testSignal of [false, true]) {
        useUiStore.setState({ testSignal })
        for (let tick = 1; tick <= 3; tick++) {
          try {
            evaluateGraphFull([nodes[0]], [], tick, 16, 16, {}, true, true, '__gate_unwired/', null, tick)
            evaluateGraphFull(nodes, edges, tick, 16, 16, {}, true, true, '__gate_wired/', null, tick)
          } catch {
            // A throw is the evaluator's own business; only store reads matter here.
          }
        }
      }
    })
    useUiStore.setState({ testSignal: false })
    expect(reads).toEqual([])
  })

  it('can tell a read the worker lacks', () => {
    const reads = unsentReadsWhile(() => {
      void useUiStore.getState().previewStyle
      void useUiStore.getState().testSignal
      void (EVALUATOR_STORES.find(([name]) => name === 'useGraphStore')![1].getState() as { nodes: unknown }).nodes
      void EVALUATOR_STORES.find(([name]) => name === 'useDisplayRuntimeStore')![1].getState()
    })
    expect(reads.sort()).toEqual(['useDisplayRuntimeStore', 'useGraphStore.nodes', 'useUiStore.previewStyle'])
  })

  it('admits the Field Transform and microphone starters and refuses a graph with a panel Touch', () => {
    for (const id of ['field-warp', 'audio-spectrum']) {
      const starter = STARTER_TEMPLATES.find((entry) => entry.id === id)!.build()
      // As loaded, with the bench's Board beside it: hardware has no preview.
      const graph = [...starter.nodes, node('board', 'Board')]
      expect(workerEvaluable(graph, starter.edges, {}), id).toEqual({ groupIds: [] })
      expect(workerEvaluable([...graph, node('t', 'TouchInput')], starter.edges, {}), id).toBeNull()
      expect(workerEvaluable([...graph, node('p', 'TransportDisplay')], starter.edges, {}), id).toBeNull()
    }
  })

  it('follows groups and refuses one that holds a refused type', () => {
    const inner = { nodes: [node('i', 'Plasma'), node('o', 'GroupOutput')], edges: [] }
    const deep = { nodes: [node('m', 'TouchInput')], edges: [] }
    const group = node('g', 'Group', { groupId: 'inner' })
    expect(workerEvaluable([group], [], { inner, deep })).toEqual({ groupIds: ['inner'] })
    const refusing = { nodes: [...inner.nodes, node('gd', 'Group', { groupId: 'deep' })], edges: [] }
    expect(workerEvaluable([group], [], { inner: refusing, deep })).toBeNull()
  })
})
