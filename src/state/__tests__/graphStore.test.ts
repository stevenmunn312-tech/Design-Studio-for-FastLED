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

  it('addNode with centreOnDrop lifts the node by half its measured height', () => {
    reset()
    const n = node('bd', 'BeatDetect')
    n.position = { x: 40, y: 200 }
    useGraphStore.getState().addNode(n, true)
    // Before measurement, the node stays where it was dropped (top-left at y).
    expect(useGraphStore.getState().nodes.find((x) => x.id === 'bd')!.position.y).toBe(200)
    // React Flow measures the node → dimensions change carries its real height.
    useGraphStore.getState().onNodesChange([
      { id: 'bd', type: 'dimensions', dimensions: { width: 180, height: 140 }, setAttributes: true },
    ])
    // It settles centred on the drop point: y = 200 - 140/2.
    expect(useGraphStore.getState().nodes.find((x) => x.id === 'bd')!.position.y).toBe(130)
  })

  it('addNode without centreOnDrop leaves the node at its dropped position', () => {
    reset()
    const n = node('bd', 'BeatDetect')
    n.position = { x: 40, y: 200 }
    useGraphStore.getState().addNode(n)
    useGraphStore.getState().onNodesChange([
      { id: 'bd', type: 'dimensions', dimensions: { width: 180, height: 140 }, setAttributes: true },
    ])
    expect(useGraphStore.getState().nodes.find((x) => x.id === 'bd')!.position.y).toBe(200)
  })

  it.each(['MatrixOutput', 'MicInput'])('allows only one %s node on the canvas', (nodeType) => {
    reset([node('existing', nodeType)])
    useGraphStore.getState().addNode(node('added', nodeType))
    useGraphStore.getState().duplicateNode('existing')
    useGraphStore.getState().copyNode('existing')
    useGraphStore.getState().pasteNode({ x: 100, y: 100 })

    expect(useGraphStore.getState().nodes.filter((n) => n.data.nodeType === nodeType)).toHaveLength(1)
  })

  it('still allows multiple ordinary nodes', () => {
    reset([node('first', 'SolidColor')])
    useGraphStore.getState().addNode(node('second', 'SolidColor'))
    useGraphStore.getState().duplicateNode('first')

    expect(useGraphStore.getState().nodes.filter((n) => n.data.nodeType === 'SolidColor')).toHaveLength(3)
  })

  it('instantiatePattern with centreOnDrop lifts the Group node by half its measured height', () => {
    reset()
    const saved = {
      id: 'p1', name: 'MyPattern',
      inputs: [], outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [], edges: [] },
    } as unknown as import('../patternLibrary').SavedPattern
    useGraphStore.getState().instantiatePattern(saved, { x: 40, y: 300 }, true)
    const gn = useGraphStore.getState().nodes.find((n) => n.data.nodeType === 'Group')!
    expect(gn.position.y).toBe(300) // unmeasured: stays at drop point
    useGraphStore.getState().onNodesChange([
      { id: gn.id, type: 'dimensions', dimensions: { width: 180, height: 120 }, setAttributes: true },
    ])
    expect(useGraphStore.getState().nodes.find((n) => n.id === gn.id)!.position.y).toBe(240)
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

  it('ungroupNode restores the grouped nodes, rewires the boundary edges, and drops the wrapper subgraph', () => {
    const clamp = { ...node('c', 'Clamp', { value: 0.5, min: 0, max: 1 }), position: { x: -180, y: 100 } }
    const solid = { ...node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), position: { x: 20, y: 40 } }
    const mod = { ...node('bm', 'BrightnessMod'), position: { x: 140, y: 120 } }
    const out = { ...node('out', 'MatrixOutput'), position: { x: 620, y: 100 } }
    reset(
      [clamp, solid, mod, out],
      [
        edge('e1', 'sc', 'frame', 'bm', 'frame'),
        edge('e2', 'c', 'result', 'bm', 'brightness'),
        edge('e3', 'bm', 'frame', 'out', 'frame'),
      ],
    )

    const gid = useGraphStore.getState().createGroup('Dim', ['sc', 'bm'])
    const groupId = `groupnode-${gid}`
    useGraphStore.setState((s) => ({
      nodes: s.nodes.map((n) => n.id === groupId ? { ...n, position: { x: 300, y: 400 } } : n),
    }))

    expect(useGraphStore.getState().ungroupNode(groupId)).toBe(true)
    const s = useGraphStore.getState()

    expect(s.nodes.some((n) => n.id === groupId)).toBe(false)
    expect(s.graphData[gid]).toBeUndefined()
    expect(s.graphs[gid]).toBeUndefined()
    expect(s.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'sc', sourceHandle: 'frame', target: 'bm', targetHandle: 'frame' }),
      expect.objectContaining({ source: 'c', sourceHandle: 'result', target: 'bm', targetHandle: 'brightness' }),
      expect.objectContaining({ source: 'bm', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }),
    ]))
    expect(s.nodes.find((n) => n.id === 'sc')!.position).toEqual({ x: 240, y: 360 })
    expect(s.nodes.find((n) => n.id === 'bm')!.position).toEqual({ x: 360, y: 440 })
  })

  it('auto-exposes unconnected speed/energy ports as show-input roles, multiplied against the original slider value', () => {
    reset([node('n', 'Noise', { speed: 0.5, scale: 0.5, palette: 'rainbow' })], [])
    const gid = useGraphStore.getState().createGroup('Wavy', ['n'])
    const sub = useGraphStore.getState().graphData[gid]

    // One shared "speed" GroupInput was minted, plus a Math(multiply) feeding
    // Noise's speed port — no "energy" role since Noise has no energy port.
    const speedInputs = sub.nodes.filter(
      (n) => n.data.nodeType === 'GroupInput' && (n.data.properties as { paramId?: string }).paramId === 'speed',
    )
    expect(speedInputs).toHaveLength(1)
    expect(sub.nodes.some((n) => n.data.properties?.paramId === 'energy')).toBe(false)

    const mul = sub.nodes.find((n) => n.data.nodeType === 'Math')!
    expect(mul).toBeTruthy()
    expect(mul.data.properties.mathOp).toBe('multiply')
    expect(mul.data.properties.a).toBe(0.5)   // the node's own slider value, preserved
    expect(sub.edges.some((e) => e.source === speedInputs[0].id && e.target === mul.id && e.targetHandle === 'b')).toBe(true)
    expect(sub.edges.some((e) => e.source === mul.id && e.target === 'n' && e.targetHandle === 'speed')).toBe(true)

    // Standalone (undriven) behaviour is unchanged: GroupInput resolves to null,
    // the multiplier's `b` falls back to its identity default (1), so speed*1 = speed.
    const frameA = evaluateGraph(sub.nodes, sub.edges.concat(
      [{ id: 'e-out', source: 'n', sourceHandle: 'frame', target: sub.nodes.find((n) => n.data.nodeType === 'GroupOutput')!.id, targetHandle: 'frame' } as StudioEdge],
    ), 5, 4, 4, {})
    expect(frameA).toBeTruthy()
  })

  it('leaves an already-wired speed port alone instead of auto-exposing it', () => {
    reset(
      [node('wave', 'Sin'), node('n', 'Noise', { speed: 0.5, scale: 0.5, palette: 'rainbow' })],
      [edge('e1', 'wave', 'result', 'n', 'speed')],
    )
    const gid = useGraphStore.getState().createGroup('Wavy', ['wave', 'n'])
    const sub = useGraphStore.getState().graphData[gid]
    expect(sub.nodes.some((n) => n.data.nodeType === 'GroupInput')).toBe(false)
    expect(sub.nodes.some((n) => n.data.nodeType === 'Math')).toBe(false)
    // The original wire from Sin into Noise's speed port survives untouched.
    expect(sub.edges.some((e) => e.source === 'wave' && e.sourceHandle === 'result' && e.target === 'n' && e.targetHandle === 'speed')).toBe(true)
  })

  it('exposes an opted-in palette as a shared show-input role, replacing (not multiplying) the palette', () => {
    reset([node('n', 'Noise', { speed: 0.5, scale: 0.5, palette: 'rainbow' })], [])
    const gid = useGraphStore.getState().createGroup('Wavy', ['n'], { exposePaletteNodeIds: ['n'] })
    const sub = useGraphStore.getState().graphData[gid]
    const paletteInput = sub.nodes.find(
      (n) => n.data.nodeType === 'GroupInput' && (n.data.properties as { paramId?: string }).paramId === 'palette',
    )
    expect(paletteInput).toBeTruthy()
    expect((paletteInput!.data.outputs as { dataType?: string }[])[0].dataType).toBe('palette')
    expect(sub.edges.some((e) => e.source === paletteInput!.id && e.target === 'n' && e.targetHandle === 'paletteIn')).toBe(true)
  })

  it('does not auto-expose a palette unless explicitly opted in', () => {
    reset([node('n', 'Noise', { speed: 0.5, scale: 0.5, palette: 'rainbow' })], [])
    const gid = useGraphStore.getState().createGroup('Wavy', ['n'])
    const sub = useGraphStore.getState().graphData[gid]
    expect(sub.nodes.some((n) => n.data.properties?.paramId === 'palette')).toBe(false)
  })

  it('ungroupNode strips auto-generated group helper nodes back out of the canvas', () => {
    reset([node('n', 'Noise', { speed: 0.5, scale: 0.5, palette: 'rainbow' })], [])
    const gid = useGraphStore.getState().createGroup('Wavy', ['n'])

    expect(useGraphStore.getState().ungroupNode(`groupnode-${gid}`)).toBe(true)

    const types = useGraphStore.getState().nodes.map((n) => n.data.nodeType)
    expect(types).toEqual(['Noise'])
  })

  it('ungroupNode remaps colliding internal ids from instantiated patterns', () => {
    reset([node('sc', 'SolidColor'), node('out', 'MatrixOutput')], [])
    const saved = {
      id: 'pat-1', name: 'Blue', createdAt: 0,
      inputs: [], outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: {
        nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
        edges: [edge('inner', 'sc', 'frame', 'go', 'frame')],
      },
    } as unknown as import('../patternLibrary').SavedPattern

    useGraphStore.getState().instantiatePattern(saved, { x: 240, y: 120 })
    const group = useGraphStore.getState().nodes.find((n) => n.data.nodeType === 'Group')!
    useGraphStore.getState().onConnect({
      source: group.id, sourceHandle: 'frame', target: 'out', targetHandle: 'frame',
    })

    expect(useGraphStore.getState().ungroupNode(group.id)).toBe(true)

    const s = useGraphStore.getState()
    const ids = s.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(s.nodes.filter((n) => n.data.nodeType === 'SolidColor')).toHaveLength(2)
    expect(s.nodes.some((n) => n.id !== 'sc' && n.id.startsWith('sc-'))).toBe(true)
    expect(s.edges.find((e) => e.target === 'out' && e.targetHandle === 'frame')!.source).not.toBe('sc')
  })

  it('saveGroupToLibrary saves a Group node and returns its name', async () => {
    const { saveGroupToLibrary } = await import('../patternLibrary')
    const { usePatternLibrary } = await import('../patternLibrary')
    reset([node('sc', 'SolidColor', { r: 1, g: 2, b: 3 })], [])
    const gid = useGraphStore.getState().createGroup('MyPattern', ['sc'])
    usePatternLibrary.setState({ patterns: [] })
    const name = saveGroupToLibrary(`groupnode-${gid}`)
    expect(name).toBe('MyPattern')
    expect(usePatternLibrary.getState().patterns.some((p) => p.name === 'MyPattern')).toBe(true)
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

  it('refreshes stale saved categories from the node library on load', () => {
    const mic = node('mic', 'MicInput')
    mic.data.category = 'hardware' // pre-split save
    const music = node('lib', 'MusicLibrary')
    music.data.category = 'audio' // pre-show-category save
    useGraphStore.getState().loadGraph([mic, music], [])
    expect(dataOf('mic').category).toBe('input')
    expect(dataOf('lib').category).toBe('show')
  })

  it('refreshes stale saved ports from the node library on load', () => {
    const perf = node('pg', 'PerformanceGenerator')
    perf.data.inputs = [
      { id: 'songs', label: 'Songs', dataType: 'songs' },
      { id: 'patternset', label: 'Patterns', dataType: 'patternset' },
    ]
    perf.data.outputs = [
      { id: 'shows', label: 'Shows', dataType: 'shows' },
    ]
    const master = node('pm', 'PatternMaster')
    master.data.inputs = [
      { id: 'patternset', label: 'Patterns', dataType: 'patternset' },
      { id: 'beat', label: 'Beat', dataType: 'bool' },
    ]

    useGraphStore.getState().loadGraph([perf, master], [])

    expect(dataOf('pg').inputs).toEqual(
      NODE_LIBRARY.find((n) => n.type === 'PerformanceGenerator')!.inputs,
    )
    expect(dataOf('pg').outputs).toEqual(
      NODE_LIBRARY.find((n) => n.type === 'PerformanceGenerator')!.outputs,
    )
    expect(dataOf('pm').inputs).toEqual(
      NODE_LIBRARY.find((n) => n.type === 'PatternMaster')!.inputs,
    )
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

  it('Blend declares A as its frame-noodle splice input', () => {
    const blend = NODE_LIBRARY.find((n) => n.type === 'Blend')!
    expect(blend.spliceInput).toBe('a')
    expect(blend.inputs.find((p) => p.id === blend.spliceInput)?.dataType).toBe('frame')
    expect(blend.outputs.some((p) => p.dataType === 'frame')).toBe(true)
  })

  it('inserts Blend between frame nodes through its A input', () => {
    reset(
      [at(node('sc', 'SolidColor'), 0), at(node('out', 'MatrixOutput'), 600)],
      [edge('e1', 'sc', 'frame', 'out', 'frame')],
    )
    useGraphStore.getState().insertNodeOnEdge(node('blend', 'Blend'), 'e1', 'a', 'frame')
    const s = useGraphStore.getState()
    expect(s.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'sc', sourceHandle: 'frame', target: 'blend', targetHandle: 'a' }),
      expect.objectContaining({ source: 'blend', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }),
    ]))
    expect(s.edges.some((e) => e.target === 'blend' && e.targetHandle === 'b')).toBe(false)
  })

  it('splices an existing unconnected node into a noodle without duplicating it', () => {
    reset(
      [at(node('sc', 'SolidColor'), 0), at(node('inv', 'Invert'), 300), at(node('out', 'MatrixOutput'), 600)],
      [edge('e1', 'sc', 'frame', 'out', 'frame')],
    )
    useGraphStore.getState().spliceNodeOnEdge('inv', 'e1', 'frame', 'frame')
    const s = useGraphStore.getState()
    expect(s.nodes.filter((n) => n.id === 'inv')).toHaveLength(1)
    expect(s.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'sc', target: 'inv', targetHandle: 'frame' }),
      expect.objectContaining({ source: 'inv', sourceHandle: 'frame', target: 'out' }),
    ]))
    expect(s.edges.some((e) => e.id === 'e1')).toBe(false)
  })

  it('does not splice a canvas node that already has a connection', () => {
    reset(
      [at(node('sc', 'SolidColor'), 0), at(node('inv', 'Invert'), 300), at(node('out', 'MatrixOutput'), 600)],
      [edge('e1', 'sc', 'frame', 'out', 'frame'), edge('existing', 'sc', 'frame', 'inv', 'frame')],
    )
    useGraphStore.getState().spliceNodeOnEdge('inv', 'e1', 'frame', 'frame')
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(['e1', 'existing'])
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

  it('setPatternSections bulk-sets the "all" chip and clears back to any on re-toggle', () => {
    reset([node('coll', 'PatternCollection', { patternIds: ['g1'], patternSections: {} })])
    const setAll = useGraphStore.getState().setPatternSections
    const allSections = ['intro', 'verse', 'buildup', 'drop', 'chorus', 'bridge', 'outro']

    setAll('coll', 'g1', allSections)
    expect(sections('coll', 'g1')).toEqual(allSections)

    setAll('coll', 'g1', [])   // clearing back to "any" prunes the entry
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

describe('graphStore — group input roles', () => {
  beforeEach(() => reset())

  const groupInput = (id: string, paramId: string, dataType = 'float'): StudioNode => ({
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'In', nodeType: 'GroupInput', category: 'composite', properties: { paramId }, inputs: [], outputs: [{ id: 'out', dataType }] },
  } as unknown as StudioNode)
  const outType = (id: string) =>
    (useGraphStore.getState().nodes.find((n) => n.id === id)!.data.outputs as { dataType?: string }[])[0].dataType

  it('addGroupInput is a no-op at the root graph', () => {
    reset([node('sc', 'SolidColor')])
    useGraphStore.getState().addGroupInput()
    expect(useGraphStore.getState().nodes).toHaveLength(1)
  })

  it('addGroupInput adds a role-defaulted GroupInput inside a group and selects it', () => {
    reset([])
    useGraphStore.setState({ activeGraphId: 'g1', graphs: { g1: { id: 'g1', name: 'P' } } as never })
    useGraphStore.getState().addGroupInput()
    const s = useGraphStore.getState()
    const gi = s.nodes.find((n) => n.data.nodeType === 'GroupInput')!
    expect(gi.data.properties.paramId).toBe('energy')
    expect(s.selectedNodeId).toBe(gi.id)
  })

  it('setGroupInputRole keeps float edges for float roles but retypes + unwires for palette', () => {
    reset([groupInput('gi', 'energy'), node('bm', 'BrightnessMod')], [edge('e', 'gi', 'out', 'bm', 'brightness')])

    useGraphStore.getState().setGroupInputRole('gi', 'speed')   // float → float
    expect(useGraphStore.getState().nodes[0].data.properties.paramId).toBe('speed')
    expect(outType('gi')).toBe('float')
    expect(useGraphStore.getState().edges).toHaveLength(1)      // edge kept

    useGraphStore.getState().setGroupInputRole('gi', 'palette') // float → palette
    expect(outType('gi')).toBe('palette')
    expect(useGraphStore.getState().edges).toHaveLength(0)      // mismatched edge dropped
  })

  it('setGroupInputRole maps the empty role back to a plain input id', () => {
    reset([groupInput('gi', 'palette', 'palette')])
    useGraphStore.getState().setGroupInputRole('gi', '')
    expect(useGraphStore.getState().nodes[0].data.properties.paramId).toBe('param0')
    expect(outType('gi')).toBe('float')
  })
})
