import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { useGraphStore } from '../../state/graphStore'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { insertLiveExample } from '../insertLiveExample'
import type { LiveExampleSpec } from '../insertLiveExample'

const example: LiveExampleSpec = {
  title: 'Microphone spectrum',
  nodes: [
    { key: 'mic', type: 'MicInput', dx: -600, dy: -200 },
    { key: 'fft', type: 'FFTAnalyzer', dx: -300, dy: -150 },
    { key: 'bars', type: 'SpectrumBars', dx: 0, dy: -150 },
    { key: 'out', type: 'MatrixOutput', dx: 320, dy: -200 },
  ],
  edges: [
    { source: 'mic', sourceHandle: 'audio', target: 'fft', targetHandle: 'audio' },
    { source: 'fft', sourceHandle: 'bass', target: 'bars', targetHandle: 'bass' },
    { source: 'fft', sourceHandle: 'mids', target: 'bars', targetHandle: 'mids' },
    { source: 'fft', sourceHandle: 'treble', target: 'bars', targetHandle: 'treble' },
    { source: 'bars', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

function studioNode(type: string, id: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === type)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType: definition.type,
      category: definition.category,
      properties: { ...definition.defaultProperties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  }
}

describe('insertLiveExample', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.temporal.getState().pause()
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    useGraphStore.temporal.getState().clear()
    useGraphStore.temporal.getState().resume()
  })

  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('adds a complete connected example around the requested origin', () => {
    const result = insertLiveExample(example, { x: 1000, y: 500 })
    const state = useGraphStore.getState()

    expect(state.nodes).toHaveLength(4)
    expect(state.edges).toHaveLength(5)
    expect(result.addedNodeIds).toHaveLength(4)
    expect(result.skippedConnections).toEqual([])
    expect(state.nodes.find((node) => node.data.nodeType === 'MicInput')?.position).toEqual({ x: 400, y: 300 })
    expect(state.edges.map((edge) => `${edge.sourceHandle}->${edge.targetHandle}`)).toContain('frame->frame')
  })

  it('reuses an occupied Matrix Output without replacing its existing frame edge', () => {
    const noise = studioNode('Noise', 'noise')
    const output = studioNode('MatrixOutput', 'output')
    const existingEdge: StudioEdge = {
      id: 'existing-frame',
      source: noise.id,
      sourceHandle: 'frame',
      target: output.id,
      targetHandle: 'frame',
    }
    useGraphStore.setState({ nodes: [noise, output], edges: [existingEdge] })

    const result = insertLiveExample(example, { x: 1000, y: 500 })
    const state = useGraphStore.getState()

    expect(state.nodes.filter((node) => node.data.nodeType === 'MatrixOutput')).toHaveLength(1)
    expect(state.edges).toContain(existingEdge)
    expect(state.edges).toHaveLength(5)
    expect(result.reusedNodeTypes).toContain('MatrixOutput')
    expect(result.skippedConnections).toEqual([
      { source: 'bars', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ])
  })

  it('records the whole insertion as one undo step', () => {
    insertLiveExample(example, { x: 1000, y: 500 })

    expect(useGraphStore.temporal.getState().pastStates).toHaveLength(1)
    vi.runAllTimers()
    useGraphStore.temporal.getState().undo()

    expect(useGraphStore.getState().nodes).toEqual([])
    expect(useGraphStore.getState().edges).toEqual([])
  })
})
