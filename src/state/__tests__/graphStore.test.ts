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

  it('removeEdge unplugs a single noodle', () => {
    reset(
      [node('sc', 'SolidColor', {}), node('out', 'MatrixOutput', {})],
      [edge('e1', 'sc', 'frame', 'out', 'frame')],
    )
    useGraphStore.getState().removeEdge('e1')
    expect(useGraphStore.getState().edges).toHaveLength(0)
  })

  it('reconnectNoodle re-routes an edge to a new target', () => {
    reset(
      [node('sc', 'SolidColor', {}), node('inv', 'Invert', {}), node('out', 'MatrixOutput', {})],
      [edge('e1', 'sc', 'frame', 'out', 'frame')],
    )
    const old = useGraphStore.getState().edges[0]
    // Re-route sc's output from out to inv's frame input.
    useGraphStore.getState().reconnectNoodle(old, {
      source: 'sc', sourceHandle: 'frame', target: 'inv', targetHandle: 'frame',
    })
    const e = useGraphStore.getState().edges
    expect(e).toHaveLength(1)
    expect(e[0].target).toBe('inv')
    expect(e[0].targetHandle).toBe('frame')
  })

  it('createGroup exposes incoming edges as group parameters', () => {
    reset(
      [
        node('c', 'Clamp', { value: 0.5, min: 0, max: 1 }),
        node('sc', 'SolidColor', { r: 255, g: 255, b: 255 }),
        node('bm', 'BrightnessMod'),
        node('out', 'MatrixOutput'),
      ],
      [
        edge('e1', 'sc', 'frame', 'bm', 'frame'),
        edge('e2', 'c', 'result', 'bm', 'brightness'),
        edge('e3', 'bm', 'frame', 'out', 'frame'),
      ],
    )
    // Group sc + bm; the Clamp→bm.brightness edge crosses the boundary → param.
    const gid = useGraphStore.getState().createGroup('Dim', ['sc', 'bm'])
    const s = useGraphStore.getState()
    const groupNode = s.nodes.find((n) => n.data.nodeType === 'Group')!
    expect((groupNode.data.inputs as unknown[]).length).toBe(1)
    // The external Clamp now feeds the group's exposed param port.
    expect(s.edges.some((e) => e.source === 'c' && e.target === groupNode.id)).toBe(true)
    // The subgraph gained a GroupInput node carrying that param inward.
    expect(s.graphData[gid].nodes.some((n) => n.data.nodeType === 'GroupInput')).toBe(true)
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

describe('graphStore — legacy node migration on load', () => {
  beforeEach(() => reset())

  const dataOf = (id: string) => useGraphStore.getState().nodes.find((n) => n.id === id)!.data

  it('upgrades bundled node types and preserves variant-specific props', () => {
    useGraphStore.getState().loadGraph([
      node('m', 'Multiply', { a: 2, b: 3 }),
      node('w', 'Wipe', { t: 0.5, direction: 'up' }),
      node('n', 'PlasmaFractal', { speed: 1, scale: 0.2, palette: 'ocean' }),
    ], [])
    expect(dataOf('m').nodeType).toBe('Math')
    expect(dataOf('m').properties.mathOp).toBe('multiply')
    expect(dataOf('w').nodeType).toBe('Transition')
    expect(dataOf('w').properties.transitionType).toBe('wipe')
    expect(dataOf('w').properties.direction).toBe('up')        // wipe keeps direction
    expect(dataOf('n').nodeType).toBe('Noise')
    expect(dataOf('n').properties.noiseType).toBe('plasma')
  })

  it('migrates BlendFrames to Blend, scaling t→amount and rewiring its edge', () => {
    useGraphStore.getState().loadGraph(
      [node('src', 'SolidColor', { r: 1, g: 1, b: 1 }), node('bf', 'BlendFrames', { t: 0.8 })],
      [edge('e1', 'src', 'value', 'bf', 't')],   // a noodle into the old `t` port
    )
    const d = dataOf('bf')
    expect(d.nodeType).toBe('Blend')
    expect(d.properties.blendMode).toBe('normal')
    expect(d.properties.amount).toBe(204)        // 0.8 × 255
    expect(d.properties.t).toBeUndefined()       // old prop dropped
    const e = useGraphStore.getState().edges[0]
    expect(e.targetHandle).toBe('amount')        // edge rewired to the new port
  })
})
