import { beforeEach, describe, expect, it } from 'vitest'
import { generateShowSketch } from '../showGenerator'
import { SHOW_PATTERN_INDEX, SHOW_SELECTION_STEM } from '../player/showControlRouting'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { resetEvaluatorState, type GroupRegistry } from '../../state/graphEvaluator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { resolveBuildMode } from '../../state/upload/buildMode'
import { showStatusGeometry, TRANSPORT_ARTWORK_H, TRANSPORT_ARTWORK_W } from '../../state/displays/transportDisplay'
import { bakeDisplayArtworks } from '../../utils/transportArtworks'
import { assertWireable } from '../../test-utils/assertWireable'

/**
 * Show Status pictures the slideshow's running pattern.
 *
 * End to end through the same scoping the upload paths use: the build mode
 * names the engine, the bake follows it, and the show sketch emits the table
 * and the blit together — or, with nothing baked, neither.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: def?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
  } } as StudioNode
}
const edge = (s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id: `${s}-${sh}-${t}-${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th }) as StudioEdge

const groups = {
  p: { nodes: [node('red', 'SolidColor', { r: 255, g: 0, b: 0 }), node('go', 'GroupOutput')],
    edges: [edge('red', 'frame', 'go', 'frame')] },
  q: { nodes: [node('blue', 'SolidColor', { r: 0, g: 0, b: 255 }), node('go', 'GroupOutput')],
    edges: [edge('blue', 'frame', 'go', 'frame')] },
} as unknown as GroupRegistry

function graph(patternIds: string[] = ['p', 'q']) {
  const nodes = [
    node('collection', 'PatternCollection', { patternIds }),
    node('show', 'PatternSlideshow'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    node('panel', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Show Status' }),
  ]
  const edges = [
    edge('collection', 'patternset', 'show', 'patternset'),
    edge('show', 'frame', 'out', 'frame'),
    edge('show', 'display', 'panel', 'display'),
  ]
  assertWireable(nodes, edges)
  return { nodes, edges }
}

function generate(nodes: StudioNode[], edges: StudioEdge[], bake: boolean): string {
  const build = resolveBuildMode(nodes, edges)
  expect(build.mode).toBe('show')
  const artworks = bake
    ? bakeDisplayArtworks(nodes, edges, groups, true, build.templateDisplaySourceIds ?? undefined)
    : {}
  return generateShowSketch(nodes, edges, groups, { artworks })
}

describe('Show Status artwork in the show sketch', () => {
  beforeEach(() => resetEvaluatorState())

  it('emits the slideshow table and blits the running row at the shared rect', () => {
    const { nodes, edges } = graph()
    const cpp = generate(nodes, edges, true)
    const g = showStatusGeometry(240, 320)
    expect(cpp).toContain(`#define ART_COUNT_${SHOW_SELECTION_STEM} 2`)
    expect(cpp).toContain(`static const uint8_t _artData_${SHOW_SELECTION_STEM}[ART_COUNT_${SHOW_SELECTION_STEM}]`)
    expect(cpp).toContain('static void _tftArt(')
    expect(cpp).toContain(`_tftWhole(${SHOW_PATTERN_INDEX})`)
    expect(cpp).toContain(`_tftArt(_tft_panel, ${g.artwork.x}, ${g.artwork.y}, `
      + `${TRANSPORT_ARTWORK_W}, ${TRANSPORT_ARTWORK_H}, _artData_${SHOW_SELECTION_STEM}[_tftArtIndex_panel]);`)
    // The first baked row is the red pattern, big-endian RGB565.
    expect(cpp).toMatch(new RegExp(`_artData_${SHOW_SELECTION_STEM}[^{]*\\{\\s*\\{\\s*0xf8, 0x00,`))
  })

  it('emits neither table nor blit when nothing was baked', () => {
    const { nodes, edges } = graph()
    const cpp = generate(nodes, edges, false)
    expect(cpp).not.toContain('ART_COUNT_')
    expect(cpp).not.toContain('_artData_')
    expect(cpp).not.toContain('_tftArt')
    // Still the text layout it always was.
    expect(cpp).toContain('"NO PATTERNS"')
  })

  // Over the flash ceiling the bake skips the collection, so the build is the
  // text-only layout rather than half a set of pictures.
  it('falls back to text-only for a collection over the artwork budget', () => {
    const { nodes, edges } = graph(Array.from({ length: 9 }, (_, i) => (i % 2 ? 'q' : 'p')))
    const cpp = generate(nodes, edges, true)
    expect(cpp).not.toContain('_artData_')
    expect(cpp).not.toContain('_tftArt')
  })
})
