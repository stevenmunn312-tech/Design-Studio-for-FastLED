import { describe, expect, it } from 'vitest'
import { AUDIO_BUNDLED_PATTERNS, BUNDLED_PATTERNS, STANDARD_BUNDLED_PATTERNS } from '../bundledPatterns'
import { captureWindows, isAudioReactiveSubgraph } from '../patternRating'
import type { Frame } from '../../palettes/ledColor'
import type { SavedPattern } from '../patternLibrary'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY } from '../../nodeLibrary'

const standard = STANDARD_BUNDLED_PATTERNS.slice(22)
const audio = AUDIO_BUNDLED_PATTERNS.slice(51)

function pixels(windows: Frame[][]) {
  return windows.flatMap((window) => window.flatMap((frame) => frame.flatMap((row) => row.flatMap((pixel) => [pixel.r, pixel.g, pixel.b]))))
}

describe('bundled LED string patterns', () => {
  it('adds twenty of each kind without reusing names or identities', () => {
    expect(standard).toHaveLength(20)
    expect(audio).toHaveLength(20)
    expect(new Set(BUNDLED_PATTERNS.map((pattern) => pattern.id)).size).toBe(BUNDLED_PATTERNS.length)
    expect(new Set(BUNDLED_PATTERNS.map((pattern) => pattern.name)).size).toBe(BUNDLED_PATTERNS.length)
    for (const pattern of [...standard, ...audio]) {
      expect(pattern.bestOn, pattern.name).toEqual(['string'])
      const byId = new Map(pattern.subgraph.nodes.map((node) => [node.id, node]))
      for (const edge of pattern.subgraph.edges) {
        const source = (byId.get(edge.source)?.data.outputs as SavedPattern['outputs'] | undefined)?.find((port) => port.id === edge.sourceHandle)
        const target = (byId.get(edge.target)?.data.inputs as SavedPattern['inputs'] | undefined)?.find((port) => port.id === edge.targetHandle)
        expect(source, `${pattern.name}: ${edge.id} source`).toBeDefined()
        expect(target, `${pattern.name}: ${edge.id} target`).toBeDefined()
        expect(source?.dataType, `${pattern.name}: ${edge.id} type`).toBe(target?.dataType)
      }
    }
    for (const pattern of standard) {
      expect(pattern.inputs).toEqual([])
      expect(isAudioReactiveSubgraph(pattern.subgraph.nodes)).toBe(false)
    }
    for (const pattern of audio) {
      expect(pattern.inputs).toEqual([{ id: 'param0', label: 'Audio', dataType: 'audio' }])
      expect(isAudioReactiveSubgraph(pattern.subgraph.nodes)).toBe(true)
    }
  })

  it('lights and animates every standard recipe at 60 LEDs by one row without audio', async () => {
    for (const pattern of standard) {
      const frames = await captureWindows(pattern, 60, 1, {}, true, 'silent', 1)
      const values = pixels(frames)
      expect(Math.max(...values), pattern.name).toBeGreaterThan(30)
      expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 255), pattern.name).toBe(true)
      expect(frames[0].some((frame) => JSON.stringify(frame) !== JSON.stringify(frames[0][0])), pattern.name).toBe(true)
    }
  }, 20000)

  it('generates firmware for each recipe instantiated as a group on an LED string', () => {
    const node = (id: string, nodeType: string, properties: Record<string, unknown>, inputs: SavedPattern['inputs'] = [], outputs: SavedPattern['outputs'] = []): StudioNode => ({
      id, type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: nodeType, nodeType, category: NODE_LIBRARY.find((definition) => definition.type === nodeType)?.category ?? 'composite', properties, inputs, outputs },
    } as StudioNode)
    for (const pattern of [...standard, ...audio]) {
      const nodes = [
        node('pattern', 'Group', { groupId: 'recipe' }, pattern.inputs, pattern.outputs),
        node('output', 'MatrixOutput', { form: 'strip', ledCount: 60, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 }),
      ]
      const edges = [{ id: 'frame', source: 'pattern', sourceHandle: 'frame', target: 'output', targetHandle: 'frame' } as StudioEdge]
      if (pattern.inputs.length) {
        nodes.push(node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }), node('mic', 'MicInput', {}), node('audio', 'Audio', { sourceId: 'mic' }))
        edges.push({ id: 'audio', source: 'audio', sourceHandle: 'audio', target: 'pattern', targetHandle: 'param0' } as StudioEdge)
      }
      const cpp = generateCpp(nodes, edges, { recipe: pattern.subgraph })
      expect(cpp, pattern.name).toContain('buf_pattern__base')
      expect(cpp, pattern.name).not.toMatch(/\b(?:undefined|NaN)\b/)
      expect(cpp, pattern.name).toMatch(/#define WIDTH\s+60/)
      expect(cpp, pattern.name).toMatch(/#define HEIGHT\s+1/)
      if (pattern.inputs.length) expect(cpp, pattern.name).toContain('_audioProcessor')
      for (const mod of pattern.subgraph.nodes.filter((entry) => entry.data.nodeType === 'MapRange')) {
        expect(cpp, pattern.name).toContain(`n_pattern__${mod.id.replaceAll('-', '_')}_result`)
      }
    }
  })

  it('lights every audio recipe on one row and changes its output in response to sound', async () => {
    for (const pattern of audio) {
      const quiet = pixels(await captureWindows(pattern, 60, 1, {}, true, 'silent', 1))
      const loud = pixels(await captureWindows(pattern, 60, 1, {}, true, 'pulse', 1))
      expect(Math.max(...loud), pattern.name).toBeGreaterThan(30)
      expect(loud.every((value) => Number.isFinite(value) && value >= 0 && value <= 255), pattern.name).toBe(true)
      const difference = loud.reduce((total, value, index) => total + Math.abs(value - quiet[index]), 0) / loud.length
      expect(difference, pattern.name).toBeGreaterThan(1)
    }
  }, 20000)
})
