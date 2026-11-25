// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { STARTER_TEMPLATES } from '../../../state/patterns/starterTemplates'
import { EVALUATOR_STORES } from '../evaluatorStores'
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

function storeReadsWhile(run: () => void): string[] {
  const spies = EVALUATOR_STORES.map(([name, store]) => [name, vi.spyOn(store, 'getState')] as const)
  try {
    run()
    return spies.filter(([, spy]) => spy.mock.calls.length > 0).map(([name]) => name)
  } finally {
    for (const [, spy] of spies) spy.mockRestore()
  }
}

afterEach(() => resetEvaluatorState())

describe('preview worker gate', () => {
  it('has a source for the common port types', () => {
    for (const dataType of ['float', 'bool', 'frame', 'field', 'palette', 'color']) {
      expect(SOURCE_BY_DATA_TYPE.has(dataType), dataType).toBe(true)
    }
  })

  it.each([...WORKER_NODE_TYPES].sort())('%s reads no store, unwired or wired', (type) => {
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
    const reads = storeReadsWhile(() => {
      for (let tick = 1; tick <= 3; tick++) {
        try {
          evaluateGraphFull([nodes[0]], [], tick, 16, 16, {}, true, true, '__gate_unwired/', null, tick)
          evaluateGraphFull(nodes, edges, tick, 16, 16, {}, true, true, '__gate_wired/', null, tick)
        } catch {
          // A throw is the evaluator's own business; only store reads matter here.
        }
      }
    })
    expect(reads).toEqual([])
  })

  it('admits the Field Transform starter and refuses a graph with an audio node', () => {
    const starter = STARTER_TEMPLATES.find((entry) => entry.id === 'field-warp')!.build()
    // As loaded, with the bench's Board beside it: hardware has no preview.
    const graph = [...starter.nodes, node('board', 'Board')]
    expect(workerEvaluable(graph, starter.edges, {}, undefined)).toEqual({ groupIds: [] })
    expect(workerEvaluable([...graph, node('a', 'FFTAnalyzer')], starter.edges, {}, undefined)).toBeNull()
  })

  it('follows groups and refuses one that holds a refused type', () => {
    const inner = { nodes: [node('i', 'Plasma'), node('o', 'GroupOutput')], edges: [] }
    const deep = { nodes: [node('m', 'MidiInput')], edges: [] }
    const group = node('g', 'Group', { groupId: 'inner' })
    expect(workerEvaluable([group], [], { inner, deep }, undefined)).toEqual({ groupIds: ['inner'] })
    const refusing = { nodes: [...inner.nodes, node('gd', 'Group', { groupId: 'deep' })], edges: [] }
    expect(workerEvaluable([group], [], { inner: refusing, deep }, undefined)).toBeNull()
  })

  it('refuses a group opened with live audio bound to its inputs', () => {
    expect(workerEvaluable([node('p', 'Plasma')], [], {}, { audio: null })).toBeNull()
  })
})
