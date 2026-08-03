import {
  WEBSITE_FEATURED_PATTERN_ASSETS,
  WEBSITE_FEATURED_PATTERNS,
} from '../websiteFeaturedPatterns'

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
  'SpectrumBars',
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
