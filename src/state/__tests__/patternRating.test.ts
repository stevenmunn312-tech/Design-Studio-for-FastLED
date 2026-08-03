import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Frame, RGB } from '../graphEvaluator'
import { hsv } from '../ledColor'
import { BUNDLED_PATTERNS, STANDARD_BUNDLED_PATTERNS } from '../bundledPatterns'
import { captureWindows, inferPatternIntent, patternRatingKey, rateAllPatterns, ratePattern, usePatternRatingStore, verdictForScore } from '../patternRating'
import type { SavedPattern } from '../patternLibrary'
import {
  clearPatternContentTrustForTests,
  isPatternContentTrusted,
  trustPatternContent,
} from '../patternTrust'
import type { StudioNode, StudioEdge } from '../graphStore'
import type { GraphDiagnostic } from '../../utils/validateGraph'
import {
  scoreStructure,
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

describe('intent-aware critic', () => {
  it('classifies every bundled standard pattern without enforcing an aesthetic score floor', () => {
    for (const saved of STANDARD_BUNDLED_PATTERNS) {
      expect(['ambient', 'showpiece', 'accent', 'audio-reactive', 'static-utility']).toContain(
        inferPatternIntent(saved.subgraph.nodes),
      )
    }
  })

  it('does not punish a functional solid fill for being static or spatially flat', () => {
    const nodes = [node('solid', 'SolidColor', 'pattern')]
    const frames = [solid(8, 8, { r: 45, g: 100, b: 180 }), solid(8, 8, { r: 45, g: 100, b: 180 })]
    const utility = scorePattern(frames, [], nodes, [], 'static-utility')
    const showpiece = scorePattern(frames, [], nodes, [], 'showpiece')
    expect(utility.criteria.find((criterion) => criterion.id === 'composition')?.score).toBeGreaterThanOrEqual(0.85)
    expect(utility.overall).toBeGreaterThan(showpiece.overall)
  })

  it('caps a graph with an error below Promising', () => {
    const nodes = [node('solid', 'SolidColor', 'pattern')]
    const frames = [solid(8, 8, { r: 45, g: 100, b: 180 })]
    const diagnostic: GraphDiagnostic = {
      id: 'broken', severity: 'error', category: 'connection', title: 'Broken',
      message: 'Broken graph', fix: 'Repair it', nodeIds: ['solid'],
    }
    expect(scorePattern(frames, [diagnostic], nodes, [], 'static-utility').overall).toBeLessThanOrEqual(49)
  })

  it('uses the agreed verdict thresholds', () => {
    expect(verdictForScore(90).label).toBe('Exceptional')
    expect(verdictForScore(75).label).toBe('Strong')
    expect(verdictForScore(60).label).toBe('Promising')
    expect(verdictForScore(40).label).toBe('Needs work')
    expect(verdictForScore(39).label).toBe('Fundamentally weak')
  })

  it('keeps rename out of the cache key but includes render context and intent', () => {
    const pattern: SavedPattern = {
      id: 'one', name: 'Before', createdAt: 0, inputs: [], outputs: [],
      subgraph: { nodes: [node('solid', 'SolidColor', 'pattern')], edges: [] },
    }
    const context = { gridW: 16, gridH: 16, groups: {} }
    expect(patternRatingKey({ ...pattern, name: 'After' }, context)).toBe(patternRatingKey(pattern, context))
    expect(patternRatingKey(pattern, { ...context, gridW: 32 })).not.toBe(patternRatingKey(pattern, context))
    expect(patternRatingKey(pattern, context, 'ambient')).not.toBe(patternRatingKey(pattern, context, 'showpiece'))
  })
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
    const result = scorePattern(
      frames,
      [],
      nodes,
      [edge('e', 'fft', 'bp', 'bass', 'bass')],
      'audio-reactive',
      {
        silent: [black(8, 8)],
        steady: [solid(8, 8, { r: 40, g: 80, b: 120 })],
        pulse: [solid(8, 8, { r: 180, g: 40, b: 100 })],
      },
    )
    expect(result.audioReactive).toBe(true)
    expect(result.criteria.map((c) => c.id)).toContain('audio')
    expect(result.criteria).toHaveLength(6)
    expect(result.criteria.find((criterion) => criterion.id === 'audio')?.score).toBeGreaterThan(0)
  })
})

describe('personal pattern preferences', () => {
  beforeEach(() => {
    localStorage.removeItem('design-studio-for-fastled.pattern-preferences.v2')
    usePatternRatingStore.setState({ userRatingsByPatternId: {}, intentOverridesByPatternId: {} })
  })

  it('persists personal stars independently from Studio analysis', () => {
    usePatternRatingStore.getState().setUserRating('pat-1', 5)
    expect(usePatternRatingStore.getState().userRatingsByPatternId['pat-1']).toBe(5)
    expect(JSON.parse(localStorage.getItem('design-studio-for-fastled.pattern-preferences.v2') ?? '{}').userRatingsByPatternId['pat-1']).toBe(5)

    usePatternRatingStore.getState().setUserRating('pat-1', 0)
    expect(usePatternRatingStore.getState().userRatingsByPatternId['pat-1']).toBeUndefined()
  })

  it('stores an explicit intent override without changing personal stars', () => {
    usePatternRatingStore.getState().setUserRating('pat-1', 4)
    usePatternRatingStore.getState().setIntentOverride('pat-1', 'accent')
    expect(usePatternRatingStore.getState().intentOverridesByPatternId['pat-1']).toBe('accent')
    expect(usePatternRatingStore.getState().userRatingsByPatternId['pat-1']).toBe(4)
  })
})

describe('scan cancellation', () => {
  it('stops before starting another pattern', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(rateAllPatterns([], { gridW: 4, gridH: 4, groups: {}, signal: controller.signal })).resolves.toEqual([])
    const saved: SavedPattern = {
      id: 'cancel', name: 'cancel', createdAt: 0, inputs: [], outputs: [],
      subgraph: { nodes: [node('solid', 'SolidColor', 'pattern')], edges: [] },
    }
    await expect(rateAllPatterns([saved], { gridW: 4, gridH: 4, groups: {}, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

// ── Trust gate ───────────────────────────────────────────────────────────────
// Rating renders a saved pattern, so it has to clear the same trust boundary
// the live preview does. `ratePattern` asks the user (via the injectable
// `confirmTrust`) only when running the pattern would actually execute gated
// Formula/Code logic; a decline returns a `skipped` rating and never renders.
describe('ratePattern trust gate', () => {
  const opts = { gridW: 4, gridH: 4, groups: {} }

  const savedPattern = (id: string, nodes: StudioNode[], edges: StudioEdge[] = []): SavedPattern => ({
    id, name: `pattern ${id}`, createdAt: 0, inputs: [], outputs: [],
    subgraph: { nodes, edges },
  })
  const formulaPattern = (id: string) => savedPattern(id, [
    node('cf', 'CustomFormula', 'pattern', { formula: `sin(x*6+t)*0.5+0.${id.length}` }),
    node('out', 'GroupOutput', 'output'),
  ], [edge('e1', 'cf', 'out', 'frame', 'frame')])

  beforeEach(() => clearPatternContentTrustForTests())

  it('does not ask about a pattern with no Formula or Code nodes', async () => {
    const confirmTrust = vi.fn(async () => true)
    const saved = savedPattern('plain-1', [
      node('s', 'SolidColor', 'pattern', { r: 200, g: 40, b: 90 }),
      node('out', 'GroupOutput', 'output'),
    ], [edge('e1', 's', 'out', 'frame', 'frame')])

    const rating = await ratePattern(saved, { ...opts, confirmTrust })
    expect(confirmTrust).not.toHaveBeenCalled()
    expect(rating.skipped).toBeFalsy()
  })

  it('skips an untrusted pattern the user declines, without rendering it', async () => {
    const confirmTrust = vi.fn(async () => false)
    const saved = formulaPattern('decline')

    const rating = await ratePattern(saved, { ...opts, confirmTrust })
    expect(confirmTrust).toHaveBeenCalledTimes(1)
    expect(rating.skipped).toBe(true)
    expect(rating.criteria).toHaveLength(0)
    expect(rating.thumbnails).toBeUndefined()
    // A decline is "not now" — it must not harden into a remembered verdict.
    expect(isPatternContentTrusted(saved.subgraph)).toBe(false)
  })

  it('asks again on the next run after a skip, rather than caching it', async () => {
    const confirmTrust = vi.fn(async () => false)
    const saved = formulaPattern('reask')
    await ratePattern(saved, { ...opts, confirmTrust })
    await ratePattern(saved, { ...opts, confirmTrust })
    expect(confirmTrust).toHaveBeenCalledTimes(2)
  })

  it('rates a pattern the user trusts, and remembers the decision', async () => {
    const saved = formulaPattern('accept')
    const confirmTrust = vi.fn(async () => {
      // The real prompt records trust on a yes; mirror that here.
      trustPatternContent(saved.subgraph)
      return true
    })

    const rating = await ratePattern(saved, { ...opts, confirmTrust })
    expect(confirmTrust).toHaveBeenCalledTimes(1)
    expect(rating.skipped).toBeFalsy()
    expect(rating.failed).toBeFalsy()
    // The formula actually ran, so the pattern isn't blank.
    expect(rating.overall).toBeGreaterThan(0)
    expect(isPatternContentTrusted(saved.subgraph)).toBe(true)
  })

  it('does not ask about an already-trusted pattern', async () => {
    const saved = formulaPattern('pretrusted')
    trustPatternContent(saved.subgraph)
    const confirmTrust = vi.fn(async () => true)

    const rating = await ratePattern(saved, { ...opts, confirmTrust })
    expect(confirmTrust).not.toHaveBeenCalled()
    expect(rating.skipped).toBeFalsy()
  })

  it('does not ask about a bundled pattern', async () => {
    const confirmTrust = vi.fn(async () => true)
    const saved = { ...formulaPattern('bundled'), bundled: true }

    await ratePattern(saved, { ...opts, confirmTrust })
    expect(confirmTrust).not.toHaveBeenCalled()
  })
})

// A declined pattern must render blank even if it reaches the renderer — the
// trust value is threaded into evaluateGraph rather than hardcoded, so the
// gate holds independently of `patternNeedsTrust`'s scoping.
describe('captureWindows trust threading', () => {
  const saved: SavedPattern = {
    id: 'thread', name: 'thread', createdAt: 0, inputs: [], outputs: [],
    subgraph: {
      nodes: [
        node('cf', 'CustomFormula', 'pattern', { formula: '0.9' }),
        node('out', 'GroupOutput', 'output'),
      ],
      edges: [edge('e1', 'cf', 'out', 'frame', 'frame')],
    },
  }
  const anyLit = (windows: Frame[][]) =>
    windows.some((frames) => frames.some((f) => f.some((row) => row.some((p) => p.r || p.g || p.b))))

  it('renders the formula when trusted and blank when not', async () => {
    expect(anyLit(await captureWindows(saved, 4, 4, {}, true))).toBe(true)
    expect(anyLit(await captureWindows(saved, 4, 4, {}, false))).toBe(false)
  })
})
