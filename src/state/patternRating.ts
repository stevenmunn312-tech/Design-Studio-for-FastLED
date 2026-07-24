// Pattern quality ratings. Renders each saved pattern's subgraph offline (the
// same isolated-namespace trick recordCapture / evaluateScalarSeries use, so the
// live preview's stateful nodes are never disturbed) and reduces the resulting
// frames to a set of 0–1 criterion scores, combined with the graph diagnostics.
// The criteria mirror the qualities a user cares about on a physical matrix:
// visible structure, clean neutrals (no unwanted R/G/B tint), even brightness
// (no lone blown pixels), refresh stability (no flicker), a healthy graph, and —
// for audio-reactive patterns — correct audio wiring.
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
import { yieldToUi } from '../components/Preview/recordCapture'

export interface CriterionScore {
  id: string
  label: string
  /** 0–1. */
  score: number
  detail: string
  weight: number
}

export interface PatternRating {
  patternId: string
  name: string
  bundled: boolean
  /** 0–100. */
  overall: number
  criteria: CriterionScore[]
  audioReactive: boolean
  /** A representative (brightest) rendered frame, for a preview thumbnail. */
  thumbnail?: Frame
  /** Set when the pattern could not be rendered/scored (see `error`). */
  failed?: boolean
  error?: string
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
const RATE_FPS = 20
const RATE_DURATION_SEC = 1.5
const RATE_FRAMES = Math.max(2, Math.round(RATE_FPS * RATE_DURATION_SEC))
// Frames evaluated (but not scored) before the capture window, so slow-warming
// nodes — FrameFeedback's recursive buffer, Smooth's EMA, audio build-up — reach
// a representative state instead of the cold black they start at from t=0. The
// live preview looks lit only because it has been running for seconds.
const RATE_WARMUP_FRAMES = Math.max(2, Math.round(RATE_FPS * 2))
// A pattern's look varies moment to moment (quiet vs. peak sections, beat
// flashes, slow morphs). Capture a few windows spread across the animation and
// keep the best-scoring one, so a pattern is judged on how good it can look
// rather than whichever instant we happened to sample. GAP frames advance state
// between windows (not scored) so the windows sample genuinely different moments.
const RATE_RUNS = 3
const RATE_GAP_FRAMES = Math.max(1, Math.round(RATE_FPS * 1))

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

/** Colour balance: pixels meant to read neutral (bright but low-saturation —
 *  whites and pastels) should not carry a consistent R/G/B tint. Returns 1 when
 *  the pattern has no such pixels (a vivid, fully-saturated pattern is not
 *  judged here). */
export function scoreColorBalance(frames: Frame[]): number {
  let sumR = 0, sumG = 0, sumB = 0, count = 0
  for (const frame of frames) {
    forEachPixel(frame, (px) => {
      const max = Math.max(px.r, px.g, px.b)
      const min = Math.min(px.r, px.g, px.b)
      if (max < 60) return
      const saturation = max > 0 ? (max - min) / max : 0
      if (saturation >= 0.35) return // intentionally coloured, not a neutral
      sumR += px.r; sumG += px.g; sumB += px.b; count++
    })
  }
  if (count === 0) return 1
  const r = sumR / count, g = sumG / count, b = sumB / count
  const avg = (r + g + b) / 3
  if (avg <= 0) return 1
  const tint = (Math.max(r, g, b) - Math.min(r, g, b)) / avg
  return clamp01(1 - tint / 0.18)
}

/** Brightness uniformity: penalise lone pixels that are far brighter than their
 *  immediate neighbourhood (a blown pixel on a dark field). Averaged over
 *  frames; lenient denominator so genuinely sparse patterns aren't wrecked. */
export function scoreBrightnessUniformity(frames: Frame[]): number {
  const per = frames.map((frame) => {
    const h = frame.length
    const w = frame[0]?.length ?? 0
    if (w === 0 || h === 0) return 1
    let lit = 0
    let outliers = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = frame[y]?.[x]
        if (!px) continue
        const b = pixelBrightness(px)
        if (b <= 0.05) continue
        lit++
        let neigh = 0
        let nCount = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const np = frame[y + dy]?.[x + dx]
            if (!np) continue
            neigh += pixelBrightness(np)
            nCount++
          }
        }
        const neighMean = nCount > 0 ? neigh / nCount : 0
        if (b - neighMean > 0.6 && neighMean < 0.1) outliers++
      }
    }
    if (lit === 0) return 1
    return clamp01(1 - (outliers / lit) / 0.25)
  })
  return clamp01(mean(per))
}

/** Refresh stability: measures the average frame-to-frame brightness change.
 *  A fully static pattern is neutral (1). Smooth motion stays high; chaotic
 *  full-range flicker drives the score down. */
export function scoreRefreshStability(frames: Frame[]): number {
  if (frames.length < 2) return 1
  const deltas: number[] = []
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]
    const cur = frames[i]
    const diffs: number[] = []
    forEachPixel(cur, (px, x, y) => {
      const pp = prev[y]?.[x]
      if (!pp) return
      diffs.push(Math.abs(pixelBrightness(px) - pixelBrightness(pp)))
    })
    deltas.push(mean(diffs))
  }
  const meanDelta = mean(deltas)
  if (meanDelta < 0.02) return 1 // effectively static — not flicker
  return clamp01(1 - (meanDelta - 0.12) / 0.28)
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

/** True when the subgraph is meant to react to audio: it contains an audio
 *  analyzer, an Audio-Reactive pattern node, or an audio-role GroupInput. */
export function isAudioReactiveSubgraph(nodes: StudioNode[]): boolean {
  return nodes.some((n) =>
    nodeCategory(n) === 'audio' ||
    nodeType(n) === 'MicInput' ||
    nodeSubcategory(n) === 'Audio-Reactive' ||
    (nodeType(n) === 'GroupInput' && AUDIO_ROLES.has(groupInputRole(n))),
  )
}

/** Audio correctness: audio-reactive consumers should be fed by a real audio
 *  source (an analyzer or an audio-role GroupInput), not left unwired or driven
 *  by a non-audio signal. */
export function scoreAudioCorrectness(nodes: StudioNode[], edges: StudioEdge[]): number {
  const sourceIds = new Set(
    nodes
      .filter((n) =>
        nodeCategory(n) === 'audio' ||
        nodeType(n) === 'MicInput' ||
        (nodeType(n) === 'GroupInput' && AUDIO_ROLES.has(groupInputRole(n))),
      )
      .map((n) => n.id),
  )
  const hasSource = sourceIds.size > 0

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
        sourceIds.has(e.source),
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
): { overall: number; criteria: CriterionScore[]; audioReactive: boolean } {
  const audioReactive = isAudioReactiveSubgraph(nodes)

  const specs: CriterionSpec[] = [
    {
      id: 'structure', label: 'Clarity & structure', weight: 0.25,
      score: scoreStructure(frames),
      detail: (s) => s >= 0.6 ? 'Clear, well-defined shape' : s >= 0.35 ? 'Some structure, could be bolder' : 'Little visible structure — looks flat or empty',
    },
    {
      id: 'color', label: 'Colour balance', weight: 0.15,
      score: scoreColorBalance(frames),
      detail: (s) => s >= 0.8 ? 'Neutrals read clean' : s >= 0.5 ? 'Slight colour tint on neutral tones' : 'Whites/pastels carry an unwanted colour tint',
    },
    {
      id: 'brightness', label: 'Brightness uniformity', weight: 0.15,
      score: scoreBrightnessUniformity(frames),
      detail: (s) => s >= 0.8 ? 'Even brightness across the matrix' : s >= 0.5 ? 'A few pixels brighter than their neighbours' : 'Lone over-bright pixels stand out',
    },
    {
      id: 'stability', label: 'Refresh stability', weight: 0.2,
      score: scoreRefreshStability(frames),
      detail: (s) => s >= 0.8 ? 'Smooth, no flicker' : s >= 0.5 ? 'Some rapid frame-to-frame jumps' : 'Heavy flicker — output changes erratically',
    },
    {
      id: 'health', label: 'Graph health', weight: 0.15,
      score: scoreStructuralHealth(diagnostics),
      detail: (s) => s >= 0.99 ? 'No graph issues' : s >= 0.6 ? 'Minor graph warnings' : 'Graph errors — may not render correctly',
    },
  ]

  if (audioReactive) {
    specs.push({
      id: 'audio', label: 'Audio wiring', weight: 0.1,
      score: scoreAudioCorrectness(nodes, edges),
      detail: (s) => s >= 0.8 ? 'Audio nodes correctly wired' : s >= 0.4 ? 'Some audio inputs left unconnected' : 'Audio-reactive but not wired to an audio source',
    })
  }

  const totalWeight = specs.reduce((a, s) => a + s.weight, 0)
  const overall = pct(specs.reduce((a, s) => a + s.score * s.weight, 0) / totalWeight)
  const criteria: CriterionScore[] = specs.map((s) => ({
    id: s.id, label: s.label, score: s.score, weight: s.weight, detail: s.detail(s.score),
  }))
  return { overall, criteria, audioReactive }
}

// ── Offline rendering + driver (browser-only) ────────────────────────────────

let rateSerial = 0

/** Swept synthetic audio so audio-reactive patterns animate during rating
 *  instead of rendering black. */
function audioForFrame(i: number): { override: AudioOverride; roles: Record<string, number | boolean> } {
  const t = i / RATE_FPS
  const bass = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.7 * t)
  const mids = 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.1 * t + 1)
  const treble = 0.5 + 0.5 * Math.sin(2 * Math.PI * 1.7 * t + 2)
  const beat = i % Math.max(1, Math.round(RATE_FPS * 0.5)) === 0
  const spectrum = bandsToSpectrum(bass, mids, treble)
  const override: AudioOverride = {
    active: true, micActive: true, beat, bpm: 120,
    bass, mids, treble, micBass: bass, micMids: mids, micTreble: treble,
    spectrum, detectorSpectrum: spectrum,
  }
  const roles: Record<string, number | boolean> = {
    bass, mids, treble, kick: bass, snare: mids, hihat: treble, vocals: mids,
    energy: (bass + mids + treble) / 3, beat, silence: false,
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
): Promise<Frame[][]> {
  const groupId = `__rate_group_${saved.id}`
  const prefix = `__rate_${rateSerial++}/`
  const registry: GroupRegistry = { ...groups, [groupId]: saved.subgraph }
  let i = 0
  // One continuous evaluation on a single prefix keeps state (feedback, EMAs,
  // audio build-up) coherent across warm-up, windows, and the gaps between them.
  const step = async (): Promise<Frame> => {
    const tick = (i * 60) / RATE_FPS
    const { override, roles } = audioForFrame(i)
    i++
    // Per-frame guard, mirroring the live preview loop: a single malformed
    // frame is skipped (rendered as blank) rather than tearing down the rating.
    let rendered: Frame | null = null
    try {
      rendered = evaluateGraph(
        saved.subgraph.nodes, saved.subgraph.edges, tick, w, h, registry,
        prefix, new Set([groupId]), roles, override, true,
      )
    } catch {
      rendered = null
    }
    if (i % 8 === 0) await yieldToUi()
    return rendered ? copyFrame(rendered) : blankFrame(w, h)
  }

  for (let k = 0; k < RATE_WARMUP_FRAMES; k++) await step()
  const windows: Frame[][] = []
  for (let run = 0; run < RATE_RUNS; run++) {
    const frames: Frame[] = []
    for (let k = 0; k < RATE_FRAMES; k++) frames.push(await step())
    windows.push(frames)
    if (run < RATE_RUNS - 1) for (let k = 0; k < RATE_GAP_FRAMES; k++) await step()
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
}

// In-session memo so reopening the popup doesn't recompute unchanged patterns.
const ratingCache = new Map<string, PatternRating>()

function cacheKey(saved: SavedPattern): string {
  return `${saved.id}|${saved.name}|${JSON.stringify(saved.subgraph)}`
}

/** Rate one saved pattern (rendered + analysed). Browser-only. Never throws —
 *  a pattern that can't be rendered or scored resolves to a `failed` rating so
 *  one bad entry can't stall the whole batch. */
export async function ratePattern(saved: SavedPattern, opts: RateOptions): Promise<PatternRating> {
  const key = cacheKey(saved)
  const cached = ratingCache.get(key)
  if (cached) return cached

  let rating: PatternRating
  try {
    // Logged before the (synchronous, un-interruptible) render so that if a
    // pathological pattern hangs the tab, the last line in the console names it.
    console.debug(`[patternRating] rating "${saved.name}"`)
    const startedAt = performance.now()
    const windows = await captureWindows(saved, opts.gridW, opts.gridH, opts.groups)
    const elapsed = performance.now() - startedAt
    if (elapsed > 3000) console.warn(`[patternRating] "${saved.name}" took ${Math.round(elapsed)}ms to render — consider simplifying it`)
    const diagnostics = buildGraphDiagnostics(saved.subgraph.nodes, saved.subgraph.edges, { target: 'group' })
    // Score each window; keep the best. A pattern is judged on its strongest
    // moment (and its thumbnail comes from that same window) rather than on
    // whichever instant we happened to sample.
    let best: { overall: number; criteria: CriterionScore[]; audioReactive: boolean; thumbnail?: Frame } | null = null
    for (const frames of windows) {
      const scored = scorePattern(frames, diagnostics, saved.subgraph.nodes, saved.subgraph.edges)
      if (!best || scored.overall > best.overall) {
        best = { ...scored, thumbnail: pickThumbnail(frames) }
      }
    }
    rating = {
      patternId: saved.id, name: saved.name, bundled: !!saved.bundled,
      overall: best?.overall ?? 0, criteria: best?.criteria ?? [],
      audioReactive: best?.audioReactive ?? false, thumbnail: best?.thumbnail,
    }
  } catch (err) {
    console.warn(`[patternRating] failed to rate "${saved.name}"`, err)
    rating = {
      patternId: saved.id, name: saved.name, bundled: !!saved.bundled,
      overall: 0, criteria: [], audioReactive: false,
      failed: true, error: err instanceof Error ? err.message : String(err),
    }
  }
  ratingCache.set(key, rating)
  return rating
}

/** Rate every saved pattern, yielding progress. Sorted worst-first is left to
 *  the caller. */
export async function rateAllPatterns(patterns: SavedPattern[], opts: RateOptions): Promise<PatternRating[]> {
  const results: PatternRating[] = []
  for (let i = 0; i < patterns.length; i++) {
    results.push(await ratePattern(patterns[i], opts))
    opts.onProgress?.(i + 1, patterns.length)
    await yieldToUi()
  }
  return results
}
