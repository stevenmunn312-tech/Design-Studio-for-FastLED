import { describe, it, expect } from 'vitest'
import { evaluateGraphFull } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { StudioNode, StudioEdge } from '../graphStore'
import type { OledSurface } from '../oledSurface'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
function edge(id: string, s: string, sh: string, t: string, th: string): StudioEdge {
  return { id, source: s, target: t, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

// Two patterns and a one-second interval, so the panels have something that
// visibly changes between publishes: the slideshow advances, and the browser
// screen and the ordinal on the digits follow it.
const GROUPS = {
  'grp-a': {
    nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 40 }), node('go', 'GroupOutput')],
    edges: [edge('eg', 'sc', 'frame', 'go', 'frame')],
  },
  'grp-b': {
    nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 200 }), node('go', 'GroupOutput')],
    edges: [edge('eg', 'sc', 'frame', 'go', 'frame')],
  },
}

const graph = () => ({
  nodes: [
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
    node('coll', 'PatternCollection', { patternIds: ['grp-a', 'grp-b'] }),
    node('w', 'PatternSlideshow', {
      order: 'Sequential', interval: 1, transitionsEnabled: false,
    }),
    node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64' }),
    node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19 }),
  ],
  edges: [
    edge('e0', 'coll', 'patternset', 'w', 'patternset'),
    edge('e1', 'w', 'display', 'oled', 'display'),
    edge('e2', 'w', 'display', 'seg', 'display'),
    edge('e3', 'w', 'frame', 'out', 'frame'),
  ],
})

/*
 * The preview loop evaluates only the "hot" set on frames it does not publish.
 * A display left out of that set updates at the publish cadence rather than
 * per frame, so a wired progress bar crawls while its input moves smoothly —
 * and everything feeding the display is skipped with it.
 */
describe('displays are evaluated every frame', () => {
  it.each(['oled', 'seg'])('evaluates %s on a non-publish frame', (id) => {
    const { nodes, edges } = graph()
    expect(evaluateGraphFull(nodes, edges, 30, 8, 8, GROUPS, false).outputs.has(id)).toBe(true)
  })

  it('keeps what feeds a display hot too', () => {
    const { nodes, edges } = graph()
    expect(evaluateGraphFull(nodes, edges, 30, 8, 8, GROUPS, false).outputs.has('w')).toBe(true)
  })

  // The point of being hot: the drawn pixels follow the source between
  // publishes rather than crawling at the publish cadence.
  it('redraws the panel as the source moves', () => {
    const { nodes, edges } = graph()
    const lit = (tick: number) => {
      const surface = evaluateGraphFull(nodes, edges, tick, 8, 8, GROUPS, false)
        .outputs.get('oled')?.surface as OledSurface
      return surface.data.reduce((sum, byte) => sum + byte.toString(2).split('1').length - 1, 0)
    }
    // One interval is 60 ticks, so the second sample is a pattern later: a
    // different name, a different ordinal and a different picture.
    const counts = [10, 130].map(lit)
    expect(new Set(counts).size).toBeGreaterThan(1)
  })

  it('still evaluates a display with no LED output in the graph at all', () => {
    const oled = node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64' })
    expect(evaluateGraphFull([oled], [], 0, 8, 8, {}, false).outputs.has('oled')).toBe(true)
  })
})
