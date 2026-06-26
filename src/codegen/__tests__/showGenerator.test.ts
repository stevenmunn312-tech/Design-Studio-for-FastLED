import { describe, it, expect } from 'vitest'
import { generateShowSketch, isPatternShow } from '../showGenerator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, inputs: unknown[] = [], outputs: unknown[] = []): StudioNode {
  return { id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs, outputs } } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string) =>
  ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th } as unknown as StudioEdge)

describe('showGenerator', () => {
  const groups = {
    g0: { nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
    g1: { nodes: [node('sc', 'SolidColor', { r: 255, g: 0, b: 0 }), node('go', 'GroupOutput')],
          edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
  }
  const nodes = [
    node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'] }),
    node('pm', 'PatternMaster', { minTime: 4, maxTime: 12, transitionSec: 1 }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
  ]
  const edges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')]

  it('detects a pattern show', () => {
    expect(isPatternShow(nodes)).toBe(true)
    expect(isPatternShow([node('x', 'SolidColor')])).toBe(false)
  })

  it('emits a render function per pattern and a controller', () => {
    const cpp = generateShowSketch(nodes, edges, groups)
    expect(cpp).toContain('#define PATTERN_COUNT 2')
    expect(cpp).toContain('void render_p0(uint32_t ms)')
    expect(cpp).toContain('void render_p1(uint32_t ms)')
    expect(cpp).toContain('void renderPattern(uint8_t i, uint32_t ms)')
    expect(cpp).toContain('case 0: render_p0(ms); break;')
    expect(cpp).toContain('void setup()')
    expect(cpp).toContain('void loop()')
    // The crossfade compositing between outgoing/incoming patterns.
    expect(cpp).toContain('blend(showA[i], leds[i], mix)')
    // Each pattern's body actually renders (the SolidColor fill reaches leds).
    expect(cpp).toMatch(/render_p0[\s\S]*CRGB\(0, 0, 255\)[\s\S]*?\n\}/)
  })

  it('handles a Pattern Master with no patterns', () => {
    const lone = [node('pm', 'PatternMaster', {}), node('out', 'MatrixOutput', {})]
    expect(generateShowSketch(lone, [], {})).toContain('no patterns')
  })
})
