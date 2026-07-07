import { describe, it, expect, beforeEach } from 'vitest'
import { importPatternFile, usePatternLibrary } from '../patternLibrary'
import { useGraphStore, ROOT_GRAPH_ID } from '../graphStore'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties: {}, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function resetGraph() {
  useGraphStore.setState({
    nodes: [], edges: [], selectedNodeId: null, clipboard: null,
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {},
  })
}

describe('patternLibrary', () => {
  beforeEach(() => {
    localStorage.clear()
    usePatternLibrary.setState({ patterns: [] })
    resetGraph()
  })

  it('saves, renames, deletes and persists to localStorage', () => {
    const lib = usePatternLibrary.getState()
    lib.savePattern({
      name: 'Glow',
      inputs: [], outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [node('sc', 'SolidColor')], edges: [] as StudioEdge[] },
    })
    const saved = usePatternLibrary.getState().patterns
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Glow')
    expect(JSON.parse(localStorage.getItem('fastled-studio.pattern-library.v1')!)).toHaveLength(1)

    const id = saved[0].id
    usePatternLibrary.getState().renamePattern(id, 'Glow 2')
    expect(usePatternLibrary.getState().patterns[0].name).toBe('Glow 2')

    usePatternLibrary.getState().deletePattern(id)
    expect(usePatternLibrary.getState().patterns).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('fastled-studio.pattern-library.v1')!)).toHaveLength(0)
  })

  it('instantiatePattern drops a Group node and registers its subgraph', () => {
    const saved = {
      id: 'pat-1', name: 'Blue', createdAt: 0,
      inputs: [], outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [node('sc', 'SolidColor'), node('out', 'GroupOutput')], edges: [] as StudioEdge[] },
    }
    useGraphStore.getState().instantiatePattern(saved, { x: 100, y: 50 })
    const s = useGraphStore.getState()
    const group = s.nodes.find((n) => n.data.nodeType === 'Group')!
    expect(group).toBeTruthy()
    expect(group.position).toEqual({ x: 100, y: 50 })
    const groupId = group.data.properties.groupId as string
    expect(s.graphData[groupId].nodes.map((n) => n.id)).toEqual(['sc', 'out'])
    // Cloned, not aliased to the saved object.
    expect(s.graphData[groupId].nodes).not.toBe(saved.subgraph.nodes)
  })

  it('dedupes repeated imports of the same saved pattern file', () => {
    const pattern = {
      id: 'pat-import',
      name: 'Glow',
      createdAt: 123,
      inputs: [],
      outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [node('sc', 'SolidColor')], edges: [] as StudioEdge[] },
    }

    expect(importPatternFile(pattern)).toBe('Glow')
    expect(importPatternFile(pattern)).toBe('Glow')

    const saved = usePatternLibrary.getState().patterns
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe('pat-import')
  })

  it('addToCollection absorbs a Group node and removes it from the canvas', () => {
    useGraphStore.setState({
      nodes: [
        { ...node('coll', 'PatternCollection'), data: { ...node('coll', 'PatternCollection').data, properties: { patternIds: [] } } },
        { ...node('g', 'Group'), data: { ...node('g', 'Group').data, properties: { groupId: 'group-1' } } },
        node('up', 'SolidColor'),
      ],
      edges: [
        { id: 'e1', source: 'up', target: 'g', sourceHandle: 'out', targetHandle: 'in' } as unknown as StudioEdge,
      ],
      graphs: { root: { id: 'root', name: 'Main' }, 'group-1': { id: 'group-1', name: 'Glow' } },
      graphData: { 'group-1': { nodes: [node('x', 'SolidColor')], edges: [] } },
    })

    useGraphStore.getState().addToCollection('coll', 'g')
    const s = useGraphStore.getState()
    expect(s.nodes.find((n) => n.id === 'g')).toBeUndefined()      // group left the canvas
    expect(s.edges).toHaveLength(0)                                 // its edges went too
    const coll = s.nodes.find((n) => n.id === 'coll')!
    expect(coll.data.properties.patternIds).toEqual(['group-1'])
    expect(s.graphData['group-1']).toBeTruthy()                     // subgraph retained

    useGraphStore.getState().removeFromCollection('coll', 'group-1')
    const s2 = useGraphStore.getState()
    expect((s2.nodes.find((n) => n.id === 'coll')!.data.properties.patternIds)).toEqual([])
    expect(s2.graphData['group-1']).toBeUndefined()                 // subgraph dropped
  })
})
