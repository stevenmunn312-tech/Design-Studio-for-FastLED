// The pre-1.0 alias table (preV1Aliases.ts): a save made before round eight's
// renames opens as the new shape and generates the same firmware as a save
// written with the new ids. The old ids below are written out as literals on
// purpose: this file and the table are the only places that may name them, and
// both go when the table is removed in todo.md HW-18.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_LIBRARY } from '../nodeLibrary'
import { generateCpp } from '../../codegen/cppGenerator'
import { useGraphStore } from '../graphStore'
import type { StudioEdge, StudioNode } from '../graphStore'
import { useUiStore } from '../uiStore'
import { buildProjectSnapshot, parseProjectFile, serializeProject } from '../../utils/projectFileIO'
import { buildShareUrl, readSharedWorkspace } from '../../utils/shareGraph'
import { parseLibraryBundle } from '../library/libraryBundle'
import { isContentKnown, reloadKnownContentForTests, clearPatternContentTrustForTests } from '../patterns/patternTrust'
import {
  PRE_V1_TYPE_ALIASES,
  upgradePreV1Content,
  upgradePreV1Properties,
  upgradePreV1Workspace,
} from '../preV1Aliases'
import { blankDeckConfig } from '../player/performanceDeck'
import type { PerformanceDeckConfig } from '../player/performanceDeck'

// ── Fixtures ───────────────────────────────────────────────────────────────

const definition = (type: string) => {
  const found = NODE_LIBRARY.find((def) => def.type === type)
  if (!found) throw new Error(`no node type ${type}`)
  return found
}

type PortMap = Record<string, string>

function make(id: string, oldType: string | null, type: string, properties: Record<string, unknown>, oldPorts: { inputs?: PortMap; outputs?: PortMap } = {}): StudioNode {
  const def = definition(type)
  const rename = (ports: { id: string }[], map: PortMap = {}) => ports.map((port) => ({ ...port, id: map[port.id] ?? port.id }))
  return {
    id,
    type: 'studioNode',
    position: { x: 10, y: 20 },
    data: {
      label: def.label,
      nodeType: oldType ?? type,
      category: def.category,
      properties,
      inputs: oldType ? rename(def.inputs, oldPorts.inputs) : def.inputs,
      outputs: oldType ? rename(def.outputs, oldPorts.outputs) : def.outputs,
    },
  } as unknown as StudioNode
}

const wire = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id, source, sourceHandle, target, targetHandle }) as unknown as StudioEdge

/** What a save looked like before the renames, node by node: the old type id,
 *  the old port ids and the old property keys, as literals. */
function oldGraph() {
  const nodes = [
    make('clk', 'Clock', 'TempoClock', { bpm: 120, beatsPerBar: 4, subdivision: 2 }, { outputs: { subdivision: 'sub' } }),
    make('sch', null, 'ScheduleTrigger', { enable: true, scheduleMode: 'Window' }, {}),
    make('vb', null, 'Vibe', { gain: 1 }),
    make('sw', null, 'Switch', { a: 0, b: 1, select: false }),
    make('w', null, 'Wave', { frequency: 0.5 }),
    make('nz', null, 'Noise', {}),
    make('pl', null, 'Plasma', {}),
    make('ft', null, 'FrameTransform', { rotate: 30, rotateRate: 10 }),
    make('fsw', null, 'FrameSwitch', { select: false }),
    make('hs', null, 'HueShift', { shift: 0.25 }),
    make('bk', null, 'BeatKaleidoscope', { hue: 120 }),
    make('tmp', 'Temperature', 'ColorTemperature', { kelvin: 3000 }),
    make('hsv', null, 'RGBToHSV', {}),
    make('fp', 'CustomFormula', 'FormulaPattern', { formula: 'sin(x + t)' }),
    make('hh', 'PrismStorm', 'HiHatShards', { speed: 0.5 }),
    make('sym', 'Symmetry', 'TileSymmetry', { group: 'p6m' }),
    make('nr', 'Ripple', 'NetworkRipple', { behaviour: 'left' }),
    make('cc', 'Sequencer', 'CrossfadeCycle', { interval: 4, fade: 1 }),
    make('tp', 'TransitionSet', 'TransitionPool', { transitions: ['iris'] }),
    make('fw', 'FieldWarp', 'FieldTransform', { rotation: 10 }),
    make('out', null, 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 }),
  ]
  // The Vibe, Switch, Frame Switch, Schedule Trigger, RGB to HSV and Frame
  // Transform nodes carry their old port ids too.
  const oldPorts: Record<string, { inputs?: PortMap; outputs?: PortMap }> = {
    vb: { outputs: { mids: 'mid', midsAtt: 'midAtt', midsSpike: 'midSpike' } },
    sw: { inputs: { select: 'sel' } },
    fsw: { inputs: { select: 'sel' } },
    sch: { inputs: { enabled: 'enable' } },
    hsv: { inputs: { color: 'rgb' } },
    ft: { inputs: { rotation: 'rotate', rotationRate: 'rotateRate' } },
    hs: { inputs: { hueShift: 'shift' } },
    bk: { inputs: { hueShift: 'hue' } },
  }
  const legacyNodes = nodes.map((node) => {
    const map = oldPorts[node.id]
    if (!map) return node
    const rename = (ports: { id: string }[], table: PortMap = {}) => ports.map((port) => ({ ...port, id: table[port.id] ?? port.id }))
    const data = node.data as unknown as { inputs: { id: string }[]; outputs: { id: string }[] }
    return { ...node, data: { ...node.data, inputs: rename(data.inputs, map.inputs), outputs: rename(data.outputs, map.outputs) } } as StudioNode
  })
  const edges = [
    wire('e1', 'clk', 'sub', 'sch', 'enable'),
    wire('e2', 'vb', 'mid', 'sw', 'a'),
    wire('e3', 'vb', 'midAtt', 'sw', 'b'),
    wire('e4', 'vb', 'midSpike', 'sw', 'sel'),
    wire('e5', 'sw', 'result', 'ft', 'rotate'),
    wire('e6', 'w', 'result', 'ft', 'rotateRate'),
    wire('e7', 'nz', 'frame', 'ft', 'frame'),
    wire('e8', 'ft', 'frame', 'fsw', 'a'),
    wire('e9', 'pl', 'frame', 'fsw', 'b'),
    wire('e10', 'clk', 'sub', 'fsw', 'sel'),
    wire('e11', 'fsw', 'frame', 'sym', 'frame'),
    wire('e16', 'sym', 'frame', 'cc', 'p0'),
    wire('e17', 'fp', 'frame', 'cc', 'p1'),
    wire('e18', 'hh', 'frame', 'cc', 'p2'),
    wire('e19', 'nr', 'frame', 'cc', 'p3'),
    wire('e20', 'cc', 'frame', 'hs', 'frame'),
    // Wired into the old 0-1 Hue Shift input: cannot be carried over.
    wire('e12', 'w', 'result', 'hs', 'shift'),
    wire('e13', 'w', 'result', 'bk', 'hue'),
    wire('e14', 'tmp', 'color', 'hsv', 'rgb'),
    wire('e15', 'hs', 'frame', 'out', 'frame'),
  ]
  return { nodes: legacyNodes, edges }
}

/** The same graph as a current save writes it. */
function currentGraph() {
  const nodes = [
    make('clk', null, 'TempoClock', { bpm: 120, beatsPerBar: 4, subdivision: 2 }),
    make('sch', null, 'ScheduleTrigger', { enabled: true, scheduleMode: 'Window' }),
    make('vb', null, 'Vibe', { gain: 1 }),
    make('sw', null, 'Switch', { a: 0, b: 1, select: false }),
    make('w', null, 'Wave', { frequency: 0.5 }),
    make('nz', null, 'Noise', {}),
    make('pl', null, 'Plasma', {}),
    make('ft', null, 'FrameTransform', { rotation: 30, rotationRate: 10 }),
    make('fsw', null, 'FrameSwitch', { select: false }),
    make('hs', null, 'HueShift', { hueShift: 90 }),
    make('bk', null, 'BeatKaleidoscope', { hueShift: 120 }),
    make('tmp', null, 'ColorTemperature', { kelvin: 3000 }),
    make('hsv', null, 'RGBToHSV', {}),
    make('fp', null, 'FormulaPattern', { formula: 'sin(x + t)' }),
    make('hh', null, 'HiHatShards', { speed: 0.5 }),
    make('sym', null, 'TileSymmetry', { group: 'p6m' }),
    make('nr', null, 'NetworkRipple', { behaviour: 'left' }),
    make('cc', null, 'CrossfadeCycle', { interval: 4, fade: 1 }),
    make('tp', null, 'TransitionPool', { transitions: ['iris'] }),
    make('fw', null, 'FieldTransform', { rotation: 10 }),
    make('out', null, 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 }),
  ]
  const edges = [
    wire('e1', 'clk', 'subdivision', 'sch', 'enabled'),
    wire('e2', 'vb', 'mids', 'sw', 'a'),
    wire('e3', 'vb', 'midsAtt', 'sw', 'b'),
    wire('e4', 'vb', 'midsSpike', 'sw', 'select'),
    wire('e5', 'sw', 'result', 'ft', 'rotation'),
    wire('e6', 'w', 'result', 'ft', 'rotationRate'),
    wire('e7', 'nz', 'frame', 'ft', 'frame'),
    wire('e8', 'ft', 'frame', 'fsw', 'a'),
    wire('e9', 'pl', 'frame', 'fsw', 'b'),
    wire('e10', 'clk', 'subdivision', 'fsw', 'select'),
    wire('e11', 'fsw', 'frame', 'sym', 'frame'),
    wire('e16', 'sym', 'frame', 'cc', 'p0'),
    wire('e17', 'fp', 'frame', 'cc', 'p1'),
    wire('e18', 'hh', 'frame', 'cc', 'p2'),
    wire('e19', 'nr', 'frame', 'cc', 'p3'),
    wire('e20', 'cc', 'frame', 'hs', 'frame'),
    wire('e13', 'w', 'result', 'bk', 'hueShift'),
    wire('e14', 'tmp', 'color', 'hsv', 'color'),
    wire('e15', 'hs', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

const OLD_IDS = Object.keys(PRE_V1_TYPE_ALIASES)

/** The firmware a graph generates, plus a check that it is not empty. */
function firmware(nodes: StudioNode[], edges: StudioEdge[]): string {
  const cpp = generateCpp(nodes, edges)
  expect(cpp).toContain('n_clk_subdivision')
  expect(cpp).toContain('n_vb_mids')
  expect(cpp).toContain('_dh = (90)')
  return cpp
}

const typesById = (nodes: StudioNode[]) => Object.fromEntries(nodes.map((node) => [node.id, node.data.nodeType]))
const byId = (nodes: StudioNode[]) => Object.fromEntries(nodes.map((node) => [node.id, node]))

beforeEach(() => {
  localStorage.clear()
  clearPatternContentTrustForTests()
})

// ── The table ──────────────────────────────────────────────────────────────

describe('the alias table', () => {
  it('maps the nine retired ids to node types that exist, and none of them still exists', () => {
    expect(OLD_IDS.sort()).toEqual([
      'Clock', 'CustomFormula', 'FieldWarp', 'PrismStorm', 'Ripple', 'Sequencer', 'Symmetry', 'Temperature', 'TransitionSet',
    ])
    const known = new Set(NODE_LIBRARY.map((def) => def.type))
    for (const [oldId, newId] of Object.entries(PRE_V1_TYPE_ALIASES)) {
      expect(known.has(oldId), oldId).toBe(false)
      expect(known.has(newId), newId).toBe(true)
    }
  })

  it('leaves a save already in the new shape untouched, by identity', () => {
    const { nodes, edges } = currentGraph()
    const result = upgradePreV1Content(nodes, edges)
    expect(result.nodes).toBe(nodes)
    expect(result.edges).toBe(edges)
    expect(result.retiredWires).toBe(0)
  })

  it('upgrades an old graph to exactly the new one, and a second pass changes nothing', () => {
    const old = oldGraph()
    const result = upgradePreV1Content(old.nodes, old.edges)
    const current = currentGraph()
    expect(result.retiredWires).toBe(1)
    expect(byId(result.nodes)).toEqual(byId(current.nodes))
    expect(result.edges).toEqual(current.edges)
    const again = upgradePreV1Content(result.nodes, result.edges)
    expect(again.nodes).toBe(result.nodes)
    expect(again.edges).toBe(result.edges)
  })

  it('applies the Clock output rename after the type alias', () => {
    const old = oldGraph()
    const result = upgradePreV1Content(old.nodes, old.edges)
    expect(typesById(result.nodes).clk).toBe('TempoClock')
    expect(result.edges.find((edge) => edge.id === 'e1')?.sourceHandle).toBe('subdivision')
  })

  it('renames only the named node types: a Wave input called sel is left alone', () => {
    const groupish = make('g', null, 'Wave', {})
    const edgeIn = wire('x', 'w', 'result', 'g', 'sel')
    const result = upgradePreV1Content([make('w', null, 'Wave', {}), groupish], [edgeIn])
    expect(result.edges[0].targetHandle).toBe('sel')
  })
})

describe('Hue Shift and Beat Kaleidoscope', () => {
  it('turns Hue Shift turns into degrees exactly', () => {
    for (const turns of [0, 0.25, 0.5, 1, 1 / 3, 0.1, 0.123456, -0.5, 2]) {
      expect(upgradePreV1Properties('HueShift', { shift: turns })).toEqual({ hueShift: turns * 360 })
    }
    expect(upgradePreV1Properties('HueShift', { shift: 0.25 })).toEqual({ hueShift: 90 })
    expect(upgradePreV1Properties('HueShift', { shift: 1 })).toEqual({ hueShift: 360 })
  })

  it('renames Beat Kaleidoscope hue without rescaling it', () => {
    expect(upgradePreV1Properties('BeatKaleidoscope', { hue: 200, reactivity: 0.7 })).toEqual({ hueShift: 200, reactivity: 0.7 })
  })

  it('never overwrites a hueShift the save already has', () => {
    expect(upgradePreV1Properties('HueShift', { shift: 0.5, hueShift: 45 })).toEqual({ hueShift: 45 })
  })

  it('removes a wire into the old 0-1 Hue Shift input, and keeps the converted property', () => {
    const old = oldGraph()
    const result = upgradePreV1Content(old.nodes, old.edges)
    expect(result.edges.some((edge) => edge.id === 'e12')).toBe(false)
    expect(result.edges.some((edge) => edge.targetHandle === 'hueShift' && edge.target === 'hs')).toBe(false)
    const hueShift = result.nodes.find((node) => node.id === 'hs')!.data.properties.hueShift
    expect(hueShift).toBe(90)
  })

  it('keeps a wire into Beat Kaleidoscope hue: it already carried degrees', () => {
    const old = oldGraph()
    const result = upgradePreV1Content(old.nodes, old.edges)
    expect(result.edges.find((edge) => edge.id === 'e13')).toMatchObject({ target: 'bk', targetHandle: 'hueShift' })
  })

  it('follows a pinned Hue Shift control and its scenes into degrees', () => {
    const hs = make('hs', null, 'HueShift', { shift: 0.5 })
    const deck: PerformanceDeckConfig = {
      ...blankDeckConfig(),
      pins: [
        { id: 'p1', nodeId: 'hs', propertyKey: 'shift', label: 'Shift', kind: 'knob', min: 0, max: 1, step: 0.01, createdAt: 1 },
        { id: 'p2', nodeId: 'w', propertyKey: 'frequency', label: 'Rate', kind: 'knob', min: 0, max: 2, createdAt: 1 },
      ],
      scenes: [{ id: 's1', name: 'One', values: { p1: 0.25, p2: 1 }, createdAt: 1, updatedAt: 1 }],
    }
    const { workspace } = upgradePreV1Workspace({ nodes: [hs, make('w', null, 'Wave', {})], edges: [], performanceDeck: deck })
    expect(workspace.performanceDeck!.pins[0]).toMatchObject({ propertyKey: 'hueShift', min: 0, max: 360, step: 0.01 * 360 })
    expect(workspace.performanceDeck!.pins[1]).toMatchObject({ propertyKey: 'frequency', max: 2 })
    expect(workspace.performanceDeck!.scenes[0].values).toEqual({ p1: 90, p2: 1 })
  })
})

// ── Every way a save arrives ───────────────────────────────────────────────

describe('an old save reads as the new shape, with the same firmware', () => {
  const current = currentGraph()
  const expected = firmware(current.nodes, current.edges)

  it('as a project file', () => {
    const old = oldGraph()
    const text = serializeProject(buildProjectSnapshot({ nodes: old.nodes, edges: old.edges }, { name: 'Old' }))
    for (const id of OLD_IDS) expect(text).toContain(`"${id}"`)
    const parsed = parseProjectFile(text, 'Old')
    expect(parsed.dropped).toBe(1)
    expect(typesById(parsed.project.workspace.nodes)).toEqual(typesById(current.nodes))
    expect(firmware(parsed.project.workspace.nodes, parsed.project.workspace.edges)).toBe(expected)
  })

  it('as a share link', () => {
    const old = oldGraph()
    const url = buildShareUrl({ nodes: old.nodes, edges: old.edges })
    window.location.hash = new URL(url).hash
    const read = readSharedWorkspace()
    window.location.hash = ''
    expect(read).not.toBeNull()
    expect(read!.dropped).toBe(1)
    expect(firmware(read!.workspace.nodes, read!.workspace.edges)).toBe(expected)
  })

  it('as a pattern file, nested groups included', () => {
    const old = oldGraph()
    const legacyGroup = { nodes: [make('c2', 'Clock', 'TempoClock', { bpm: 90 }, { outputs: { subdivision: 'sub' } })], edges: [] }
    const file = JSON.stringify({
      id: 'old-pattern',
      name: 'Old pattern',
      createdAt: 1,
      inputs: [],
      outputs: [],
      subgraph: { nodes: old.nodes, edges: old.edges },
      groups: { g1: legacyGroup },
    })
    const parsed = parseLibraryBundle(file)
    const pattern = parsed.bundle?.patterns?.[0]
    expect(pattern).toBeTruthy()
    expect(typesById(pattern!.subgraph.nodes)).toEqual(typesById(current.nodes))
    expect(firmware(pattern!.subgraph.nodes, pattern!.subgraph.edges)).toBe(expected)
    expect(pattern!.groups?.g1.nodes[0].data.nodeType).toBe('TempoClock')
  })

  it('as an autosave or recovery snapshot, through loadGraph', () => {
    const old = oldGraph()
    useUiStore.getState().setStatus('Ready')
    useGraphStore.getState().loadGraph(old.nodes, old.edges)
    const loaded = useGraphStore.getState()
    expect(typesById(loaded.nodes.filter((node) => node.id !== 'board' && current.nodes.some((n) => n.id === node.id))))
      .toEqual(typesById(current.nodes))
    expect(useUiStore.getState().statusText).toContain('Hue Shift')
    const drawn = loaded.nodes.filter((node) => current.nodes.some((n) => n.id === node.id))
    expect(firmware(drawn, loaded.edges)).toBe(expected)
  })

  it('as a pattern already in the browser library', async () => {
    const old = oldGraph()
    localStorage.setItem('design-studio-for-fastled.pattern-library.v1', JSON.stringify([{
      id: 'old-pattern', name: 'Old pattern', createdAt: 1, inputs: [], outputs: [],
      subgraph: { nodes: old.nodes, edges: old.edges },
    }]))
    vi.resetModules()
    const { usePatternLibrary } = await import('../patterns/patternLibrary')
    const pattern = usePatternLibrary.getState().patterns.find((entry) => entry.id === 'old-pattern')
    expect(pattern).toBeTruthy()
    expect(typesById(pattern!.subgraph.nodes)).toEqual(typesById(current.nodes))
    expect(firmware(pattern!.subgraph.nodes, pattern!.subgraph.edges)).toBe(expected)
  })

  it('remembers formulas trusted under the old id', () => {
    localStorage.setItem('design-studio-for-fastled.known-content.v2', JSON.stringify([
      '{"nodeType":"CustomFormula","properties":{"formula":"sin(x + t)"}}',
    ]))
    reloadKnownContentForTests()
    expect(isContentKnown([make('fp', null, 'FormulaPattern', { formula: 'sin(x + t)' })])).toBe(true)
    expect(isContentKnown([make('fp', null, 'FormulaPattern', { formula: 'cos(x)' })])).toBe(false)
  })
})
