import { describe, expect, it } from 'vitest'
import { evaluateGraph } from '../../graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { clearInstanceStateByPrefix } from '../../evaluator/memory'
import { NOISE_SPEED_MAX } from '../../../nodes/shared/speedRange'
import { renderShowFrame } from '../showPreview'
import { BUILTIN_SHOW_PATTERNS, builtinShowPatternClocks, builtinShowPatternGroupId, builtinShowPatternGroups } from '../builtinShowPatterns'
import type { StudioEdge, StudioNode } from '../../graphStore'
import type { Frame } from '../../palettes/ledColor'
import type { ShowFile } from '../../../types/showFile'

function playing(name: string, speed: number, palette = 'ocean'): ShowFile {
  return {
    version: 1, songTitle: 'Built-in', durationMs: 60_000, bpm: 120,
    events: [
      { t: 0, cmd: 'SET_PATTERN', params: { name } },
      { t: 0, cmd: 'SET_PALETTE', params: { name: palette } },
      { t: 0, cmd: 'SET_SPEED', params: { value: speed } },
      { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
    ],
  }
}

const lit = (frame: Frame) => frame.flat().filter((px) => px.r + px.g + px.b > 0).length

describe('the built-in Kaleidoscope', () => {
  it('folds a plasma into a lit, moving kaleidoscope that takes the show\'s palette', () => {
    clearInstanceStateByPrefix('')
    const W = 16, H = 16
    const first = renderShowFrame(playing('Kaleidoscope', 1), 2000, W, H)
    const later = renderShowFrame(playing('Kaleidoscope', 1), 2600, W, H)
    // It drew black with no source; the fold now lights all but the corners
    // outside its circle.
    expect(lit(first)).toBeGreaterThan(W * H * 0.6)
    expect(later).not.toEqual(first)
    clearInstanceStateByPrefix('')
    expect(renderShowFrame(playing('Kaleidoscope', 1, 'lava'), 2000, W, H)).not.toEqual(first)
  })

  it('compiles the same plasma into the fold, with the show\'s speed and palette on the plasma', () => {
    const group = builtinShowPatternGroups(['Kaleidoscope'])[builtinShowPatternGroupId('Kaleidoscope')]
    const type = (id: string) => (group.nodes.find((n) => n.id === id)!.data as { nodeType: string }).nodeType
    const edge = (target: string, handle: string) => group.edges.find((e) => e.target === target && e.targetHandle === handle)
    expect(type('pattern')).toBe('Mirror')
    expect(type('source')).toBe(BUILTIN_SHOW_PATTERNS.Kaleidoscope.source!.nodeType)
    expect(edge('pattern', 'frame')?.source).toBe('source')
    expect(edge('source', 'speed')?.source).toBe('speed')
    expect(edge('source', 'paletteIn')?.source).toBe('palette')
    // Mirror has neither port, so nothing else is wired.
    expect(group.edges).toHaveLength(4)
  })
})

describe('the built-in Simplex2D', () => {
  function noiseNode(id: string, props: Record<string, unknown>): StudioNode {
    const def = NODE_LIBRARY.find((n) => n.type === 'Noise')!
    return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
      label: def.label, nodeType: 'Noise', category: def.category,
      properties: { ...libraryDefaults('Noise'), ...props }, inputs: def.inputs, outputs: def.outputs,
    } } as unknown as StudioNode
  }

  it('runs at the old simplex type\'s top rate, which fbm\'s range alone cannot reach', () => {
    const [clock] = builtinShowPatternClocks(['Simplex2D'])
    // The simplex type's speed 1 was 3; fbm's is 1.2.
    expect(NOISE_SPEED_MAX.fbm * clock).toBeCloseTo(3, 12)
    expect(builtinShowPatternClocks(['Plasma', 'Kaleidoscope', 'Fire'])).toEqual([1, 1, 1])
  })

  it.each([0.3, 1, 1.6])('draws, at show speed %s, its node on a clock that many times as fast', (speed) => {
    const W = 12, H = 10
    const { props } = BUILTIN_SHOW_PATTERNS.Simplex2D
    const [clock] = builtinShowPatternClocks(['Simplex2D'])
    for (const ms of [1000, 1700, 4300]) {
      clearInstanceStateByPrefix('')
      const show = renderShowFrame(playing('Simplex2D', speed), ms, W, H)
      const nodes = [noiseNode('n', { ...props, palette: 'ocean', speed }),
        { id: 'out', type: 'studioNode', position: { x: 0, y: 0 }, data: { label: 'Out', nodeType: 'MatrixOutput', category: 'output', properties: { width: W, height: H }, inputs: [{ id: 'frame' }], outputs: [] } } as unknown as StudioNode]
      const edges = [{ id: 'e', source: 'n', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }] as StudioEdge[]
      expect(show, `${ms} ms`).toEqual(evaluateGraph(nodes, edges, ms * 0.06 * clock, W, H))
    }
  })
})
