import { describe, it, expect } from 'vitest'
import type { Frame, RGB } from '../graphEvaluator'
import { hsv } from '../ledColor'
import { BUNDLED_PATTERNS } from '../bundledPatterns'
import { captureWindows } from '../patternRating'
import type { StudioNode, StudioEdge } from '../graphStore'
import type { GraphDiagnostic } from '../../utils/validateGraph'
import {
  scoreStructure,
  scoreColorBalance,
  scoreBrightnessUniformity,
  scoreRefreshStability,
  scoreStructuralHealth,
  isAudioReactiveSubgraph,
  scoreAudioCorrectness,
  scorePattern,
  frameThumbnailScore,
} from '../patternRating'

// ── Frame builders ───────────────────────────────────────────────────────────
function buildFrame(w: number, h: number, fn: (x: number, y: number) => RGB): Frame {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => fn(x, y)))
}
const solid = (w: number, h: number, c: RGB): Frame => buildFrame(w, h, () => ({ ...c }))
const black = (w: number, h: number): Frame => solid(w, h, { r: 0, g: 0, b: 0 })

describe('scoreStructure', () => {
  it('scores a shaped, multi-hue pattern high', () => {
    const frame = buildFrame(8, 8, (x, y) =>
      (x + y) % 3 === 0 ? hsv(x * 45, 1, 1) : { r: 0, g: 0, b: 0 },
    )
    expect(scoreStructure([frame])).toBeGreaterThan(0.5)
  })
  it('scores an all-black frame near zero', () => {
    expect(scoreStructure([black(8, 8)])).toBeLessThan(0.15)
  })
  it('scores a flat solid fill low', () => {
    expect(scoreStructure([solid(8, 8, { r: 128, g: 128, b: 128 })])).toBeLessThan(0.35)
  })
})

describe('frameThumbnailScore', () => {
  const colourful = buildFrame(8, 8, (x) => hsv(x * 45, 1, 1))
  const whiteFlash = solid(8, 8, { r: 255, g: 255, b: 255 })
  it('prefers a colourful frame over a blown-out white flash', () => {
    expect(frameThumbnailScore(colourful)).toBeGreaterThan(frameThumbnailScore(whiteFlash))
  })
  it('prefers a colourful frame over an all-black frame', () => {
    expect(frameThumbnailScore(colourful)).toBeGreaterThan(frameThumbnailScore(black(8, 8)))
  })
  it('scores a black frame at zero', () => {
    expect(frameThumbnailScore(black(8, 8))).toBe(0)
  })
})

describe('scoreColorBalance', () => {
  it('passes clean neutral pixels', () => {
    expect(scoreColorBalance([solid(8, 8, { r: 230, g: 232, b: 231 })])).toBeGreaterThan(0.8)
  })
  it('penalises a consistent tint on neutral tones', () => {
    expect(scoreColorBalance([solid(8, 8, { r: 200, g: 150, b: 150 })])).toBeLessThan(0.4)
  })
  it('does not judge a fully saturated pattern (returns 1)', () => {
    expect(scoreColorBalance([solid(8, 8, { r: 255, g: 0, b: 0 })])).toBe(1)
  })
})

describe('scoreBrightnessUniformity', () => {
  it('passes an evenly-lit frame', () => {
    expect(scoreBrightnessUniformity([solid(8, 8, { r: 100, g: 100, b: 100 })])).toBeGreaterThan(0.9)
  })
  it('penalises a lone blown pixel on a dark field', () => {
    const frame = buildFrame(8, 8, (x, y) =>
      x === 4 && y === 4 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 },
    )
    expect(scoreBrightnessUniformity([frame])).toBeLessThan(0.4)
  })
})

describe('scoreRefreshStability', () => {
  it('treats a fully static pattern as stable', () => {
    const f = solid(8, 8, { r: 40, g: 90, b: 160 })
    expect(scoreRefreshStability([f, f, f])).toBe(1)
  })
  it('penalises full-range flicker', () => {
    const frames = [black(8, 8), solid(8, 8, { r: 255, g: 255, b: 255 }), black(8, 8), solid(8, 8, { r: 255, g: 255, b: 255 })]
    expect(scoreRefreshStability(frames)).toBeLessThan(0.4)
  })
})

describe('scoreStructuralHealth', () => {
  const err: GraphDiagnostic = {
    id: 'x', severity: 'error', category: 'connection',
    title: 't', message: 'm', fix: 'f', nodeIds: ['n1'],
  }
  it('is perfect with no diagnostics', () => {
    expect(scoreStructuralHealth([])).toBe(1)
  })
  it('drops with an error present', () => {
    expect(scoreStructuralHealth([err])).toBeLessThan(1)
  })
})

// ── Audio ────────────────────────────────────────────────────────────────────
function node(id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}
function edge(id: string, source: string, target: string, sourceHandle: string, targetHandle: string): StudioEdge {
  return { id, source, target, sourceHandle, targetHandle } as unknown as StudioEdge
}

describe('audio detection & correctness', () => {
  it('detects an audio-reactive subgraph', () => {
    const nodes = [node('a', 'FFTAnalyzer', 'audio'), node('b', 'BassPulse', 'pattern')]
    expect(isAudioReactiveSubgraph(nodes)).toBe(true)
    expect(isAudioReactiveSubgraph([node('s', 'SolidColor', 'pattern')])).toBe(false)
  })

  it('scores a correctly wired audio chain high', () => {
    const nodes = [
      node('mic', 'MicInput', 'input'),
      node('fft', 'FFTAnalyzer', 'audio'),
      node('bp', 'BassPulse', 'pattern'),
    ]
    const edges = [
      edge('e1', 'mic', 'fft', 'audio', 'audio'),
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
    ]
    expect(scoreAudioCorrectness(nodes, edges)).toBeGreaterThanOrEqual(0.8)
  })

  it('flags an audio-reactive pattern with no audio source wired', () => {
    const nodes = [
      node('fft', 'FFTAnalyzer', 'audio'),
      node('bp', 'BassPulse', 'pattern'),
    ]
    const wired = scoreAudioCorrectness(nodes, [edge('e2', 'fft', 'bp', 'bass', 'bass')])
    const unwired = scoreAudioCorrectness(nodes, [])
    expect(unwired).toBeLessThan(wired)
    expect(unwired).toBeLessThan(0.4)
  })
})

describe('bundled audio patterns light up after warm-up', () => {
  // These four use slow-warming nodes (FrameFeedback / Smooth / audio build-up)
  // and rendered near-black when captured cold from t=0. The warm-up prefix in
  // captureSubgraph should let them reach a visibly lit state.
  const names = ['Prismatic Waterfall Cathedral', 'Spectral Field Vortex', 'Aurora Echo Choir', 'Glass Rain Resonator']
  const maxBrightness = (frames: Frame[]) => {
    let max = 0
    for (const frame of frames) for (const row of frame) for (const px of row) {
      max = Math.max(max, Math.max(px.r, px.g, px.b) / 255)
    }
    return max
  }
  for (const name of names) {
    it(`${name} is not near-black`, async () => {
      const saved = BUNDLED_PATTERNS.find((p) => p.name === name)
      expect(saved, `bundled pattern "${name}" exists`).toBeTruthy()
      const windows = await captureWindows(saved!, 16, 16, {})
      expect(maxBrightness(windows.flat())).toBeGreaterThan(0.12)
    })
  }
})

describe('scorePattern', () => {
  const frames = [solid(8, 8, { r: 40, g: 90, b: 160 }), solid(8, 8, { r: 42, g: 92, b: 162 })]

  it('omits the audio criterion (and renormalises) for a non-audio pattern', () => {
    const nodes = [node('s', 'SolidColor', 'pattern')]
    const result = scorePattern(frames, [], nodes, [])
    expect(result.audioReactive).toBe(false)
    expect(result.criteria.map((c) => c.id)).not.toContain('audio')
    expect(result.criteria).toHaveLength(5)
    expect(result.overall).toBeGreaterThanOrEqual(0)
    expect(result.overall).toBeLessThanOrEqual(100)
  })

  it('includes the audio criterion for an audio-reactive pattern', () => {
    const nodes = [node('fft', 'FFTAnalyzer', 'audio'), node('bp', 'BassPulse', 'pattern')]
    const result = scorePattern(frames, [], nodes, [edge('e', 'fft', 'bp', 'bass', 'bass')])
    expect(result.audioReactive).toBe(true)
    expect(result.criteria.map((c) => c.id)).toContain('audio')
    expect(result.criteria).toHaveLength(6)
  })
})
