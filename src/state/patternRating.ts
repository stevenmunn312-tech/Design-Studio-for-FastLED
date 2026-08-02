// Pattern Insights: an opinionated Studio Score judged against the pattern's
// inferred or user-selected intent, alongside a completely independent personal
// 1–5 star rating. Saved subgraphs render offline under isolated evaluator
// namespaces, then the critic examines the complete run (not just its strongest
// moment) for technical integrity, composition, tonal control, motion, temporal
// expressiveness, and — when appropriate — response across three audio scenarios.
//
// The pure metric helpers are exported and unit-tested directly on Frame arrays;
// the async driver is browser-only (it pulls the workspace matrix size and group
// registry from graphStore).

import { evaluateGraph, type Frame, type RGB, type GroupRegistry, type AudioOverride } from './graphEvaluator'
import type { StudioNode, StudioEdge } from './graphStore'
import type { SavedPattern } from './patternLibrary'
import { NODE_LIBRARY } from './nodeLibrary'
import { bandsToSpectrum } from './showAudio'
import { buildGraphDiagnostics, type GraphDiagnostic } from '../utils/validateGraph'
import { isPatternContentTrusted, patternNeedsTrust } from './patternTrust'
import { promptPatternTrust } from '../utils/trustPrompt'
import { yieldToUi } from '../components/Preview/recordCapture'
import { create } from 'zustand'

export interface CriterionScore {
  id: string
  label: string
  /** 0–1. */
  score: number
  detail: string
  weight: number
}

export type PatternIntent = 'ambient' | 'showpiece' | 'accent' | 'audio-reactive' | 'static-utility'
export type PatternVerdict = 'exceptional' | 'strong' | 'promising' | 'needs-work' | 'fundamentally-weak'

export const PATTERN_INTENTS: { id: PatternIntent; label: string; description: string }[] = [
  { id: 'ambient', label: 'Ambient', description: 'Restrained, smooth, and comfortable over long runs.' },
  { id: 'showpiece', label: 'Showpiece', description: 'Bold, structured, and designed to command attention.' },
  { id: 'accent', label: 'Accent / Sparkle', description: 'Sparse, burst-like, or deliberately punctuated.' },
  { id: 'audio-reactive', label: 'Audio-reactive', description: 'Judged on controlled, visible response to music.' },
  { id: 'static-utility', label: 'Static / Utility', description: 'Text, clocks, indicators, fills, and functional output.' },
]

export interface RatingThumbnail {
  width: number
  height: number
  /** Packed row-major RGB bytes. */
  rgb: number[]
}

export interface PatternRating {
  patternId: string
  name: string
  bundled: boolean
  /** 0–100. */
  overall: number
  intent: PatternIntent
  inferredIntent: PatternIntent
  verdict: PatternVerdict
  verdictLabel: string
  summary: string
  strengths: string[]
  improvements: string[]
  criteria: CriterionScore[]
  audioReactive: boolean
  /** A representative, strongest, and weakest moment from the same analysis. */
  thumbnails?: {
    typical?: RatingThumbnail
    strongest?: RatingThumbnail
    weakest?: RatingThumbnail
  }
  /** Versioned render-context key used to decide whether this result is reusable. */
  cacheKey: string
  /** Set when the pattern could not be rendered/scored (see `error`). */
  failed?: boolean
  error?: string
  /** Set when the user declined to trust the pattern, so it was never run. */
  skipped?: boolean
}

interface PatternRatingState {
  /** The latest analysis for each library entry. `cacheKey` decides whether it
   *  can be reused for the current graph + matrix context. */
  ratingsByPatternId: Record<string, PatternRating>
  userRatingsByPatternId: Record<string, number>
  intentOverridesByPatternId: Record<string, PatternIntent>
  publish: (rating: PatternRating) => void
  setUserRating: (patternId: string, rating: number) => void
  setIntentOverride: (patternId: string, intent: PatternIntent | null) => void
}

const RATING_STORAGE_KEY = 'design-studio-for-fastled.pattern-insights.v2'
const PREFERENCE_STORAGE_KEY = 'design-studio-for-fastled.pattern-preferences.v2'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* keep session state */ }
}

const initialRatings = loadJson<Record<string, PatternRating>>(RATING_STORAGE_KEY, {})
const initialPreferences = loadJson<{
  userRatingsByPatternId?: Record<string, number>
  intentOverridesByPatternId?: Record<string, PatternIntent>
}>(PREFERENCE_STORAGE_KEY, {})

export const usePatternRatingStore = create<PatternRatingState>((set) => ({
  ratingsByPatternId: initialRatings,
  userRatingsByPatternId: initialPreferences.userRatingsByPatternId ?? {},
  intentOverridesByPatternId: initialPreferences.intentOverridesByPatternId ?? {},
  publish: (rating) => set((state) => {
    const ratingsByPatternId = { ...state.ratingsByPatternId, [rating.patternId]: rating }
    saveJson(RATING_STORAGE_KEY, ratingsByPatternId)
    return { ratingsByPatternId }
  }),
  setUserRating: (patternId, value) => set((state) => {
    const userRatingsByPatternId = { ...state.userRatingsByPatternId }
    const rating = Math.round(Math.max(0, Math.min(5, value)))
    if (rating === 0) delete userRatingsByPatternId[patternId]
    else userRatingsByPatternId[patternId] = rating
    saveJson(PREFERENCE_STORAGE_KEY, {
      userRatingsByPatternId,
      intentOverridesByPatternId: state.intentOverridesByPatternId,
    })
    return { userRatingsByPatternId }
  }),
  setIntentOverride: (patternId, intent) => set((state) => {
    const intentOverridesByPatternId = { ...state.intentOverridesByPatternId }
    if (intent) intentOverridesByPatternId[patternId] = intent
    else delete intentOverridesByPatternId[patternId]
    saveJson(PREFERENCE_STORAGE_KEY, {
      userRatingsByPatternId: state.userRatingsByPatternId,
      intentOverridesByPatternId,
    })
    return { intentOverridesByPatternId }
  }),
}))

export function thumbnailToFrame(thumbnail?: RatingThumbnail): Frame | undefined {
  if (!thumbnail || thumbnail.width <= 0 || thumbnail.height <= 0) return undefined
  const frame: Frame = []
  for (let y = 0; y < thumbnail.height; y++) {
    const row: RGB[] = []
    for (let x = 0; x < thumbnail.width; x++) {
      const offset = (y * thumbnail.width + x) * 3
      row.push({
        r: thumbnail.rgb[offset] ?? 0,
        g: thumbnail.rgb[offset + 1] ?? 0,
        b: thumbnail.rgb[offset + 2] ?? 0,
      })
    }
    frame.push(row)
  }
  return frame
}

function packThumbnail(frame?: Frame): RatingThumbnail | undefined {
  const height = frame?.length ?? 0
  const width = frame?.[0]?.length ?? 0
  if (!frame || width === 0 || height === 0) return undefined
  const rgb: number[] = []
  for (const row of frame) for (const px of row) rgb.push(px.r, px.g, px.b)
  return { width, height, rgb }
}

/** How representative a frame is as a thumbnail: rewards good lit coverage AND
 *  colourfulness, so it favours a colourful, well-filled moment while rejecting
 *  both black frames (no coverage) and blown-out beat-flash frames (near-white,
 *  so almost no saturation). Exported for tests. */
export function frameThumbnailScore(frame: Frame): number {
  let lit = 0
  let total = 0
  let satSum = 0
  for (const row of frame) {
    for (const px of row) {
      total++
      const max = Math.max(px.r, px.g, px.b)
      const min = Math.min(px.r, px.g, px.b)
      if (max / 255 > 0.05) {
        lit++
        satSum += max > 0 ? (max - min) / max : 0
      }
    }
  }
  if (total === 0 || lit === 0) return 0
  const coverage = lit / total
  const meanSaturation = satSum / lit
  // The 0.15 floor keeps a genuinely monochrome-but-lit pattern (e.g. white
  // twinkles) from scoring zero everywhere, while saturation still dominates.
  return coverage * (0.15 + meanSaturation)
}

/** Pick the most representative captured frame for the thumbnail. */
function pickThumbnail(frames: Frame[]): Frame | undefined {
  if (frames.length === 0) return undefined
  let best = frames[0]
  let bestScore = -1
  for (const frame of frames) {
    const score = frameThumbnailScore(frame)
    if (score > bestScore) { bestScore = score; best = frame }
  }
  return best
}

// ── Capture parameters ───────────────────────────────────────────────────────
const RATE_FPS = 15
const RATE_DURATION_SEC = 1.4
const RATE_FRAMES = Math.max(2, Math.round(RATE_FPS * RATE_DURATION_SEC))
// Frames evaluated (but not scored) before the capture window, so slow-warming
// nodes — FrameFeedback's recursive buffer, Smooth's EMA, audio build-up — reach
// a representative state instead of the cold black they start at from t=0. The
// live preview looks lit only because it has been running for seconds.
const RATE_WARMUP_FRAMES = Math.max(2, Math.round(RATE_FPS * 1.2))
// A pattern's look varies moment to moment (quiet vs. peak sections, beat
// flashes, slow morphs). Capture a few windows spread across the animation and
// keep the best-scoring one, so a pattern is judged on how good it can look
// rather than whichever instant we happened to sample. GAP frames advance state
// between windows (not scored) so the windows sample genuinely different moments.
const RATE_RUNS = 2
const RATE_GAP_FRAMES = Math.max(1, Math.round(RATE_FPS * 0.8))

// ── Pixel primitives ─────────────────────────────────────────────────────────

/** LED brightness proxy used throughout the codebase (HSV "value"). 0–1. */
export function pixelBrightness(px: RGB): number {
  return Math.max(px.r, px.g, px.b) / 255
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  let acc = 0
  for (const v of values) acc += (v - m) * (v - m)
  return Math.sqrt(acc / values.length)
}

function forEachPixel(frame: Frame, fn: (px: RGB, x: number, y: number) => void): void {
  for (let y = 0; y < frame.length; y++) {
    const row = frame[y]
    if (!row) continue
    for (let x = 0; x < row.length; x++) {
      const px = row[x]
      if (px) fn(px, x, y)
    }
  }
}

/** 12-bin hue weight histogram, mirroring signalVisual.dominantAmbientColor:
 *  ignores near-black / near-grey pixels, weights by brightness × saturation². */
function hueBinWeights(frame: Frame): number[] {
  const bins = new Array(12).fill(0)
  forEachPixel(frame, (px) => {
    const r = px.r, g = px.g, b = px.b
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const chroma = max - min
    if (max < 12 || chroma < 8) return
    let hue = 0
    if (max === r) hue = ((g - b) / chroma + 6) % 6
    else if (max === g) hue = (b - r) / chroma + 2
    else hue = (r - g) / chroma + 4
    const saturation = chroma / max
    const weight = (max / 255) * saturation * saturation
    bins[Math.floor((hue * 2) % bins.length)] += weight
  })
  return bins
}

// ── Criterion helpers (pure, exported for tests) ─────────────────────────────

/** Structure / visual clarity: does the pattern actually have shape? Combines
 *  spatial brightness variation, hue diversity, and lit coverage. A black frame
 *  or a flat single-colour fill scores low; a shaped, multi-hue pattern scores
 *  high. */
export function scoreStructure(frames: Frame[]): number {
  if (frames.length === 0) return 0
  const per = frames.map((frame) => {
    const brights: number[] = []
    let lit = 0
    forEachPixel(frame, (px) => {
      const b = pixelBrightness(px)
      brights.push(b)
      if (b > 0.05) lit++
    })
    if (brights.length === 0) return 0
    const variation = clamp01(stddev(brights) / 0.3)
    const coverage = lit / brights.length
    const bins = hueBinWeights(frame)
    const total = bins.reduce((a, b) => a + b, 0)
    const distinctHues = total > 0 ? bins.filter((w) => w / total > 0.05).length : 0
    const hueDiversity = clamp01(distinctHues / 4)
    return 0.55 * variation + 0.3 * hueDiversity + 0.15 * coverage
  })
  return clamp01(mean(per))
}

/** Structural health from the shared graph diagnostics. Errors weigh heavily,
 *  warnings lightly. */
export function scoreStructuralHealth(diagnostics: GraphDiagnostic[]): number {
  let errors = 0
  let warnings = 0
  for (const d of diagnostics) {
    if (d.severity === 'error') errors++
    else warnings++
  }
  return clamp01(1 - errors * 0.4 - warnings * 0.1)
}

// ── Audio classification ─────────────────────────────────────────────────────

const AUDIO_ROLES = new Set(['bass', 'mids', 'treble', 'kick', 'snare', 'hihat', 'vocals', 'energy', 'beat', 'silence'])
const AUDIO_BAND_HANDLES = new Set(['bass', 'mids', 'treble', 'energy', 'beat', 'level', 'vocals', 'kick', 'snare', 'hihat', 'spectrum'])

const NODE_DEF = new Map(NODE_LIBRARY.map((def) => [def.type, def]))

function nodeType(node: StudioNode): string {
  return String((node.data as { nodeType?: unknown }).nodeType ?? '')
}
function nodeCategory(node: StudioNode): string {
  return String((node.data as { category?: unknown }).category ?? '')
}
function nodeSubcategory(node: StudioNode): string {
  const own = (node.data as { subcategory?: unknown }).subcategory
  if (typeof own === 'string') return own
  return NODE_DEF.get(nodeType(node))?.subcategory ?? ''
}
function groupInputRole(node: StudioNode): string {
  return String((node.data.properties as { paramId?: unknown }).paramId ?? '')
}
/** A GroupInput whose exposed port is the whole raw audio signal (as opposed to
 *  a single named band/role) is just as much a real audio source as one tagged
 *  with a band role — its `paramId` is often just "audio"/"param0". */
function groupInputIsAudioTyped(node: StudioNode): boolean {
  const outputs = (node.data as { outputs?: { dataType?: unknown }[] }).outputs
  return (outputs ?? []).some((p) => p.dataType === 'audio')
}

/** True when the subgraph is meant to react to audio: it contains an audio
 *  analyzer, an Audio-Reactive pattern node, or an audio-role GroupInput. */
export function isAudioReactiveSubgraph(nodes: StudioNode[]): boolean {
  return nodes.some((n) =>
    nodeCategory(n) === 'audio' ||
    nodeType(n) === 'MicInput' ||
    nodeSubcategory(n) === 'Audio-Reactive' ||
    (nodeType(n) === 'GroupInput' && (AUDIO_ROLES.has(groupInputRole(n)) || groupInputIsAudioTyped(n))),
  )
}

// Nodes in this category are plain signal transforms (Smooth, Math, MapRange,
// Clamp, Lerp, Ease, …): wiring an audio band through one before a consumer
// (the documented way to tame jittery FFT/beat data — see Smooth in
// nodeLibrary.ts) doesn't change *what* is driving the consumer, so a source
// found behind one of these still counts as "fed by a real audio source".
const PASSTHROUGH_CATEGORY = 'math'
const MAX_TRACE_DEPTH = 4

/** Audio correctness: audio-reactive consumers should be fed by a real audio
 *  source (an analyzer or an audio-role GroupInput), not left unwired or driven
 *  by a non-audio signal. Traces back through simple signal-conditioning nodes
 *  (see PASSTHROUGH_CATEGORY) so a Smooth'd/Math'd band still counts. */
export function scoreAudioCorrectness(nodes: StudioNode[], edges: StudioEdge[]): number {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const sourceIds = new Set(
    nodes
      .filter((n) =>
        nodeCategory(n) === 'audio' ||
        nodeType(n) === 'MicInput' ||
        (nodeType(n) === 'GroupInput' && (AUDIO_ROLES.has(groupInputRole(n)) || groupInputIsAudioTyped(n))),
      )
      .map((n) => n.id),
  )
  const hasSource = sourceIds.size > 0

  function resolvesToSource(nodeId: string, depth: number): boolean {
    if (sourceIds.has(nodeId)) return true
    if (depth >= MAX_TRACE_DEPTH) return false
    const upstream = nodeById.get(nodeId)
    if (!upstream || nodeCategory(upstream) !== PASSTHROUGH_CATEGORY) return false
    return edges.some((e) => e.target === nodeId && resolvesToSource(e.source, depth + 1))
  }

  const reactive = nodes.filter((n) => nodeSubcategory(n) === 'Audio-Reactive')

  // Consumers with band inputs actually fed from an audio source.
  let consumers = 0
  let fed = 0
  for (const node of reactive) {
    const def = NODE_DEF.get(nodeType(node))
    const bandHandles = (def?.inputs ?? [])
      .filter((p) => AUDIO_BAND_HANDLES.has(p.id) || p.dataType === 'audio')
      .map((p) => p.id)
    if (bandHandles.length === 0) continue
    consumers++
    const isFed = edges.some(
      (e) => e.target === node.id &&
        bandHandles.includes(String(e.targetHandle ?? '')) &&
        resolvesToSource(e.source, 0),
    )
    if (isFed) fed++
  }

  if (consumers === 0) {
    // No band-driven pattern nodes — grade the analyzers/inputs on being used.
    if (sourceIds.size === 0) return 0.5
    const usedSources = [...sourceIds].filter((id) => edges.some((e) => e.source === id)).length
    return clamp01(usedSources / sourceIds.size)
  }

  const fedFraction = fed / consumers
  return hasSource ? fedFraction : Math.min(fedFraction, 0.2)
}

// ── Scoring ──────────────────────────────────────────────────────────────────

const STATIC_TYPES = new Set(['SolidColor', 'Text', 'Image', 'ClockDisplay', 'GradientFrame', 'PaletteGradient'])
const ACCENT_TYPES = new Set(['TwinkleFox', 'Confetti', 'Particles', 'Starfield', 'BeatFlash', 'TrebleSparks', 'KickShock', 'RadialBurst'])
const AMBIENT_TYPES = new Set(['Pacifica', 'Noise', 'Plasma', 'FractalNoise', 'FieldNoise', 'FlowField', 'ReactionDiffusion', 'Blobs', 'TurbulentBloom', 'VocalAurora'])
const ANIMATED_TYPES = new Set([
  'TimeNode', 'Interval', 'Counter', 'Random', 'Envelope', 'Sin', 'Cos', 'Wave', 'ComplexWave',
  'BeatSin', 'HueCycle', 'PaletteSweep', 'Noise', 'Plasma', 'Rainbow', 'Pride2015', 'Pacifica',
  'TwinkleFox', 'Scanner', 'Confetti', 'Juggle', 'RadialBurst', 'Spiral', 'Kaleidoscope',
  'FractalNoise', 'GaborNoise', 'Blobs', 'Animartrix', 'Fire', 'Fire2012', 'Particles',
  'FlowField', 'Starfield', 'Boids', 'ReactionDiffusion', 'GameOfLife', 'SpectrumBars',
  'SpectrumVisualizer', 'BassPulse', 'BassRings', 'MidrangeWaves', 'MidrangeBloom',
  'TrebleSparks', 'TreblePrism', 'AudioCascade', 'BeatFlash', 'KickShock', 'VocalAurora',
  'BeatKaleidoscope', 'SpectraMosaic', 'PercussionBlobs', 'EmberPulse', 'TurbulentBloom',
  'GravityWell', 'RainRipples', 'PrismStorm', 'AudioFlow', 'ColorTrails', 'WaveSim',
])

export function inferPatternIntent(nodes: StudioNode[]): PatternIntent {
  if (isAudioReactiveSubgraph(nodes)) return 'audio-reactive'
  const types = nodes.map(nodeType)
  if (types.some((type) => ACCENT_TYPES.has(type))) return 'accent'
  if (types.some((type) => AMBIENT_TYPES.has(type))) return 'ambient'
  const visibleTypes = types.filter((type) => !['GroupInput', 'GroupOutput', 'Comment'].includes(type))
  if (visibleTypes.some((type) => STATIC_TYPES.has(type)) && !visibleTypes.some((type) => ANIMATED_TYPES.has(type))) {
    return 'static-utility'
  }
  return 'showpiece'
}

interface MotionStats {
  meanDelta: number
  spanDelta: number
}

function frameDifference(a: Frame | undefined, b: Frame | undefined): number {
  if (!a || !b) return 0
  const diffs: number[] = []
  forEachPixel(b, (px, x, y) => {
    const prev = a[y]?.[x]
    if (!prev) return
    diffs.push((Math.abs(px.r - prev.r) + Math.abs(px.g - prev.g) + Math.abs(px.b - prev.b)) / (255 * 3))
  })
  return mean(diffs)
}

function motionStats(frames: Frame[]): MotionStats {
  if (frames.length < 2) return { meanDelta: 0, spanDelta: 0 }
  const deltas: number[] = []
  for (let i = 1; i < frames.length; i++) deltas.push(frameDifference(frames[i - 1], frames[i]))
  return { meanDelta: mean(deltas), spanDelta: frameDifference(frames[0], frames[frames.length - 1]) }
}

function scoreInRange(value: number, low: number, high: number, falloff: number): number {
  if (value >= low && value <= high) return 1
  if (value < low) return clamp01(1 - (low - value) / Math.max(0.0001, falloff))
  return clamp01(1 - (value - high) / Math.max(0.0001, falloff))
}

function scoreComposition(frames: Frame[], nodes: StudioNode[], intent: PatternIntent): number {
  const raw = scoreStructure(frames)
  if (intent === 'static-utility' && nodes.some((node) => nodeType(node) === 'SolidColor')) return 0.9
  if (intent === 'ambient') return clamp01(0.48 + raw * 0.52)
  if (intent === 'accent') return clamp01(0.38 + raw * 0.62)
  return raw
}

function tonalStats(frames: Frame[]): { meanLuma: number; blackFraction: number; whiteFraction: number } {
  let total = 0, luma = 0, black = 0, white = 0
  for (const frame of frames) forEachPixel(frame, (px) => {
    const value = (0.2126 * px.r + 0.7152 * px.g + 0.0722 * px.b) / 255
    total++
    luma += value
    if (value < 0.015) black++
    if (value > 0.97 && Math.max(px.r, px.g, px.b) - Math.min(px.r, px.g, px.b) < 12) white++
  })
  return total === 0
    ? { meanLuma: 0, blackFraction: 1, whiteFraction: 0 }
    : { meanLuma: luma / total, blackFraction: black / total, whiteFraction: white / total }
}

function scoreTonalControl(frames: Frame[], intent: PatternIntent): number {
  const stats = tonalStats(frames)
  const ranges: Record<PatternIntent, [number, number, number]> = {
    ambient: [0.08, 0.55, 0.24],
    showpiece: [0.12, 0.72, 0.24],
    accent: [0.025, 0.45, 0.18],
    'audio-reactive': [0.06, 0.7, 0.24],
    'static-utility': [0.05, 0.85, 0.28],
  }
  const [low, high, falloff] = ranges[intent]
  const exposure = scoreInRange(stats.meanLuma, low, high, falloff)
  const blankPenalty = stats.blackFraction > 0.995 ? 0 : 1
  const whitePenalty = clamp01(1 - Math.max(0, stats.whiteFraction - 0.75) / 0.25)
  return clamp01(exposure * blankPenalty * whitePenalty)
}

function scoreMotionCraft(frames: Frame[], intent: PatternIntent): number {
  const { meanDelta } = motionStats(frames)
  const ranges: Record<PatternIntent, [number, number, number]> = {
    ambient: [0.001, 0.09, 0.12],
    showpiece: [0.006, 0.22, 0.16],
    accent: [0.004, 0.34, 0.2],
    'audio-reactive': [0.004, 0.34, 0.2],
    'static-utility': [0, 0.012, 0.12],
  }
  const [low, high, falloff] = ranges[intent]
  return scoreInRange(meanDelta, low, high, falloff)
}

function scoreExpressiveness(frames: Frame[], intent: PatternIntent): number {
  if (intent === 'static-utility') return 1
  const { spanDelta } = motionStats(frames)
  const target = intent === 'ambient' ? 0.035 : intent === 'showpiece' ? 0.09 : 0.065
  return clamp01(spanDelta / target)
}

function averageFrame(frames: Frame[]): Frame | undefined {
  const h = frames[0]?.length ?? 0
  const w = frames[0]?.[0]?.length ?? 0
  if (!w || !h || frames.length === 0) return undefined
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
    let r = 0, g = 0, b = 0, count = 0
    for (const frame of frames) {
      const px = frame[y]?.[x]
      if (!px) continue
      r += px.r; g += px.g; b += px.b; count++
    }
    return count ? { r: r / count, g: g / count, b: b / count } : { r: 0, g: 0, b: 0 }
  }))
}

function scoreAudioResponsiveness(scenarios: Record<string, Frame[]>): number {
  const silent = averageFrame(scenarios.silent ?? [])
  const steady = averageFrame(scenarios.steady ?? [])
  const pulse = averageFrame(scenarios.pulse ?? [])
  const separation = Math.max(
    frameDifference(silent, steady),
    frameDifference(silent, pulse),
    frameDifference(steady, pulse),
  )
  return clamp01(separation / 0.16)
}

interface CriterionSpec {
  id: string
  label: string
  weight: number
  score: number
  detail: (score: number) => string
}

function pct(score: number): number {
  return Math.round(score * 100)
}

/** Combine the criterion scores of one pattern into a 0–100 rating, renormalising
 *  weights over the criteria that actually apply (audio is omitted when the
 *  pattern isn't audio-reactive). */
export function scorePattern(
  frames: Frame[],
  diagnostics: GraphDiagnostic[],
  nodes: StudioNode[],
  edges: StudioEdge[],
  requestedIntent?: PatternIntent,
  scenarios: Record<string, Frame[]> = {},
): {
  overall: number
  criteria: CriterionScore[]
  audioReactive: boolean
  intent: PatternIntent
  inferredIntent: PatternIntent
  verdict: PatternVerdict
  verdictLabel: string
  summary: string
  strengths: string[]
  improvements: string[]
} {
  const audioReactive = isAudioReactiveSubgraph(nodes)
  const inferredIntent = inferPatternIntent(nodes)
  const intent = requestedIntent ?? inferredIntent

  const specs: CriterionSpec[] = [
    {
      id: 'technical', label: 'Technical integrity', weight: 0.18,
      score: scoreStructuralHealth(diagnostics),
      detail: (s) => s >= 0.99 ? 'The graph is clean and complete' : s >= 0.6 ? 'Minor graph warnings need review' : 'Graph errors undermine the result',
    },
    {
      id: 'composition', label: 'Spatial composition', weight: 0.22,
      score: scoreComposition(frames, nodes, intent),
      detail: (s) => s >= 0.8 ? 'Uses the matrix with clear intent' : s >= 0.55 ? 'The composition reads, but lacks definition' : 'The frame feels unresolved for this intent',
    },
    {
      id: 'tone', label: 'Colour & tonal control', weight: 0.18,
      score: scoreTonalControl(frames, intent),
      detail: (s) => s >= 0.8 ? 'Brightness and colour remain controlled' : s >= 0.55 ? 'Some passages lose tonal separation' : 'Output is crushed, empty, or overexposed',
    },
    {
      id: 'motion', label: 'Motion craft', weight: intent === 'static-utility' ? 0.14 : 0.22,
      score: scoreMotionCraft(frames, intent),
      detail: (s) => s >= 0.8 ? 'Motion suits the pattern’s intent' : s >= 0.55 ? 'Pacing is usable but uneven' : intent === 'static-utility' ? 'Unexpected motion distracts from its function' : 'Motion is either inert or too erratic',
    },
    {
      id: 'expressiveness', label: 'Expressiveness over time', weight: intent === 'static-utility' ? 0.1 : 0.2,
      score: scoreExpressiveness(frames, intent),
      detail: (s) => s >= 0.8 ? 'Develops meaningfully across the captured run' : s >= 0.55 ? 'Some evolution, but the range is narrow' : intent === 'static-utility' ? 'Stable and readable' : 'Changes too little to sustain interest',
    },
  ]

  if (intent === 'audio-reactive') {
    specs.push({
      id: 'audio', label: 'Audio responsiveness', weight: 0.22,
      score: scoreAudioCorrectness(nodes, edges) * scoreAudioResponsiveness(scenarios),
      detail: (s) => s >= 0.8 ? 'Music creates a clear, controlled response' : s >= 0.5 ? 'Audio response is present but subtle or uneven' : 'Audio wiring or visible response is too weak',
    })
  }

  const totalWeight = specs.reduce((a, s) => a + s.weight, 0)
  let overall = pct(specs.reduce((a, s) => a + s.score * s.weight, 0) / totalWeight)
  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  const { blackFraction } = tonalStats(frames)
  if (hasError) overall = Math.min(overall, 49)
  if (blackFraction > 0.995) overall = Math.min(overall, 29)
  const criteria: CriterionScore[] = specs.map((s) => ({
    id: s.id, label: s.label, score: s.score, weight: s.weight, detail: s.detail(s.score),
  }))
  const { id: verdict, label: verdictLabel } = verdictForScore(overall)
  const ranked = [...criteria].sort((a, b) => b.score - a.score)
  const strengths = ranked.filter((criterion) => criterion.score >= 0.72).slice(0, 2).map((criterion) => criterion.detail)
  const improvements = [...criteria].sort((a, b) => a.score - b.score).slice(0, 2).map((criterion) => criterion.detail)
  const intentLabel = PATTERN_INTENTS.find((entry) => entry.id === intent)?.label ?? intent
  const weakest = [...criteria].sort((a, b) => a.score - b.score)[0]
  const summary = `${verdictLabel} for ${intentLabel}. ${weakest?.detail ?? 'No critique available.'}`
  return {
    overall, criteria, audioReactive, intent, inferredIntent, verdict, verdictLabel,
    summary, strengths, improvements,
  }
}

export function verdictForScore(score: number): { id: PatternVerdict; label: string } {
  if (score >= 90) return { id: 'exceptional', label: 'Exceptional' }
  if (score >= 75) return { id: 'strong', label: 'Strong' }
  if (score >= 60) return { id: 'promising', label: 'Promising' }
  if (score >= 40) return { id: 'needs-work', label: 'Needs work' }
  return { id: 'fundamentally-weak', label: 'Fundamentally weak' }
}

// ── Offline rendering + driver (browser-only) ────────────────────────────────

let rateSerial = 0

type AudioScenario = 'silent' | 'steady' | 'pulse'

/** Deterministic audio scenarios let the critic distinguish "looks good during
 *  one sweep" from a pattern that behaves coherently in silence, sustained
 *  energy, and beat-heavy material. */
function audioForFrame(i: number, scenario: AudioScenario): { override: AudioOverride; roles: Record<string, number | boolean> } {
  const t = i / RATE_FPS
  const bass = scenario === 'silent' ? 0 : scenario === 'steady' ? 0.58 : 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.7 * t)
  const mids = scenario === 'silent' ? 0 : scenario === 'steady' ? 0.42 : 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.1 * t + 1)
  const treble = scenario === 'silent' ? 0 : scenario === 'steady' ? 0.34 : 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.7 * t + 2)
  const beat = scenario === 'pulse' && i % Math.max(1, Math.round(RATE_FPS * 0.5)) === 0
  const spectrum = bandsToSpectrum(bass, mids, treble)
  const override: AudioOverride = {
    active: true, micActive: true, beat, bpm: 120,
    bass, mids, treble, micBass: bass, micMids: mids, micTreble: treble,
    spectrum, detectorSpectrum: spectrum,
  }
  const roles: Record<string, number | boolean> = {
    bass, mids, treble, kick: bass, snare: mids, hihat: treble, vocals: mids,
    energy: (bass + mids + treble) / 3, beat, silence: scenario === 'silent',
  }
  return { override, roles }
}

/** Deep-copy a pooled evaluator frame (buffers are recycled between passes). */
function copyFrame(frame: Frame): Frame {
  return frame.map((row) => row.map((px) => ({ r: px.r, g: px.g, b: px.b })))
}

/** Render a pattern subgraph to RATE_RUNS scoring windows (each RATE_FRAMES
 *  frames), spread across the animation after a warm-up prefix, under one
 *  isolated evaluator namespace with continuous ticks and swept audio. The
 *  windows sample different moments so the caller can keep the best. Exported
 *  for tests. */
export async function captureWindows(
  saved: SavedPattern, w: number, h: number, groups: GroupRegistry,
  // Whether this pattern's Formula/Code nodes may run — resolved by the caller
  // (`ratePattern`) from the content-addressed trust store, plus the user's
  // answer to the trust prompt. Passed through rather than hardcoded so a
  // declined pattern renders blank even if it somehow reaches here.
  trusted = true,
  scenario: AudioScenario = 'pulse',
  runs = RATE_RUNS,
  signal?: AbortSignal,
): Promise<Frame[][]> {
  const groupId = `__rate_group_${saved.id}`
  const prefix = `__rate_${rateSerial++}/`
  const registry: GroupRegistry = { ...groups, [groupId]: saved.subgraph }
  let i = 0
  // One continuous evaluation on a single prefix keeps state (feedback, EMAs,
  // audio build-up) coherent across warm-up, windows, and the gaps between them.
  const step = async (): Promise<Frame> => {
    if (signal?.aborted) throw new DOMException('Pattern scan cancelled', 'AbortError')
    const tick = (i * 60) / RATE_FPS
    const { override, roles } = audioForFrame(i, scenario)
    i++
    // Per-frame guard, mirroring the live preview loop: a single malformed
    // frame is skipped (rendered as blank) rather than tearing down the rating.
    let rendered: Frame | null = null
    try {
      rendered = evaluateGraph(
        saved.subgraph.nodes, saved.subgraph.edges, tick, w, h, registry,
        prefix, new Set([groupId]), roles, override, trusted,
      )
    } catch {
      rendered = null
    }
    if (i % 8 === 0) await yieldToUi()
    return rendered ? copyFrame(rendered) : blankFrame(w, h)
  }

  for (let k = 0; k < RATE_WARMUP_FRAMES; k++) await step()
  const windows: Frame[][] = []
  for (let run = 0; run < runs; run++) {
    const frames: Frame[] = []
    for (let k = 0; k < RATE_FRAMES; k++) frames.push(await step())
    windows.push(frames)
    if (run < runs - 1) for (let k = 0; k < RATE_GAP_FRAMES; k++) await step()
  }
  return windows
}

function blankFrame(w: number, h: number): Frame {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ r: 0, g: 0, b: 0 })))
}

export interface RateOptions {
  gridW: number
  gridH: number
  groups: GroupRegistry
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  /** Asks the user whether an untrusted pattern may run its Formula/Code nodes.
   *  Defaults to the real dialog; injectable so tests don't need the UI store. */
  confirmTrust?: (saved: SavedPattern) => Promise<boolean>
}

const ANALYSIS_VERSION = 2

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, canonicalize(entry)]))
}

function analysisGraph(saved: SavedPattern): unknown {
  return {
    inputs: saved.inputs,
    outputs: saved.outputs,
    nodes: saved.subgraph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: {
        nodeType: node.data.nodeType,
        properties: node.data.properties,
        inputs: node.data.inputs,
        outputs: node.data.outputs,
      },
    })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: saved.subgraph.edges.map((edge) => ({
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
}

function referencedGroupContent(saved: SavedPattern, groups: GroupRegistry): unknown {
  const found: Record<string, unknown> = {}
  const pending = saved.subgraph.nodes
    .filter((node) => nodeType(node) === 'Group')
    .map((node) => String((node.data.properties as { groupId?: unknown }).groupId ?? ''))
  const seen = new Set<string>()
  while (pending.length > 0) {
    const id = pending.shift() ?? ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const group = groups[id]
    if (!group) { found[id] = null; continue }
    found[id] = group
    for (const node of group.nodes) {
      if (nodeType(node) === 'Group') pending.push(String((node.data.properties as { groupId?: unknown }).groupId ?? ''))
    }
  }
  return found
}

// In-session memo complements the persistent store and avoids serialising work
// twice during React StrictMode's development remount.
const ratingCache = new Map<string, PatternRating>()

export function patternRatingKey(saved: SavedPattern, opts: Pick<RateOptions, 'gridW' | 'gridH' | 'groups'>, intent?: PatternIntent): string {
  const payload = JSON.stringify(canonicalize({
    version: ANALYSIS_VERSION,
    gridW: opts.gridW,
    gridH: opts.gridH,
    intent: intent ?? inferPatternIntent(saved.subgraph.nodes),
    graph: analysisGraph(saved),
    groups: referencedGroupContent(saved, opts.groups),
  }))
  let hash = 2166136261
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `v${ANALYSIS_VERSION}:${opts.gridW}x${opts.gridH}:${intent ?? inferPatternIntent(saved.subgraph.nodes)}:${(hash >>> 0).toString(36)}`
}

export function ratingTier(score: number): 'good' | 'ok' | 'bad' {
  return score >= 75 ? 'good' : score >= 50 ? 'ok' : 'bad'
}

/** Rate one saved pattern (rendered + analysed). Browser-only. Never throws —
 *  a pattern that can't be rendered or scored resolves to a `failed` rating so
 *  one bad entry can't stall the whole batch. */
export async function ratePattern(saved: SavedPattern, opts: RateOptions): Promise<PatternRating> {
  const inferredIntent = inferPatternIntent(saved.subgraph.nodes)
  const intent = usePatternRatingStore.getState().intentOverridesByPatternId[saved.id] ?? inferredIntent
  const key = patternRatingKey(saved, opts, intent)
  const cached = ratingCache.get(key) ?? Object.values(usePatternRatingStore.getState().ratingsByPatternId)
    .find((entry) => !entry.skipped && entry.cacheKey === key)
  if (cached) {
    const current = { ...cached, name: saved.name, bundled: !!saved.bundled }
    usePatternRatingStore.getState().publish(current)
    return current
  }

  // Rating runs the pattern, so it has to clear the same trust boundary the
  // live preview does. Curated bundled patterns ship with the app and are
  // trusted by definition; anything else is checked against the
  // content-addressed trust store, and the user is asked only when running it
  // would actually execute gated Formula/Code logic.
  let trusted = saved.bundled || isPatternContentTrusted(saved.subgraph)
  if (!trusted && patternNeedsTrust(saved.subgraph, opts.groups)) {
    trusted = await (opts.confirmTrust ?? promptPatternTrust)(saved)
    if (!trusted) {
      const skipped: PatternRating = {
        patternId: saved.id, name: saved.name, bundled: !!saved.bundled,
        overall: 0, intent, inferredIntent, verdict: 'fundamentally-weak',
        verdictLabel: 'Not assessed', summary: 'Trust is required before Studio can judge this pattern.',
        strengths: [], improvements: [], criteria: [], audioReactive: false,
        skipped: true, cacheKey: key,
      }
      // Deliberately not cached: a skip is "not now", so reopening the ratings
      // popup asks again rather than leaving an unrateable card for the session.
      usePatternRatingStore.getState().publish(skipped)
      return skipped
    }
  }

  let rating: PatternRating
  try {
    // Logged before the (synchronous, un-interruptible) render so that if a
    // pathological pattern hangs the tab, the last line in the console names it.
    console.debug(`[patternRating] rating "${saved.name}"`)
    const startedAt = performance.now()
    const audioReactive = isAudioReactiveSubgraph(saved.subgraph.nodes) || intent === 'audio-reactive'
    const scenarios: Record<string, Frame[]> = {}
    if (audioReactive) {
      for (const scenario of ['silent', 'steady', 'pulse'] as const) {
        scenarios[scenario] = (await captureWindows(saved, opts.gridW, opts.gridH, opts.groups, trusted, scenario, 1, opts.signal))[0] ?? []
      }
    } else {
      scenarios.motion = (await captureWindows(saved, opts.gridW, opts.gridH, opts.groups, trusted, 'pulse', RATE_RUNS, opts.signal)).flat()
    }
    const frames = Object.values(scenarios).flat()
    const elapsed = performance.now() - startedAt
    if (elapsed > 3000) console.warn(`[patternRating] "${saved.name}" took ${Math.round(elapsed)}ms to render — consider simplifying it`)
    const diagnostics = buildGraphDiagnostics(saved.subgraph.nodes, saved.subgraph.edges, { target: 'group' })
    // Judge the whole run. Strong moments inform the thumbnail, but weak ones
    // remain in every criterion instead of disappearing behind a best-window pick.
    const scored = scorePattern(frames, diagnostics, saved.subgraph.nodes, saved.subgraph.edges, intent, scenarios)
    const ordered = [...frames].sort((a, b) => frameThumbnailScore(a) - frameThumbnailScore(b))
    const weakest = ordered[0]
    const typical = ordered[Math.floor(ordered.length / 2)]
    const strongest = pickThumbnail(frames)
    rating = {
      patternId: saved.id, name: saved.name, bundled: !!saved.bundled,
      ...scored,
      thumbnails: {
        weakest: packThumbnail(weakest),
        typical: packThumbnail(typical),
        strongest: packThumbnail(strongest),
      },
      cacheKey: key,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    console.warn(`[patternRating] failed to rate "${saved.name}"`, err)
    rating = {
      patternId: saved.id, name: saved.name, bundled: !!saved.bundled,
      overall: 0, intent, inferredIntent, verdict: 'fundamentally-weak',
      verdictLabel: 'Could not assess', summary: 'The pattern could not be rendered safely enough to judge.',
      strengths: [], improvements: ['Fix the render failure, then scan again.'],
      criteria: [], audioReactive: false, cacheKey: key,
      failed: true, error: err instanceof Error ? err.message : String(err),
    }
  }
  ratingCache.set(key, rating)
  usePatternRatingStore.getState().publish(rating)
  return rating
}

/** Rate every saved pattern, yielding progress. Sorted worst-first is left to
 *  the caller. */
export async function rateAllPatterns(patterns: SavedPattern[], opts: RateOptions): Promise<PatternRating[]> {
  const results: PatternRating[] = []
  for (let i = 0; i < patterns.length; i++) {
    if (opts.signal?.aborted) throw new DOMException('Pattern scan cancelled', 'AbortError')
    results.push(await ratePattern(patterns[i], opts))
    opts.onProgress?.(i + 1, patterns.length)
    await yieldToUi()
  }
  return results
}
