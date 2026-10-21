import { describe, expect, it } from 'vitest'
import { generateShowSketch } from '../showGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { resolveBuildMode } from '../../state/upload/buildMode'
import { showStatusGeometry, transportPictureBox } from '../../state/displays/transportDisplay'
import { assertWireable } from '../../test-utils/assertWireable'

/**
 * Show Status pictures the LEDs the slideshow composed.
 *
 * End to end through the build mode the upload paths use: the show sketch
 * streams its own `leds` canvas into the box the preview draws in, for a
 * collection of any size, with no table baked or emitted.
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
} as unknown as GroupRegistry

function sketch(layout: string, patternCount = 2): string {
  const nodes = [
    node('collection', 'PatternCollection', { patternIds: Array.from({ length: patternCount }, () => 'p') }),
    node('show', 'PatternSlideshow'),
    node('out', 'MatrixOutput', { width: 16, height: 8, dataPin: 5 }),
    node('panel', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftLayout: layout }),
  ]
  const edges = [
    edge('collection', 'patternset', 'show', 'patternset'),
    edge('show', 'frame', 'out', 'frame'),
    edge('show', 'display', 'panel', 'display'),
  ]
  assertWireable(nodes, edges)
  expect(resolveBuildMode(nodes, edges).mode).toBe('show')
  return generateShowSketch(nodes, edges, groups, {})
}

describe('Show Status picture in the show sketch', () => {
  it('streams the show canvas into the shared box', () => {
    const src = sketch('Show Status')
    const box = transportPictureBox(16, 8, showStatusGeometry(240, 320).picture)
    expect(src).toContain(`_tftPicture(_tft_panel, ${box.x}, ${box.y}, ${box.w}, ${box.h}, leds, 16, 8);`)
    expect(src).toContain('static void _tftPicture(')
    expect(src).toContain('static uint32_t _tftPictureMs_panel = 0;')
    expect(src).not.toContain('_artData_')
  })

  // The eight-pattern ceiling went with the bake: nothing is stored per pattern.
  it('pictures a collection of any size', () => {
    expect(sketch('Show Status', 40)).toContain('_tftPicture(_tft_panel,')
  })
})
