import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore, getGroupRegistry, ROOT_GRAPH_ID } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'
import { evaluateGraph } from '../graphEvaluator'
import type { StudioNode, StudioEdge } from '../graphStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

function reset(nodes: StudioNode[] = [], edges: StudioEdge[] = []) {
  useGraphStore.setState({
    nodes, edges, selectedNodeId: null, clipboard: null,
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {},
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('graphStore — grouping', () => {
  beforeEach(() => reset())

  it('createGroup moves selected nodes into a group and leaves a Group node', () => {
    reset(
      [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('bm', 'BrightnessMod'), node('out', 'MatrixOutput')],
      [edge('e1', 'sc', 'frame', 'bm', 'frame'), edge('e2', 'bm', 'frame', 'out', 'frame')],
    )
    const gid = useGraphStore.getState().createGroup('Fade', ['sc', 'bm'])
    const s = useGraphStore.getState()

    // Root no longer holds the selected nodes, but gains a Group node.
    expect(s.nodes.find((n) => n.id === 'sc')).toBeUndefined()
    expect(s.nodes.find((n) => n.id === 'bm')).toBeUndefined()
    const groupNode = s.nodes.find((n) => n.data.nodeType === 'Group')!
    expect(groupNode).toBeTruthy()
    expect(groupNode.data.properties.groupId).toBe(gid)

    // The group's subgraph holds the originals + an auto-added GroupOutput.
    expect(s.graphData[gid].nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['sc', 'bm']))
    expect(s.graphData[gid].nodes.some((n) => n.data.nodeType === 'GroupOutput')).toBe(true)

    // The external consumer is rewired from bm to the Group node.
    expect(s.edges.some((e) => e.source === groupNode.id && e.target === 'out')).toBe(true)
  })

  it('getGroupRegistry exposes created groups', () => {
    reset([node('sc', 'SolidColor', { r: 0, g: 255, b: 0 })], [])
    const gid = useGraphStore.getState().createGroup('Solid', ['sc'])
    const reg = getGroupRegistry()
    expect(reg[gid]).toBeTruthy()
    expect(reg[gid].nodes.some((n) => n.data.nodeType === 'GroupOutput')).toBe(true)
  })

  it('enterGraph swaps the active graph and back', () => {
    reset([node('sc', 'SolidColor', { r: 0, g: 0, b: 255 })], [])
    const gid = useGraphStore.getState().createGroup('Blue', ['sc'])

    useGraphStore.getState().enterGraph(gid)
    let s = useGraphStore.getState()
    expect(s.activeGraphId).toBe(gid)
    expect(s.nodes.some((n) => n.data.nodeType === 'GroupOutput')).toBe(true)
    expect(s.graphData[ROOT_GRAPH_ID]).toBeTruthy()   // root stashed

    useGraphStore.getState().enterGraph(ROOT_GRAPH_ID)
    s = useGraphStore.getState()
    expect(s.activeGraphId).toBe(ROOT_GRAPH_ID)
    expect(s.nodes.some((n) => n.data.nodeType === 'Group')).toBe(true)
  })

  it('a grouped pipeline still renders the same frame through evaluateGraph', () => {
    reset(
      [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('out', 'MatrixOutput')],
      [edge('e1', 'sc', 'frame', 'out', 'frame')],
    )
    useGraphStore.getState().createGroup('Blue', ['sc'])
    const s = useGraphStore.getState()
    const frame = evaluateGraph(s.nodes, s.edges, 0, 4, 4, getGroupRegistry())
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 255 })
  })
})
