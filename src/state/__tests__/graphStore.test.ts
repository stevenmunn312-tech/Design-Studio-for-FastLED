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

  it('onConnect replaces an existing noodle on the same input slot', () => {
    reset(
      [node('a', 'SolidColor', {}), node('b', 'Noise', {}), node('out', 'MatrixOutput', {})],
      [edge('e1', 'a', 'frame', 'out', 'frame')],
    )
    useGraphStore.getState().onConnect({
      source: 'b', sourceHandle: 'frame', target: 'out', targetHandle: 'frame',
    })
    const e = useGraphStore.getState().edges
    expect(e).toHaveLength(1)
    expect(e[0].source).toBe('b')
    expect(e[0].target).toBe('out')
    expect(e[0].targetHandle).toBe('frame')
  })

  it('reconnectNoodle replaces the noodle already occupying the destination input', () => {
    reset(
      [node('a', 'SolidColor', {}), node('b', 'Noise', {}), node('c', 'Image', {}), node('out', 'MatrixOutput', {})],
      [edge('e1', 'a', 'frame', 'out', 'frame'), edge('e2', 'b', 'frame', 'c', 'frame')],
    )
    const moving = useGraphStore.getState().edges.find((e) => e.id === 'e2')!
    useGraphStore.getState().reconnectNoodle(moving, {
      source: 'b', sourceHandle: 'frame', target: 'out', targetHandle: 'frame',
    })
    const e = useGraphStore.getState().edges
    expect(e).toHaveLength(1)
    expect(e[0].source).toBe('b')
    expect(e[0].target).toBe('out')
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

  it('leaves MatrixOutput and signal sources behind when grouping', () => {
    reset(
      [
        node('mic', 'MicInput'),
        node('fft', 'FFTAnalyzer'),
        node('sp', 'SpectrumBars'),
        node('out', 'MatrixOutput'),
      ],
      [
        edge('e1', 'mic', 'audio', 'fft', 'audio'),
        edge('e2', 'fft', 'bass', 'sp', 'bass'),
        edge('e3', 'sp', 'frame', 'out', 'frame'),
      ],
    )
    // "Select all" then group — the singletons must stay in the parent graph.
    const gid = useGraphStore.getState().createGroup('Spectrum', ['mic', 'fft', 'sp', 'out'])
    const s = useGraphStore.getState()

    expect(s.nodes.find((n) => n.id === 'mic')).toBeTruthy()   // source left behind
    expect(s.nodes.find((n) => n.id === 'out')).toBeTruthy()   // output left behind
    expect(s.nodes.find((n) => n.id === 'fft')).toBeUndefined() // sealed in the group
    const groupNode = s.nodes.find((n) => n.data.nodeType === 'Group')!

    // The mic now feeds the group via an exposed audio param; the group feeds out.
    expect(s.edges.some((e) => e.source === 'mic' && e.target === groupNode.id)).toBe(true)
    expect(s.edges.some((e) => e.source === groupNode.id && e.target === 'out')).toBe(true)
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
    expect(d.properties.amount).toBe(0.8)        // 0–1 amount carries t straight over
    expect(d.properties.t).toBeUndefined()       // old prop dropped
    const e = useGraphStore.getState().edges[0]
    expect(e.targetHandle).toBe('amount')        // edge rewired to the new port
  })

  it('renames the spectral nodes’ intensity → energy (property + input port), leaving Fire alone', () => {
    useGraphStore.getState().loadGraph(
      [
        node('src', 'FFTAnalyzer'),
        node('mw', 'MidrangeWaves', { intensity: 0.9, speed: 1, palette: 'ocean' }),
        node('fire', 'Fire', { intensity: 0.3 }),   // Fire's own intensity input is untouched
      ],
      [edge('e1', 'src', 'mids', 'mw', 'intensity')],   // a noodle into the old `intensity` port
    )
    const d = dataOf('mw')
    expect(d.properties.energy).toBe(0.9)
    expect(d.properties.intensity).toBeUndefined()
    expect(useGraphStore.getState().edges[0].targetHandle).toBe('energy')
    // Fire is excluded from the rename.
    expect(dataOf('fire').properties.intensity).toBe(0.3)
    expect(dataOf('fire').properties.energy).toBeUndefined()
  })

  it('rescales a legacy 0–255 Blend amount to the 0–1 range on load', () => {
    useGraphStore.getState().loadGraph(
      [node('bl', 'Blend', { blendMode: 'normal', amount: 128 }), node('bl2', 'Blend', { amount: 0.5 })],
      [],
    )
    // 128 (old scale) → ~0.5; a value already ≤ 1 is left untouched.
    expect(dataOf('bl').properties.amount).toBeCloseTo(128 / 255, 5)
    expect(dataOf('bl2').properties.amount).toBe(0.5)
  })

  it('remaps legacy input-category nodes onto audio and hardware on load', () => {
    const mic = node('mic', 'MicInput')
    mic.data.category = 'input'
    const music = node('lib', 'MusicLibrary')
    music.data.category = 'input'
    useGraphStore.getState().loadGraph([mic, music], [])
    expect(dataOf('mic').category).toBe('hardware')
    expect(dataOf('lib').category).toBe('audio')
  })

  // Regression: a reload that dropped graphData wiped every group's subgraph,
  // so instantiated patterns showed no preview. loadGraph must restore it.
  it('restores group subgraphs and metadata so groups survive a reload', () => {
    const sub = {
      nodes: [node('inner', 'SolidColor', { r: 255, g: 0, b: 0 }), node('go', 'GroupOutput')],
      edges: [edge('ie', 'inner', 'frame', 'go', 'frame')],
    }
    useGraphStore.getState().loadGraph(
      [node('grp', 'Group'), node('out', 'MatrixOutput')],
      [edge('e', 'grp', 'frame', 'out', 'frame')],
      {
        graphData: { 'grp-1': sub },
        graphs: { 'grp-1': { id: 'grp-1', name: 'My Pattern' } },
        activeGraphId: ROOT_GRAPH_ID,
      },
    )
    const s = useGraphStore.getState()
    expect(s.graphData['grp-1'].nodes).toHaveLength(2)
    expect(s.graphs['grp-1'].name).toBe('My Pattern')
    // The registry the preview/evaluator reads now includes the group again.
    expect(getGroupRegistry()['grp-1']).toBeDefined()
  })
})

describe('graphStore — splice & spread', () => {
  beforeEach(() => reset())

  const at = (n: StudioNode, x: number, y = 0): StudioNode => ({ ...n, position: { x, y } })

  it('insertNodeOnEdge rewires source → new → target and drops the old edge', () => {
    reset(
      [at(node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), 0), at(node('out', 'MatrixOutput'), 600)],
      [edge('e1', 'sc', 'frame', 'out', 'frame')],
    )
    useGraphStore.getState().insertNodeOnEdge(node('inv', 'Invert'), 'e1', 'frame', 'frame')
    const s = useGraphStore.getState()
    expect(s.nodes.some((n) => n.id === 'inv')).toBe(true)
    expect(s.edges.some((e) => e.id === 'e1')).toBe(false)
    expect(s.edges.some((e) => e.source === 'sc' && e.target === 'inv' && e.targetHandle === 'frame')).toBe(true)
    expect(s.edges.some((e) => e.source === 'inv' && e.target === 'out' && e.targetHandle === 'frame')).toBe(true)
  })

  it('spreadNodes pushes a cramped target node rightward, leaving roomy ones alone', () => {
    reset(
      [at(node('sc', 'SolidColor'), 0), at(node('bm', 'BrightnessMod'), 30), at(node('out', 'MatrixOutput'), 1000)],
      [edge('e1', 'sc', 'frame', 'bm', 'frame'), edge('e2', 'bm', 'frame', 'out', 'frame')],
    )
    useGraphStore.getState().spreadNodes()
    const pos = (id: string) => useGraphStore.getState().nodes.find((n) => n.id === id)!.position.x
    // bm was 30px from sc (overlapping) → pushed clear of sc's right edge + gap.
    expect(pos('bm')).toBeGreaterThanOrEqual(180 + 60)
    // out already had ample room → untouched.
    expect(pos('out')).toBe(1000)
  })

  it('spreadNodes leaves a vertically stacked pair alone', () => {
    reset(
      [at(node('sc', 'SolidColor'), 0, 0), at(node('out', 'MatrixOutput'), 0, 300)],
      [edge('e1', 'sc', 'frame', 'out', 'frame')],
    )
    useGraphStore.getState().spreadNodes()
    // Same column but well separated vertically → the noodle is fine, no nudge.
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'out')!.position.x).toBe(0)
  })
})

describe('graphStore — collection section tags', () => {
  beforeEach(() => reset())

  const sections = (collId: string, groupId: string) =>
    (useGraphStore.getState().nodes.find((n) => n.id === collId)!.data.properties as { patternSections?: Record<string, string[]> })
      .patternSections?.[groupId]

  it('togglePatternSection adds and removes a section, pruning the empty entry', () => {
    reset([node('coll', 'PatternCollection', { patternIds: ['g1'], patternSections: {} })])
    const toggle = useGraphStore.getState().togglePatternSection

    toggle('coll', 'g1', 'drop')
    expect(sections('coll', 'g1')).toEqual(['drop'])

    toggle('coll', 'g1', 'chorus')
    expect(sections('coll', 'g1')).toEqual(['drop', 'chorus'])

    toggle('coll', 'g1', 'drop')        // remove
    expect(sections('coll', 'g1')).toEqual(['chorus'])

    toggle('coll', 'g1', 'chorus')      // now empty → entry pruned
    expect(sections('coll', 'g1')).toBeUndefined()
  })

  it('removeFromCollection drops the pattern and its section tags', () => {
    reset([node('coll', 'PatternCollection', { patternIds: ['g1', 'g2'], patternSections: { g1: ['drop'], g2: ['verse'] } })])
    useGraphStore.setState((s) => ({ graphData: { ...s.graphData, g1: { nodes: [], edges: [] } } }))

    useGraphStore.getState().removeFromCollection('coll', 'g1')
    const props = useGraphStore.getState().nodes.find((n) => n.id === 'coll')!.data.properties as { patternIds: string[]; patternSections: Record<string, string[]> }
    expect(props.patternIds).toEqual(['g2'])
    expect(props.patternSections).toEqual({ g2: ['verse'] })
  })
})
