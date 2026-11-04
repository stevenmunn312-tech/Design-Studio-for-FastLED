import { describe, expect, it } from 'vitest'
import { AUDIO_BUNDLED_PATTERNS, BUNDLED_PATTERNS } from '../bundledPatterns'
import { SAVED_AUDIO_SEEDS } from '../bundledSavedAudioPatterns'
import { NODE_LIBRARY } from '../../nodeLibrary'
import { generateCpp } from '../../../codegen/cppGenerator'
import { validateGraph } from '../../../utils/validateGraph'
import { patternFingerprint } from '../patternLibrary'
import type { SavedPattern } from '../patternLibrary'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { releasePixels, renderReleaseScenario } from './audioReleaseFixtures'

const promoted = AUDIO_BUNDLED_PATTERNS.slice(72, 86)
const fresh = AUDIO_BUNDLED_PATTERNS.slice(86)
const definitions = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))

function node(id: string, type: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = definitions.get(type) ?? { label: type, category: 'composite', inputs: [], outputs: [], defaultProperties: {} }
  return { id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: definition.label, nodeType: type, category: definition.category,
      properties: { ...definition.defaultProperties, ...properties },
      inputs: definition.inputs.map((port) => ({ ...port })), outputs: definition.outputs.map((port) => ({ ...port })) } } as StudioNode
}

describe('audio release candidates', () => {
  it('appends fourteen saved and fourteen fresh patterns without changing prior identities', () => {
    expect(AUDIO_BUNDLED_PATTERNS).toHaveLength(100)
    expect(promoted.map((pattern) => pattern.name)).toEqual(SAVED_AUDIO_SEEDS.map((seed) => seed.name))
    expect(fresh).toHaveLength(14)
    expect(AUDIO_BUNDLED_PATTERNS[71].name).toBe('Velvet Ink Choir')
    expect(AUDIO_BUNDLED_PATTERNS[71].id).toBe('bundled-audio-72')
    expect(AUDIO_BUNDLED_PATTERNS[99].id).toBe('bundled-audio-100')
    expect(new Set(BUNDLED_PATTERNS.map((pattern) => pattern.name)).size).toBe(BUNDLED_PATTERNS.length)
    for (const [index, pattern] of promoted.entries()) {
      expect(pattern.subgraph).toEqual(SAVED_AUDIO_SEEDS[index].subgraph)
      expect(pattern.inputs).toEqual(SAVED_AUDIO_SEEDS[index].inputs)
    }
    for (const [index, pattern] of promoted.entries()) {
      // The library deduplicates by this fingerprint when adding bundled entries.
      expect(patternFingerprint(pattern)).toBe(patternFingerprint(SAVED_AUDIO_SEEDS[index]))
    }
  })

  it('validates every new wire against current ports and emits all twenty-eight patterns as firmware', () => {
    for (const pattern of [...promoted, ...fresh]) {
      const byId = new Map(pattern.subgraph.nodes.map((entry) => [entry.id, entry]))
      for (const edge of pattern.subgraph.edges) {
        const sourceNode = byId.get(edge.source)!
        const targetNode = byId.get(edge.target)!
        const source = (sourceNode.data.outputs as SavedPattern['outputs']).find((port) => port.id === edge.sourceHandle)
        const target = (targetNode.data.inputs as SavedPattern['inputs']).find((port) => port.id === edge.targetHandle)
        expect(source, `${pattern.name}: source ${edge.id}`).toBeDefined()
        expect(target, `${pattern.name}: target ${edge.id}`).toBeDefined()
        const sourceDefinition = definitions.get(String(sourceNode.data.nodeType))
        const targetDefinition = definitions.get(String(targetNode.data.nodeType))
        if (sourceDefinition) expect(sourceDefinition.outputs.some((port) => port.id === edge.sourceHandle), edge.id).toBe(true)
        if (targetDefinition) expect(targetDefinition.inputs.some((port) => port.id === edge.targetHandle), edge.id).toBe(true)
      }
      const group = node('pattern', 'Group', { groupId: 'recipe' })
      group.data.inputs = pattern.inputs
      group.data.outputs = pattern.outputs
      const width = pattern.bestOn?.includes('string') ? 60 : 16
      const height = width === 60 ? 1 : 16
      const nodes = [node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
        node('mic', 'MicInput'), node('audio', 'Audio', { sourceId: 'mic' }), group,
        node('output', 'MatrixOutput', { form: height === 1 ? 'strip' : 'matrix', width, height, ledCount: width * height,
          chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 })]
      const edges = [{ id: 'frame', source: 'pattern', sourceHandle: 'frame', target: 'output', targetHandle: 'frame' },
        ...pattern.inputs.filter((port) => port.dataType === 'audio').map((port) => ({ id: port.id,
          source: 'audio', sourceHandle: 'audio', target: 'pattern', targetHandle: port.id }))] as StudioEdge[]
      const registry = { ...pattern.groups, recipe: pattern.subgraph }
      expect(validateGraph(nodes, edges, '', undefined, registry).errors, pattern.name).toEqual([])
      const cpp = generateCpp(nodes, edges, registry)
      expect(cpp, pattern.name).not.toMatch(/\b(?:undefined|NaN)\b/)
      expect(cpp, pattern.name).toContain('_audioProcessor')
      if (fresh.includes(pattern)) {
        expect(cpp, pattern.name).toContain('n_pattern__dropEnvelope_result')
        expect(cpp, pattern.name).toContain('n_pattern__buildup_result')
      }
    }
  })

  it('holds the detected drop impact for the envelope and gives stronger drops a larger gesture', () => {
    const gentle = renderReleaseScenario(fresh[0], 'drop', 16, 16, 0.15)
    const strong = renderReleaseScenario(fresh[0], 'drop', 16, 16, 0.95)
    expect(gentle.outputs.get('dropImpactHold')?.result).toBe(0.15)
    expect(strong.outputs.get('dropImpactHold')?.result).toBe(0.95)
    expect(Number(strong.outputs.get('dropEnvelope')?.result)).toBeGreaterThan(Number(gentle.outputs.get('dropEnvelope')?.result) * 1.5)
  })

  it('renders quiet, energetic, buildup, drop, and silence sections with bounded pixels and musical contrast', () => {
    for (const pattern of fresh) {
      const width = pattern.bestOn?.includes('string') ? 60 : 16
      const height = width === 60 ? 1 : 16
      const render = (scenario: Parameters<typeof renderReleaseScenario>[1]) => renderReleaseScenario(pattern, scenario, width, height)
      const quiet = releasePixels(render('quiet').frames)
      const energeticResult = render('energetic')
      const energetic = releasePixels(energeticResult.frames)
      const buildupResult = render('buildup')
      const dropResult = render('drop')
      const buildup = releasePixels(buildupResult.frames)
      const drop = releasePixels(dropResult.frames)
      const silent = releasePixels(render('silent').frames)
      for (const values of [quiet, energetic, buildup, drop, silent]) {
        expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 255), pattern.name).toBe(true)
      }
      const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
      const difference = (values: number[]) => mean(values.map((value, index) => Math.abs(value - energetic[index])))
      expect(Math.max(...energetic), `${pattern.name}: energetic output`).toBeGreaterThan(20)
      expect(mean(energetic), `${pattern.name}: quiet to energetic contrast`).toBeGreaterThan(mean(quiet) * 1.3)
      expect(difference(buildup), `${pattern.name}: buildup changes image`).toBeGreaterThan(0.05)
      expect(difference(drop), `${pattern.name}: drop changes image`).toBeGreaterThan(0.1)
      const baseEffect = releasePixels(energeticResult.effectFrames)
      for (const [label, result] of [['buildup', buildupResult], ['drop', dropResult]] as const) {
        const effect = releasePixels(result.effectFrames)
        expect(effect.length, `${pattern.name}: ${label} effect frames`).toBe(baseEffect.length)
        expect(mean(effect.map((value, index) => Math.abs(value - baseEffect[index]))),
          `${pattern.name}: ${label} changes content before the shared brightness stage`).toBeGreaterThan(0.05)
      }
      expect(Math.max(...silent), `${pattern.name}: silence`).toBe(0)
      expect(Number(energeticResult.outputs.get('motion')?.result ?? 0)).toBeLessThanOrEqual(0.65)
    }
  }, 60_000)
})
