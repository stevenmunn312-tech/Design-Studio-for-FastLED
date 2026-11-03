import { beforeEach, describe, expect, it } from 'vitest'
import { playCollectionWith, useGraphStore, ROOT_GRAPH_ID, type StudioNode } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { SavedPattern } from '../patterns/patternLibrary'

function node(id: string, type: string, properties: Record<string, unknown> = {}, x = 0): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === type)
  return {
    id, type: 'studioNode', position: { x, y: 0 },
    data: def
      ? { label: def.label, nodeType: def.type, category: def.category, properties: { ...def.defaultProperties, ...properties }, inputs: def.inputs, outputs: def.outputs }
      : { label: type, nodeType: type, category: 'hardware', properties, inputs: [], outputs: [] },
  } as StudioNode
}

const saved: SavedPattern = {
  id: 'lib-1', name: 'Aurora', createdAt: 1,
  inputs: [], outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
  subgraph: { nodes: [node('a', 'SolidColor'), node('out-a', 'GroupOutput')], edges: [] },
}

beforeEach(() => {
  useGraphStore.getState().loadGraph([
    node('board', 'Board'),
    node('coll', 'PatternCollection', { patternIds: [] }),
    node('led', 'MatrixOutput', { width: 8, height: 8 }, 900),
  ], [], { activeGraphId: ROOT_GRAPH_ID } as never)
  useGraphStore.setState({ trusted: true })
})

describe('playCollectionWith', () => {
  it.each(['PatternSlideshow', 'PatternMaster', 'PerformanceGenerator'] as const)(
    'places a %s beside the collection, wired to it and on to the one LED output', (playerType) => {
      const playerId = playCollectionWith('coll', playerType)
      expect(playerId).toBeTruthy()
      const state = useGraphStore.getState()
      const player = state.nodes.find((entry) => entry.id === playerId)!
      expect(player.data.nodeType).toBe(playerType)
      expect(player.position.x).toBeGreaterThan(0)
      expect(state.edges.some((edge) => edge.source === 'coll' && edge.sourceHandle === 'patternset'
        && edge.target === playerId && edge.targetHandle === 'patternset')).toBe(true)
      expect(state.edges.some((edge) => edge.source === playerId && edge.sourceHandle === 'frame'
        && edge.target === 'led' && edge.targetHandle === 'frame')).toBe(true)
    },
  )

  it('leaves the LED output alone when it is already fed', () => {
    useGraphStore.getState().loadGraph([
      node('board', 'Board'),
      node('coll', 'PatternCollection', { patternIds: [] }),
      node('plasma', 'Plasma'),
      node('led', 'MatrixOutput', { width: 8, height: 8 }, 900),
    ], [{ id: 'e', source: 'plasma', sourceHandle: 'frame', target: 'led', targetHandle: 'frame' }] as never, { activeGraphId: ROOT_GRAPH_ID } as never)
    const playerId = playCollectionWith('coll', 'PatternSlideshow')!
    const state = useGraphStore.getState()
    expect(state.edges.filter((edge) => edge.target === 'led' && edge.targetHandle === 'frame')).toHaveLength(1)
    expect(state.edges.some((edge) => edge.target === playerId && edge.targetHandle === 'patternset')).toBe(true)
  })

  it('does nothing for a node that is not a collection', () => {
    expect(playCollectionWith('led', 'PatternSlideshow')).toBeNull()
    expect(useGraphStore.getState().nodes).toHaveLength(3)
  })

  it('undoes the player and its wiring in one step', () => {
    useGraphStore.temporal.getState().clear()
    playCollectionWith('coll', 'PatternSlideshow')
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().nodes.map((entry) => entry.id)).toEqual(['board', 'coll', 'led'])
    expect(useGraphStore.getState().edges).toEqual([])
  })
})

describe('updateCollectionPatternFromLibrary', () => {
  it('replaces the copied subgraph and name, keeping the row', () => {
    useGraphStore.getState().addPatternToCollection('coll', saved)
    const groupId = (useGraphStore.getState().nodes.find((entry) => entry.id === 'coll')!.data.properties as { patternIds: string[] }).patternIds[0]
    useGraphStore.getState().updateNodeProperties('coll', { patternWeights: { [groupId]: 4 } })

    const edited: SavedPattern = { ...saved, name: 'Aurora II', subgraph: { nodes: [node('b', 'Noise'), node('out-b', 'GroupOutput')], edges: [] } }
    useGraphStore.getState().updateCollectionPatternFromLibrary('coll', groupId, edited)

    const state = useGraphStore.getState()
    expect(state.graphs[groupId].name).toBe('Aurora II')
    expect(state.graphs[groupId].sourcePatternId).toBe('lib-1')
    expect(state.graphData[groupId].nodes.map((entry) => entry.data.nodeType)).toEqual(['Noise', 'GroupOutput'])
    expect(state.graphData[groupId].nodes[0]).not.toBe(edited.subgraph.nodes[0])
    expect((state.nodes.find((entry) => entry.id === 'coll')!.data.properties as { patternWeights: Record<string, number> }).patternWeights[groupId]).toBe(4)
  })

  it('ignores a group the collection does not hold', () => {
    const before = useGraphStore.getState()
    useGraphStore.getState().updateCollectionPatternFromLibrary('coll', 'nope', saved)
    expect(useGraphStore.getState().graphData).toBe(before.graphData)
  })

  it('holds unfamiliar code from a library update for the workspace decision', () => {
    useGraphStore.getState().addPatternToCollection('coll', saved)
    const groupId = (useGraphStore.getState().nodes.find((entry) => entry.id === 'coll')!.data.properties as { patternIds: string[] }).patternIds[0]
    const edited = { ...saved, subgraph: { nodes: [node('foreign-code', 'Code', { code: 'return unknownLibraryRevision()' })], edges: [] } }
    useGraphStore.getState().updateCollectionPatternFromLibrary('coll', groupId, edited)
    expect(useGraphStore.getState().trusted).toBe(false)
  })
})
