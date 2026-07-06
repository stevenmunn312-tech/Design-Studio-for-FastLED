import { useSyncExternalStore } from 'react'

const DEV_PERF_VISIBLE_KEY = 'fastled-studio-dev-perf-visible'
const SAMPLE_WINDOW = 180
const SNAPSHOT_INTERVAL_MS = 250
export const FRAME_BUDGET_MS = 1000 / 60

export type PerfPhase = 'gap' | 'frame' | 'eval' | 'show' | 'draw' | 'publish'

export interface PerfMetricSummary {
  latest: number
  avg: number
  p95: number
  max: number
}

export interface PerfContext {
  nodes: number
  edges: number
  groups: number
  outputs: number
  gridW: number
  gridH: number
  canvasW: number
  canvasH: number
  renderer: 'webgl' | '2d'
  previewStyle: string
  stageMode: boolean
  preview3d: boolean
  micActive: boolean
  audioReactive: boolean
  hidden: boolean
  hasSignal: boolean
}

export interface PerfFrameSample {
  now: number
  gapMs: number
  frameMs: number
  evalMs: number
  showMs: number
  drawMs: number
  publishMs: number
  context: PerfContext
}

export interface PerfLongTaskSummary {
  supported: boolean
  count: number
  totalMs: number
  latestMs: number
  worstMs: number
}

export interface PerfSnapshot {
  visible: boolean
  sampleCount: number
  overBudgetFrames: number
  stallFrames: number
  lastUpdatedAt: number
  bottleneck: 'eval' | 'show' | 'draw' | 'publish' | 'mixed'
  metrics: Record<PerfPhase, PerfMetricSummary>
  longTasks: PerfLongTaskSummary
  context: PerfContext
}

interface PerfDebugApi {
  getSnapshot: () => PerfSnapshot
  hide: () => void
  reset: () => void
  show: () => void
  toggle: () => void
}

const ZERO_METRIC: PerfMetricSummary = { latest: 0, avg: 0, p95: 0, max: 0 }
const EMPTY_CONTEXT: PerfContext = {
  nodes: 0,
  edges: 0,
  groups: 0,
  outputs: 0,
  gridW: 0,
  gridH: 0,
  canvasW: 0,
  canvasH: 0,
  renderer: '2d',
  previewStyle: 'standard',
  stageMode: false,
  preview3d: false,
  micActive: false,
  audioReactive: false,
  hidden: false,
  hasSignal: false,
}

const BOTTLENECK_PHASES: Array<Exclude<PerfPhase, 'gap' | 'frame'>> = ['eval', 'show', 'draw', 'publish']

const listeners = new Set<() => void>()

let phaseBuffers: Record<PerfPhase, number[]> = {
  gap: [],
  frame: [],
  eval: [],
  show: [],
  draw: [],
  publish: [],
}
let sampleCount = 0
let overBudgetFrames = 0
let stallFrames = 0
let longTaskSupported = false
let longTaskCount = 0
let longTaskTotalMs = 0
let longTaskLatestMs = 0
let longTaskWorstMs = 0
let lastSnapshotAt = 0
let observerStarted = false

function loadVisible(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return JSON.parse(localStorage.getItem(DEV_PERF_VISIBLE_KEY) ?? 'false') === true
  } catch {
    return false
  }
}

let snapshot: PerfSnapshot = {
  visible: loadVisible(),
  sampleCount: 0,
  overBudgetFrames: 0,
  stallFrames: 0,
  lastUpdatedAt: 0,
  bottleneck: 'mixed',
  metrics: {
    gap: ZERO_METRIC,
    frame: ZERO_METRIC,
    eval: ZERO_METRIC,
    show: ZERO_METRIC,
    draw: ZERO_METRIC,
    publish: ZERO_METRIC,
  },
  longTasks: {
    supported: false,
    count: 0,
    totalMs: 0,
    latestMs: 0,
    worstMs: 0,
  },
  context: EMPTY_CONTEXT,
}

function notify() {
  for (const listener of listeners) listener()
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  if (lower === upper) return sorted[lower]
  const weight = pos - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export function summarizePerfMetric(values: number[]): PerfMetricSummary {
  if (!values.length) return ZERO_METRIC
  const total = values.reduce((sum, value) => sum + value, 0)
  const sorted = [...values].sort((a, b) => a - b)
  return {
    latest: round(values[values.length - 1]),
    avg: round(total / values.length),
    p95: round(quantile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1]),
  }
}

function saveVisible(visible: boolean) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(DEV_PERF_VISIBLE_KEY, JSON.stringify(visible))
  } catch {
    // Ignore unavailable storage in private or test contexts.
  }
}

function pushPhaseValue(phase: PerfPhase, value: number) {
  const next = phaseBuffers[phase]
  next.push(value)
  if (next.length > SAMPLE_WINDOW) next.shift()
}

function detectBottleneck(metrics: Record<PerfPhase, PerfMetricSummary>): PerfSnapshot['bottleneck'] {
  let winner: PerfSnapshot['bottleneck'] = 'mixed'
  let winnerAvg = 0
  let runnerUpAvg = 0
  for (const phase of BOTTLENECK_PHASES) {
    const avg = metrics[phase].avg
    if (avg > winnerAvg) {
      runnerUpAvg = winnerAvg
      winnerAvg = avg
      winner = phase
    } else if (avg > runnerUpAvg) {
      runnerUpAvg = avg
    }
  }
  if (winnerAvg < 1 || winnerAvg - runnerUpAvg < 0.8) return 'mixed'
  return winner
}

function rebuildSnapshot(now: number, context = snapshot.context) {
  const metrics = {
    gap: summarizePerfMetric(phaseBuffers.gap),
    frame: summarizePerfMetric(phaseBuffers.frame),
    eval: summarizePerfMetric(phaseBuffers.eval),
    show: summarizePerfMetric(phaseBuffers.show),
    draw: summarizePerfMetric(phaseBuffers.draw),
    publish: summarizePerfMetric(phaseBuffers.publish),
  }
  snapshot = {
    ...snapshot,
    sampleCount,
    overBudgetFrames,
    stallFrames,
    lastUpdatedAt: now,
    bottleneck: detectBottleneck(metrics),
    metrics,
    longTasks: {
      supported: longTaskSupported,
      count: longTaskCount,
      totalMs: round(longTaskTotalMs),
      latestMs: round(longTaskLatestMs),
      worstMs: round(longTaskWorstMs),
    },
    context,
  }
}

function publishSnapshot(now: number, context = snapshot.context, force = false) {
  if (!force && now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return
  lastSnapshotAt = now
  rebuildSnapshot(now, context)
  notify()
}

export function recordPerfFrame(sample: PerfFrameSample) {
  if (!import.meta.env.DEV) return
  pushPhaseValue('gap', sample.gapMs)
  pushPhaseValue('frame', sample.frameMs)
  pushPhaseValue('eval', sample.evalMs)
  pushPhaseValue('show', sample.showMs)
  pushPhaseValue('draw', sample.drawMs)
  pushPhaseValue('publish', sample.publishMs)
  sampleCount++
  if (sample.frameMs > FRAME_BUDGET_MS) overBudgetFrames++
  if (sample.gapMs > FRAME_BUDGET_MS * 1.5) stallFrames++
  publishSnapshot(sample.now, sample.context)
}

export function recordLongTask(durationMs: number, now = performance.now()) {
  if (!import.meta.env.DEV) return
  longTaskCount++
  longTaskTotalMs += durationMs
  longTaskLatestMs = durationMs
  longTaskWorstMs = Math.max(longTaskWorstMs, durationMs)
  publishSnapshot(now)
}

export function ensurePerfObserver() {
  if (!import.meta.env.DEV || observerStarted || typeof PerformanceObserver === 'undefined') return
  observerStarted = true
  const supported = Array.isArray(PerformanceObserver.supportedEntryTypes)
    && PerformanceObserver.supportedEntryTypes.includes('longtask')
  longTaskSupported = supported
  publishSnapshot(performance.now(), snapshot.context, true)
  if (!supported) return
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) recordLongTask(entry.duration, entry.startTime + entry.duration)
  })
  observer.observe({ entryTypes: ['longtask'] })
}

export function togglePerfHud() {
  if (!import.meta.env.DEV) return
  snapshot = { ...snapshot, visible: !snapshot.visible }
  saveVisible(snapshot.visible)
  publishSnapshot(performance.now(), snapshot.context, true)
}

export function hidePerfHud() {
  if (!import.meta.env.DEV || !snapshot.visible) return
  snapshot = { ...snapshot, visible: false }
  saveVisible(false)
  publishSnapshot(performance.now(), snapshot.context, true)
}

export function showPerfHud() {
  if (!import.meta.env.DEV || snapshot.visible) return
  snapshot = { ...snapshot, visible: true }
  saveVisible(true)
  publishSnapshot(performance.now(), snapshot.context, true)
}

export function resetPerfMonitor() {
  phaseBuffers = {
    gap: [],
    frame: [],
    eval: [],
    show: [],
    draw: [],
    publish: [],
  }
  sampleCount = 0
  overBudgetFrames = 0
  stallFrames = 0
  longTaskCount = 0
  longTaskTotalMs = 0
  longTaskLatestMs = 0
  longTaskWorstMs = 0
  lastSnapshotAt = 0
  publishSnapshot(performance.now(), snapshot.context, true)
}

export function getPerfSnapshot() {
  return snapshot
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePerfSnapshot() {
  return useSyncExternalStore(subscribe, getPerfSnapshot, getPerfSnapshot)
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as Window & { __FASTLED_PERF__?: PerfDebugApi }).__FASTLED_PERF__ = {
    getSnapshot: getPerfSnapshot,
    hide: hidePerfHud,
    reset: resetPerfMonitor,
    show: showPerfHud,
    toggle: togglePerfHud,
  }
}
