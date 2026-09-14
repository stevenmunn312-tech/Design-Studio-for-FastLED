import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_LIBRARY } from '../nodeLibrary'
import { exposedPropertyInputs, normalizeExposedInputs, propertyInputsFor } from '../propertyInputs'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../graphStore'
import { captureWorkspace } from '../workspacePersistence'

function node(id: string, nodeType = 'Juggle'): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    nodeType, label: def.label, category: def.category, properties: { ...def.defaultProperties },
    inputs: def.inputs, outputs: def.outputs,
  } }
}

describe('property input exposure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.setState({ nodes: [node('juggle')], edges: [], activeGraphId: ROOT_GRAPH_ID,
      graphData: {}, graphs: { root: { id: ROOT_GRAPH_ID, name: 'Main' } }, displayDocuments: {} })
    vi.advanceTimersByTime(500)
    useGraphStore.temporal.getState().clear()
  })
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers() })

  it('only offers verified, declared property inputs and preserves their types', () => {
    for (const def of NODE_LIBRARY) {
      for (const [key, id] of Object.entries(def.propertyInputs ?? {})) {
        expect(def.defaultProperties, `${def.type}.${key}`).toHaveProperty(key)
        expect(def.inputs.filter((port) => port.id === id)).toHaveLength(1)
        expect(propertyInputsFor(def.type).find((port) => port.id === id))
          .toMatchObject({ ...def.inputs.find((port) => port.id === id), propertyKey: key })
      }
    }
    expect(propertyInputsFor('Board')).toEqual([])
    expect(propertyInputsFor('Juggle').map((port) => port.propertyKey)).toEqual(['speed', 'count', 'fade', 'palette'])
    expect(normalizeExposedInputs('Juggle', undefined)).toEqual([])
    expect(normalizeExposedInputs('TransportDisplay', undefined)).toEqual(['enabled'])
  })

  it('bounds imported visibility data and reveals wired ports without mutating the graph', () => {
    expect(normalizeExposedInputs('Juggle', ['frame', 'speed', 'speed', 'seed', {}, 'fade']))
      .toEqual(['speed', 'fade'])
    expect(exposedPropertyInputs('Juggle', [], new Set(['paletteIn', 'count'])).map((port) => port.id))
      .toEqual(['count', 'paletteIn'])
  })

  it('exposes and hides inputs without changing saved values or allowing a wired input to hide', () => {
    const store = useGraphStore.getState()
    store.setNodeInputExposed('juggle', 'count', true)
    expect(useGraphStore.getState().nodes[0].data.exposedInputs).toEqual(['count'])
    expect(useGraphStore.getState().nodes[0].data.properties.count).toBe(4)
    store.setNodeInputExposed('juggle', 'count', false)
    expect(useGraphStore.getState().nodes[0].data.exposedInputs).toEqual([])
    store.setNodeInputExposed('juggle', 'seed', true)
    expect(useGraphStore.getState().nodes[0].data.exposedInputs).toEqual([])
    useGraphStore.setState({ edges: [{ id: 'wire', source: 'source', sourceHandle: 'out', target: 'juggle', targetHandle: 'count' }] })
    const before = useGraphStore.getState()
    store.setNodeInputExposed('juggle', 'count', false)
    expect(useGraphStore.getState()).toBe(before)
  })

  // A wired property has one value source: combining two means an explicit
  // mix or select node, not two noodles quietly summing on one socket.
  it('lets the second source replace the first rather than both driving one property', () => {
    const store = useGraphStore.getState()
    store.onConnect({ source: 'a', sourceHandle: 'out', target: 'juggle', targetHandle: 'count' })
    store.onConnect({ source: 'b', sourceHandle: 'out', target: 'juggle', targetHandle: 'count' })
    expect(useGraphStore.getState().edges.map((edge) => edge.source)).toEqual(['b'])
  })

  it('pulls one wire without touching the node’s saved value or its other inputs', () => {
    useGraphStore.setState({ edges: [
      { id: 'count-wire', source: 'src', sourceHandle: 'out', target: 'juggle', targetHandle: 'count' },
      { id: 'fade-wire', source: 'src', sourceHandle: 'out', target: 'juggle', targetHandle: 'fade' },
    ] })
    useGraphStore.getState().disconnectInput('juggle', 'count')
    expect(useGraphStore.getState().edges.map((edge) => edge.id)).toEqual(['fade-wire'])
    expect(useGraphStore.getState().nodes[0].data.properties.count).toBe(4)
    const before = useGraphStore.getState()
    useGraphStore.getState().disconnectInput('juggle', 'count')
    expect(useGraphStore.getState()).toBe(before)
  })

  it('keeps exposure through workspace serialization, load and undo/redo', () => {
    useGraphStore.getState().setNodeInputExposed('juggle', 'fade', true)
    vi.advanceTimersByTime(500)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().nodes[0].data.exposedInputs).toBeUndefined()
    useGraphStore.temporal.getState().redo()
    expect(useGraphStore.getState().nodes[0].data.exposedInputs).toEqual(['fade'])
    const saved = JSON.parse(JSON.stringify(captureWorkspace(useGraphStore.getState())))
    useGraphStore.getState().loadGraph(saved.nodes, saved.edges, saved)
    expect(useGraphStore.getState().nodes.find((entry) => entry.id === 'juggle')?.data.exposedInputs).toEqual(['fade'])
  })

  it('edits root-owned display exposure from inside a group without changing the group', () => {
    const groupNode = node('inside')
    useGraphStore.setState({ nodes: [groupNode], activeGraphId: 'group',
      graphData: { root: { nodes: [node('panel', 'TransportDisplay')], edges: [] } } })
    useGraphStore.getState().setNodeInputExposed('panel', 'enabled', false)
    expect(useGraphStore.getState().nodes).toEqual([groupNode])
    expect(useGraphStore.getState().graphData.root.nodes[0].data.exposedInputs).toEqual([])
  })

  it('copies exposure with the node without sharing mutable presentation state', () => {
    useGraphStore.getState().setNodeInputExposed('juggle', 'count', true)
    useGraphStore.getState().copyNode('juggle')
    useGraphStore.getState().pasteNode({ x: 250, y: 0 })
    const copy = useGraphStore.getState().nodes.find((entry) => entry.id !== 'juggle')!
    expect(copy.data.exposedInputs).toEqual(['count'])
    useGraphStore.getState().setNodeInputExposed(copy.id, 'fade', true)
    expect(useGraphStore.getState().nodes.find((entry) => entry.id === 'juggle')?.data.exposedInputs).toEqual(['count'])
  })
})
