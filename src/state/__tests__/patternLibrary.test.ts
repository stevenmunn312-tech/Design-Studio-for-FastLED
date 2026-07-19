import { describe, it, expect, beforeEach } from 'vitest'
import {
  BUILT_IN_PATTERN_CATEGORIES,
  importPatternFile,
  reconcilePatternsFromDisk,
  usePatternLibrary,
} from '../patternLibrary'
import {
  AUDIO_REACTIVE_CATEGORY_ID,
  BUNDLED_PATTERNS,
  STANDARD_CATEGORY_ID,
} from '../bundledPatterns'
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
    usePatternLibrary.setState({ patterns: [], categories: [...BUILT_IN_PATTERN_CATEGORIES] })
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
    expect(JSON.parse(localStorage.getItem('design-studio-for-fastled.pattern-library.v1')!)).toHaveLength(1)

    const id = saved[0].id
    usePatternLibrary.getState().renamePattern(id, 'Glow 2')
    expect(usePatternLibrary.getState().patterns[0].name).toBe('Glow 2')

    usePatternLibrary.getState().deletePattern(id)
    expect(usePatternLibrary.getState().patterns).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('design-studio-for-fastled.pattern-library.v1')!)).toHaveLength(0)
  })

  it('can replace an existing pattern with the same name', () => {
    const lib = usePatternLibrary.getState()
    lib.savePattern({
      name: 'Glow',
      inputs: [],
      outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [node('red', 'SolidColor')], edges: [] as StudioEdge[] },
    })
    const original = usePatternLibrary.getState().patterns[0]

    lib.savePattern({
      name: 'Glow',
      inputs: [],
      outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [node('blue', 'Plasma')], edges: [] as StudioEdge[] },
    }, { replaceByName: true })

    const saved = usePatternLibrary.getState().patterns
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe(original.id)
    expect(saved[0].subgraph.nodes.map((n) => n.id)).toEqual(['blue'])
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

  it('treats a pattern missing from the disk snapshot as deleted', () => {
    const diskPattern = {
      id: 'pat-disk', name: 'On disk', createdAt: 1,
      inputs: [], outputs: [], subgraph: { nodes: [], edges: [] },
    }
    const staleBrowserPattern = {
      id: 'pat-stale', name: 'Deleted in folder', createdAt: 2,
      inputs: [], outputs: [], subgraph: { nodes: [], edges: [] },
    }

    expect(reconcilePatternsFromDisk([diskPattern], [diskPattern, staleBrowserPattern]))
      .toEqual([diskPattern])
  })

  it('retains only explicitly pending local writes and honours delete tombstones', () => {
    const diskPattern = {
      id: 'pat-disk', name: 'Delete pending', createdAt: 1,
      inputs: [], outputs: [], subgraph: { nodes: [], edges: [] },
    }
    const pendingPattern = {
      id: 'pat-pending', name: 'Offline save', createdAt: 2,
      inputs: [], outputs: [], subgraph: { nodes: [], edges: [] },
    }

    expect(reconcilePatternsFromDisk(
      [diskPattern],
      [diskPattern, pendingPattern],
      [pendingPattern.id],
      [diskPattern.id],
    )).toEqual([pendingPattern])
  })

  it('ships 20 immutable audio-reactive beta patterns and fixed starter shelves', async () => {
    expect(BUNDLED_PATTERNS).toHaveLength(20)
    expect(BUNDLED_PATTERNS.every((pattern) => (
      pattern.bundled && pattern.categoryId === AUDIO_REACTIVE_CATEGORY_ID
    ))).toBe(true)
    expect(BUILT_IN_PATTERN_CATEGORIES.map((category) => category.id)).toEqual([
      STANDARD_CATEGORY_ID,
      AUDIO_REACTIVE_CATEGORY_ID,
    ])

    usePatternLibrary.setState({ patterns: [...BUNDLED_PATTERNS] })
    const bundled = BUNDLED_PATTERNS[0]
    usePatternLibrary.getState().renamePattern(bundled.id, 'Changed')
    expect(await usePatternLibrary.getState().deletePattern(bundled.id)).toBe(false)
    expect(usePatternLibrary.getState().patterns[0].name).toBe(bundled.name)
  })

  it('creates custom shelves, files patterns by drag target, and safely unfiles on removal', () => {
    usePatternLibrary.getState().savePattern({
      name: 'Glow',
      inputs: [],
      outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [node('sc', 'SolidColor')], edges: [] },
    })
    const patternId = usePatternLibrary.getState().patterns[0].id
    const categoryId = usePatternLibrary.getState().createCategory('Festival')
    expect(categoryId).toBeTruthy()

    usePatternLibrary.getState().movePattern(patternId, categoryId)
    expect(usePatternLibrary.getState().patterns[0].categoryId).toBe(categoryId)

    usePatternLibrary.getState().deleteCategory(categoryId!)
    expect(usePatternLibrary.getState().categories.some((category) => category.id === categoryId)).toBe(false)
    expect(usePatternLibrary.getState().patterns[0].categoryId).toBeUndefined()
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
