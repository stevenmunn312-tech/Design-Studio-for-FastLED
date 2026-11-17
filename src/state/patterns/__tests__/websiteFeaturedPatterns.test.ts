import { describe, expect, it } from 'vitest'
import {
  WEBSITE_FEATURED_PATTERN_ASSETS,
  WEBSITE_FEATURED_PATTERNS,
} from '../websiteFeaturedPatterns'
import { NODE_LIBRARY } from '../../nodeLibrary'

const AUDIO_NODE_TYPES = new Set([
  'MicInput',
  'MusicLibrary',
  'FFTAnalyzer',
  'BeatDetect',
  'AudioFlow',
  'BeatFlash',
  'BassPulse',
  'BassRings',
  'MidrangeBloom',
  'MidrangeWaves',
  'TreblePrism',
  'TrebleSparks',
  'AudioHue',
  'AudioCascade',
  'PercussionDetect',
  'PercussionBlobs',
  'Animartrix',
  'ColorTrails',
  'ChromasonicVortex',
  'SpectraMosaic',
  'SpectrumVisualizer',
  'VocalAurora',
  'KickShock',
  'EmberPulse',
])

describe('website featured patterns', () => {
  it('exposes ten website-ready pattern assets with matching saved patterns', () => {
    expect(WEBSITE_FEATURED_PATTERN_ASSETS).toHaveLength(10)
    expect(WEBSITE_FEATURED_PATTERNS).toHaveLength(10)
    expect(new Set(WEBSITE_FEATURED_PATTERN_ASSETS.map((asset) => asset.slug)).size).toBe(10)
    expect(new Set(WEBSITE_FEATURED_PATTERNS.map((pattern) => pattern.id)).size).toBe(10)
  })

  it('names only settings and ports its nodes have', () => {
    // `studioNode` takes any key, so a setting renamed in the library would
    // otherwise stay behind here doing nothing: Gradient Frame's `vertical`
    // did, and two backdrops ran sideways until it became `angle: 90`.
    const definitions = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))
    // Custom Palette keeps its stops in two lists the library does not default.
    const unlisted = new Set(['colors', 'positions'])
    for (const { pattern } of WEBSITE_FEATURED_PATTERN_ASSETS) {
      const byId = new Map(pattern.subgraph.nodes.map((node) => [node.id, node]))
      for (const node of pattern.subgraph.nodes) {
        const definition = definitions.get(String(node.data.nodeType))
        if (!definition) continue
        const known = new Set(Object.keys(definition.defaultProperties ?? {}))
        const stray = Object.keys(node.data.properties ?? {}).filter((key) => !known.has(key) && !unlisted.has(key))
        expect(stray, `${pattern.name}: ${node.id}`).toEqual([])
      }
      for (const edge of pattern.subgraph.edges) {
        const outputs = (byId.get(edge.source)?.data.outputs ?? []) as { id: string }[]
        const inputs = (byId.get(edge.target)?.data.inputs ?? []) as { id: string }[]
        expect(outputs.some((port) => port.id === edge.sourceHandle), `${pattern.name}: ${edge.id} source`).toBe(true)
        expect(inputs.some((port) => port.id === edge.targetHandle), `${pattern.name}: ${edge.id} target`).toBe(true)
      }
    }
  })

  it('stays non-audio and directly importable into the pattern library', () => {
    for (const asset of WEBSITE_FEATURED_PATTERN_ASSETS) {
      expect(asset.summary.length).toBeGreaterThan(20)
      expect(asset.moods.length).toBeGreaterThanOrEqual(3)

      const { pattern } = asset
      expect(pattern.inputs).toEqual([])
      expect(pattern.outputs).toEqual([{ id: 'frame', label: 'Frame', dataType: 'frame' }])
      expect(pattern.subgraph.nodes.some((node) => node.data.category === 'audio')).toBe(false)
      expect(pattern.subgraph.nodes.some((node) => AUDIO_NODE_TYPES.has(node.data.nodeType))).toBe(false)
    }
  })
})
