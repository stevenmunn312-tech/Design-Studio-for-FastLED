import { describe, expect, it } from 'vitest'
import { buildPatternRenderers, generateShowSketch } from '../showGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { buildGraphDiagnostics, findDeployBlockingErrors, findSdVideoErrors } from '../../utils/validateGraph'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'

function node(id: string, type: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === type)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition?.label ?? type, nodeType: type, category: definition?.category ?? 'graph',
    properties: { ...libraryDefaults(type), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${target}`, source, sourceHandle, target, targetHandle })
const frame = (source: string, target: string) => edge(source, 'frame', target, 'frame')
const fqbn = 'esp32:esp32:esp32s3'

describe('collected pattern dependencies', () => {
  const nodes = [node('pc', 'PatternCollection', { patternIds: ['a', 'b'] }), node('show', 'PatternSlideshow'), node('out', 'MatrixOutput')]
  const edges = [edge('pc', 'patternset', 'show', 'patternset'), frame('show', 'out')]
  const textGroup = {
    nodes: [node('number', 'FormatNumber', { value: 42 }), node('text', 'Text'), node('output', 'GroupOutput')],
    edges: [edge('number', 'text', 'text', 'text'), frame('text', 'output')],
  }

  it('preserves one formatter and font for two collected text patterns in both hosts', () => {
    const groups = { a: textGroup, b: textGroup } as GroupRegistry
    const renderers = buildPatternRenderers(['a', 'b'], groups)
    for (const cpp of [generateShowSketch(nodes, edges, groups), generatePlayerSketch({}, renderers, { genericPlayer: true })]) {
      expect(cpp.match(/^#define DS_TEXT_BYTES /gm)).toHaveLength(1)
      expect(cpp.match(/^static void _dsFormatNumber\(/gm)).toHaveLength(1)
      expect(cpp.match(/^static const uint8_t _fontCols\[/gm)).toHaveLength(1)
      expect(cpp.match(/^static uint8_t _fontCol\(/gm)).toHaveLength(1)
      expect(cpp).toContain('void render_p0(')
      expect(cpp).toContain('void render_p1(')
    }
  })

  it('does not capture a shared font twice when it follows Code-node globals', () => {
    const group = {
      nodes: [node('code', 'Code', { globalCode: 'float textGain = 0.5f;', code: '' }),
        ...textGroup.nodes.filter((entry) => entry.id !== 'output'), node('blend', 'Blend'), node('output', 'GroupOutput')],
      edges: [edge('number', 'text', 'text', 'text'), edge('text', 'frame', 'blend', 'a'),
        edge('code', 'frame', 'blend', 'b'), frame('blend', 'output')],
    }
    const renderers = buildPatternRenderers(['a'], { a: group } as GroupRegistry)
    const helpers = renderers.helpers.join('\n')
    expect(helpers).toContain('float textGain = 0.5f;')
    expect(helpers.match(/^static const uint8_t _fontCols\[/gm)).toHaveLength(1)
    expect(helpers.match(/^static uint8_t _fontCol\(/gm)).toHaveLength(1)
  })

  it('blocks a collected SD Video, including a nested group, at the deploy gate', () => {
    const video = {
      nodes: [node('video', 'SDVideo', { clip: { id: 'clip', name: 'clip', w: 16, h: 16, fps: 24, frames: 10 } }), node('output', 'GroupOutput')],
      edges: [frame('video', 'output')],
    }
    const groups = {
      a: { nodes: [node('nested', 'Group', { groupId: 'video' }), node('output', 'GroupOutput')], edges: [frame('nested', 'output')] },
      b: textGroup, video,
    } as GroupRegistry
    const graph = [...nodes, node('sd', 'SDCard')]
    expect(findSdVideoErrors(graph, edges, fqbn, groups)).toContainEqual(expect.stringContaining('not in a Music Player or show build'))
    expect(findDeployBlockingErrors(graph, edges, fqbn, undefined, groups)).toContainEqual(expect.stringContaining('not in a Music Player or show build'))
    expect(buildGraphDiagnostics(graph, edges, { selectedFqbn: fqbn, groups })).toContainEqual(expect.objectContaining({
      severity: 'error', message: expect.stringContaining('not in a Music Player or show build'), nodeIds: ['pc'],
    }))
    // An unused collection cannot block an otherwise ordinary sketch.
    expect(findSdVideoErrors([node('solid', 'SolidColor'), node('out', 'MatrixOutput'), nodes[0]], [frame('solid', 'out')], fqbn, groups)).toEqual([])
  })

  it('validates SD Video hardware inside an ordinary group', () => {
    const groups = { video: { nodes: [node('video', 'SDVideo'), node('output', 'GroupOutput')], edges: [frame('video', 'output')] } } as GroupRegistry
    const graph = [node('nested', 'Group', { groupId: 'video' }), node('out', 'MatrixOutput')]
    expect(findSdVideoErrors(graph, [frame('nested', 'out')], fqbn, groups)).toEqual(expect.arrayContaining([
      expect.stringContaining('has no clip'), expect.stringContaining('Add an SD Card'),
    ]))
  })
})
