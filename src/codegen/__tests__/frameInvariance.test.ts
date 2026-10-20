import { describe, expect, it } from 'vitest'
import {
  COSTLY_INVARIANT_NODE_TYPES, FRAME_INVARIANT_NODE_TYPES, frameInvariantNodeIds, frozenNodeIds, readsFrameVaryingState,
} from '../frameInvariance'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { evaluateGraph } from '../../state/graphEvaluator'
import { estimateFirmwareRam } from '../../utils/validateGraph'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern',
      properties: { ...libraryDefaults(nodeType), ...props },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const output = () => node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, serpentine: false })
/** Properties that make an invariant type draw without the time. */
const STILL: Record<string, Record<string, unknown>> = { FieldFormula: { formula: 'x / W' } }

/** The type wired from invariant sources and shown through the output. */
function graphFor(nodeType: string): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  const nodes = [
    node('n', nodeType, STILL[nodeType]), output(), node('g', 'GradientFrame'),
    node('ff', 'FieldToFrame'), node('lin', 'FieldFormula', { formula: 'x / W' }),
  ]
  const edges: StudioEdge[] = []
  for (const input of def.inputs ?? []) {
    if (input.dataType === 'frame') edges.push(edge(`i${input.id}`, 'g', 'frame', 'n', input.id))
    if (input.dataType === 'field') edges.push(edge(`i${input.id}`, 'lin', 'field', 'n', input.id))
  }
  const frame = (def.outputs ?? []).find((port) => port.dataType === 'frame')
  const field = (def.outputs ?? []).find((port) => port.dataType === 'field')
  if (frame) edges.push(edge('e', 'n', frame.id, 'out', 'frame'))
  else edges.push(edge('e1', 'n', field!.id, 'ff', 'field'), edge('e2', 'ff', 'frame', 'out', 'frame'))
  return { nodes, edges }
}

describe('frame-invariant node types', () => {
  it('draw the same preview at any time, wired from invariant sources', () => {
    const moving: string[] = []
    for (const nodeType of FRAME_INVARIANT_NODE_TYPES) {
      const { nodes, edges } = graphFor(nodeType)
      const frames = [0, 3700, 91234].map((tick) => JSON.stringify(evaluateGraph(nodes, edges, tick, 8, 8)))
      if (frames.some((frame) => frame !== frames[0])) moving.push(nodeType)
    }
    expect(moving).toEqual([])
  })

  it('lists only invariant types as costly', () => {
    for (const nodeType of COSTLY_INVARIANT_NODE_TYPES) expect(FRAME_INVARIANT_NODE_TYPES.has(nodeType)).toBe(true)
  })

  it('admits a node only when every source is admitted', () => {
    const nodes = [node('a', 'GradientFrame'), node('p', 'Plasma'), node('m', 'Mask'), node('k', 'Kaleidoscope')]
    const ids = frameInvariantNodeIds(nodes, [
      edge('1', 'a', 'frame', 'k', 'frame'),
      edge('2', 'p', 'frame', 'm', 'frame'), edge('3', 'a', 'frame', 'm', 'mask'),
    ])
    expect([...ids].sort()).toEqual(['a', 'k'])
    const bypassed = node('k', 'Kaleidoscope', { bypassed: true })
    expect(frameInvariantNodeIds([nodes[0], bypassed], [edge('1', 'a', 'frame', 'k', 'frame')]).has('k')).toBe(false)
  })
})

describe('emitted-block check', () => {
  it('refuses anything that can vary or cannot be wrapped', () => {
    expect(readsFrameVaryingState(['  fill_solid(buf_a, NUM_LEDS, CRGB(1, 2, 3));'])).toBe(false)
    expect(readsFrameVaryingState(['  for (int i = 0; i < NUM_LEDS; i++) { float v = i; buf_a[i] = CRGB(v, 0, 0); }'])).toBe(false)
    expect(readsFrameVaryingState(['  float _s = sinf(t);'])).toBe(true)
    expect(readsFrameVaryingState(['  buf_a[0] = CRGB(random8(), 0, 0);'])).toBe(true)
    expect(readsFrameVaryingState(['  static uint8_t _hue = 0;'])).toBe(true)
    expect(readsFrameVaryingState(['  float v_a_out = 1.0f;'])).toBe(true)
    expect(readsFrameVaryingState(['  {'])).toBe(true)
    expect(readsFrameVaryingState(['  // t is not read here', '  buf_a[0] = CRGB::Red;'])).toBe(false)
  })

  it('freezes a costly node, and a cheap one only under frozen readers', () => {
    const block = (id: string, nodeType: string, text = `  fill_solid(buf_${id}, NUM_LEDS, CRGB::Red);`) =>
      ({ id, nodeType, block: [text], ownsBuffer: true })
    const edges = [edge('1', 'a', 'frame', 'k', 'frame'), edge('2', 'k', 'frame', 'out', 'frame')]
    const candidates = new Set(['a', 'k'])
    expect([...frozenNodeIds([block('a', 'SolidColor'), block('k', 'Kaleidoscope')], edges, candidates)].sort()).toEqual(['a', 'k'])
    // The output reading `a` directly does not freeze, so neither does `a`.
    expect(frozenNodeIds([block('a', 'SolidColor')], [edge('1', 'a', 'frame', 'out', 'frame')], candidates).size).toBe(0)
    // A source that reads the time keeps its reader live too.
    expect(frozenNodeIds([block('a', 'SolidColor', '  fill_solid(buf_a, NUM_LEDS, CHSV(t, 255, 255));'), block('k', 'Kaleidoscope')], edges, candidates).size).toBe(0)
  })
})

describe('the normal sketch', () => {
  const sketch = (formula: string) => {
    const nodes = [node('fx', 'FieldFormula', { formula }), node('ff', 'FieldToFrame'), output()]
    const edges = [edge('e1', 'fx', 'field', 'ff', 'field'), edge('e2', 'ff', 'frame', 'out', 'frame')]
    return { nodes, edges, cpp: generateCpp(nodes, edges) }
  }

  it('draws a formula of x and y once, into a field it keeps', () => {
    const { cpp } = sketch('sqrt(x * x + y * y) / W')
    expect(cpp).toContain('static bool _drawn_fx = false;')
    expect(cpp).toContain('float field_fx[NUM_LEDS];   // keeps its pixels between frames')
  })

  it('draws a formula of the time every frame', () => {
    expect(sketch('sin(x + t)').cpp).not.toContain('_drawn_fx')
  })

  it('counts the buffer a frozen node then keeps', () => {
    const nodes = [node('g', 'GradientFrame'), node('k', 'Kaleidoscope'), output()]
    const edges = [edge('1', 'g', 'frame', 'k', 'frame'), edge('2', 'k', 'frame', 'out', 'frame')]
    expect(generateCpp(nodes, edges)).toContain('CRGB buf_k[NUM_LEDS];   // keeps its pixels between frames')
    const live = [node('p', 'Plasma'), node('k', 'Kaleidoscope'), output()]
    const liveEdges = [edge('1', 'p', 'frame', 'k', 'frame'), edge('2', 'k', 'frame', 'out', 'frame')]
    expect(generateCpp(live, liveEdges)).toContain('CRGB* const buf_k = leds;')
    // One more 8×8 CRGB frame than the same chain fed by a moving source.
    expect(estimateFirmwareRam(nodes, edges)!.frameBufferBytes - estimateFirmwareRam(live, liveEdges)!.frameBufferBytes).toBe(8 * 8 * 3)
  })

  it('leaves a collected pattern live in a show', () => {
    const groups = {
      still: {
        nodes: [node('g', 'GradientFrame'), node('k', 'Kaleidoscope'), node('go', 'GroupOutput')],
        edges: [edge('1', 'g', 'frame', 'k', 'frame'), edge('2', 'k', 'frame', 'go', 'frame')],
      },
    } as unknown as GroupRegistry
    const cpp = generateShowSketch([
      node('pc', 'PatternCollection', { patternIds: ['still'] }), node('pm', 'PatternSlideshow'), output(),
    ], [edge('a', 'pc', 'patternset', 'pm', 'patternset'), edge('b', 'pm', 'frame', 'out', 'frame')], groups)
    expect(cpp).not.toContain('_drawn_')
  })
})
