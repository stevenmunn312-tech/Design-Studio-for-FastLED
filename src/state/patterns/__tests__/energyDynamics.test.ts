import { describe, expect, it } from 'vitest'
import { AUDIO_BUNDLED_PATTERNS } from '../bundledPatterns'
import { SAVED_AUDIO_SEEDS } from '../bundledSavedAudioPatterns'
import { ENERGY_DYNAMICS, withEnergyDynamics, type EnergyDynamicsSeed } from '../energyDynamics'
import { NODE_LIBRARY } from '../../nodeLibrary'
import { generateCpp } from '../../../codegen/cppGenerator'
import type { SavedPattern } from '../patternLibrary'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { releasePixels, renderReleaseScenario } from './audioReleaseFixtures'

const definitions = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))
const promoted = AUDIO_BUNDLED_PATTERNS.slice(72, 86)
const shaped = AUDIO_BUNDLED_PATTERNS.filter((pattern) => !promoted.includes(pattern))
const byName = (name: string) => AUDIO_BUNDLED_PATTERNS.find((pattern) => pattern.name === name)!
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

function node(id: string, type: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = definitions.get(type) ?? { label: type, category: 'composite', inputs: [], outputs: [], defaultProperties: {} }
  return { id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: definition.label, nodeType: type, category: definition.category,
      properties: { ...definition.defaultProperties, ...properties },
      inputs: definition.inputs.map((port) => ({ ...port })), outputs: definition.outputs.map((port) => ({ ...port })) } } as StudioNode
}

describe('shared energy dynamics', () => {
  it('ends every bundled audio pattern except the promoted user graphs with the stage', () => {
    expect(shaped).toHaveLength(86)
    for (const pattern of shaped) {
      const ids = new Set(pattern.subgraph.nodes.map((entry) => entry.id))
      expect(ids.has('dynColor'), pattern.name).toBe(true)
      expect(ids.has('dynGlitter'), pattern.name).toBe(true)
      const out = pattern.subgraph.nodes.find((entry) => entry.data.nodeType === 'GroupOutput')!
      const last = pattern.subgraph.edges.find((edge) => edge.target === out.id && edge.targetHandle === 'frame')!
      expect(['dynBrightness', 'dynGlitter'], pattern.name).toContain(last.source)
      // The stage reuses the pattern's own Audio Features and adds one only when there is none.
      const features = pattern.subgraph.nodes.filter((entry) => entry.data.nodeType === 'AudioFeatures')
      if (features.some((entry) => entry.id === 'dynFeatures')) expect(features, pattern.name).toHaveLength(1)
      const byId = new Map(pattern.subgraph.nodes.map((entry) => [entry.id, entry]))
      for (const edge of pattern.subgraph.edges) {
        const source = (byId.get(edge.source)?.data.outputs as SavedPattern['outputs'] | undefined)?.find((port) => port.id === edge.sourceHandle)
        const target = (byId.get(edge.target)?.data.inputs as SavedPattern['inputs'] | undefined)?.find((port) => port.id === edge.targetHandle)
        expect(source?.dataType, `${pattern.name}: ${edge.id}`).toBe(target?.dataType)
      }
    }
    for (const [index, pattern] of promoted.entries()) {
      expect(pattern.subgraph).toEqual(SAVED_AUDIO_SEEDS[index].subgraph)
    }
    // Release scenes shape their own exposure, so they take only colour and sparkle.
    for (const pattern of AUDIO_BUNDLED_PATTERNS.slice(86)) {
      expect(pattern.subgraph.nodes.some((entry) => entry.id === 'dynBrightness'), pattern.name).toBe(false)
    }
  })

  it('rests subdued, then lifts brightness, colour and sparkle with the energy', () => {
    for (const name of ['Chromasonic Vortex', 'String Bass Tide', 'Snare Rain']) {
      const pattern = byName(name)
      const string = pattern.bestOn?.includes('string') && !pattern.bestOn.includes('matrix')
      const width = string ? 60 : 16
      const height = string ? 1 : 16
      const quiet = renderReleaseScenario(pattern, 'quiet', width, height)
      const loud = renderReleaseScenario(pattern, 'energetic', width, height)
      expect(Number(quiet.outputs.get('dynSparkle')?.result), name).toBe(0)
      expect(Number(quiet.outputs.get('dynBoost')?.result), name).toBe(0)
      expect(Number(quiet.outputs.get('dynLight')?.result), name).toBeLessThan(0.75)
      expect(Number(loud.outputs.get('dynSparkle')?.result), name).toBeGreaterThan(0.05)
      expect(Number(loud.outputs.get('dynBoost')?.result), name).toBeGreaterThan(0.2)
      expect(Number(loud.outputs.get('dynLight')?.result), name).toBeGreaterThan(0.9)
      expect(mean(releasePixels(loud.frames)), name).toBeGreaterThan(mean(releasePixels(quiet.frames)) * 1.3)
    }
    const silent = renderReleaseScenario(byName('Chromasonic Vortex'), 'silent')
    expect(Number(silent.outputs.get('dynLight')?.result)).toBe(ENERGY_DYNAMICS.lightFloor)
  }, 30_000)

  it('keeps the shaped patterns emitting firmware', () => {
    for (const name of ['Chromasonic Vortex', 'Juggle After Dark', 'Truchet Beat Maze', 'String Bass Tide']) {
      const pattern = byName(name)
      const group = node('pattern', 'Group', { groupId: 'recipe' })
      group.data.inputs = pattern.inputs
      group.data.outputs = pattern.outputs
      const nodes = [node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }), node('mic', 'MicInput'),
        node('audio', 'Audio', { sourceId: 'mic' }), group,
        node('output', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, ledCount: 256, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 })]
      const edges = [{ id: 'frame', source: 'pattern', sourceHandle: 'frame', target: 'output', targetHandle: 'frame' },
        { id: 'audio', source: 'audio', sourceHandle: 'audio', target: 'pattern', targetHandle: 'param0' }] as StudioEdge[]
      const cpp = generateCpp(nodes, edges, { recipe: pattern.subgraph })
      expect(cpp, name).not.toMatch(/\b(?:undefined|NaN)\b/)
      expect(cpp, name).toContain('n_pattern__dynLight_result')
      expect(cpp, name).toContain('n_pattern__dynSparkle_result')
    }
  })

  it('refuses a seed it cannot shape', () => {
    const seed: EnergyDynamicsSeed = { name: 'Bare', inputs: [], outputs: [], subgraph: { nodes: [], edges: [] } }
    expect(() => withEnergyDynamics(seed)).toThrow(/Group Output/)
  })
})
