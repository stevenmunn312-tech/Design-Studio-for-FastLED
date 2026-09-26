import type { Frame } from '../ledColor'
import { disposeCodeSandbox } from '../codeSandboxRuntime'
import { disposeAnimartrixState } from '../../animartrix/preview'
import type { Field } from './types'

// ── Frame / field buffer pool ─────────────────────────────────────────────────
// Per-pass frame and field outputs are drawn from a recycling pool instead of
// being freshly allocated: at 60 fps a moderate graph otherwise churns through
// millions of row arrays and pixel objects per second, which is the preview
// loop's dominant GC cost. A buffer handed out during pass N is only recycled
// at the start of pass N+2 (two-generation delay), so anything that reads a
// frame within its own pass — or compares consecutive passes — never sees a
// recycled buffer. The only cross-pass retainer is previewStore, which copies
// frames into its own buffers at publish time. Persistent per-node state
// (trailState, sparkState, …) must NOT store pooled buffers.
const framePoolFree = new Map<string, Frame[]>()
const fieldPoolFree = new Map<number, Field[]>()
let poolPrev: { frames: Frame[]; fields: Field[] } = { frames: [], fields: [] }
let poolCurr: { frames: Frame[]; fields: Field[] } = { frames: [], fields: [] }
const POOL_FREE_CAP = 256

export const stateClock = () => typeof performance !== 'undefined' ? performance.now() : Date.now()

// The free lists would otherwise retain the high-water mark of buffers a pass
// ever needed: after a big graph shrinks, or the matrix is resized away from a
// size, the old peak (and every abandoned size key) stays allocated for the
// session. Track per-size usage so a periodic sweep can evict idle sizes
// outright and trim active free lists back toward recent per-pass demand.
const POOL_SWEEP_INTERVAL_MS = 5_000
const POOL_IDLE_TTL_MS = 30_000
let lastPoolSweep = 0
const framePoolLastUsed = new Map<string, number>()
const fieldPoolLastUsed = new Map<number, number>()
const framePassPeak = new Map<string, number>()
const fieldPassPeak = new Map<number, number>()

/** Advance the pool generation — called once per top-level preview pass
 *  (evaluateGraphFull). Buffers from two passes ago become reusable. */
export function advanceFramePool(): void {
  const now = stateClock()
  const frameCounts = new Map<string, number>()
  for (const frame of poolPrev.frames) {
    const key = `${frame[0]?.length ?? 0}x${frame.length}`
    let free = framePoolFree.get(key)
    if (!free) framePoolFree.set(key, (free = []))
    if (free.length < POOL_FREE_CAP) free.push(frame)
    frameCounts.set(key, (frameCounts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of frameCounts) {
    framePoolLastUsed.set(key, now)
    if (count > (framePassPeak.get(key) ?? 0)) framePassPeak.set(key, count)
  }
  const fieldCounts = new Map<number, number>()
  for (const field of poolPrev.fields) {
    let free = fieldPoolFree.get(field.length)
    if (!free) fieldPoolFree.set(field.length, (free = []))
    if (free.length < POOL_FREE_CAP) free.push(field)
    fieldCounts.set(field.length, (fieldCounts.get(field.length) ?? 0) + 1)
  }
  for (const [len, count] of fieldCounts) {
    fieldPoolLastUsed.set(len, now)
    if (count > (fieldPassPeak.get(len) ?? 0)) fieldPassPeak.set(len, count)
  }
  poolPrev = poolCurr
  poolCurr = { frames: [], fields: [] }
  if (now - lastPoolSweep >= POOL_SWEEP_INTERVAL_MS) {
    lastPoolSweep = now
    prunePoolBuffers(POOL_IDLE_TTL_MS, now)
  }
}

/** Evict pooled buffers: drop the free list of any size that hasn't been used
 * for `maxIdleMs`, and trim surviving lists to a small margin over the peak
 * per-pass demand seen since the previous sweep. Exported so tests can force a
 * sweep; advanceFramePool runs one automatically every few seconds. */
export function prunePoolBuffers(maxIdleMs = POOL_IDLE_TTL_MS, now = stateClock()): void {
  const cutoff = now - Math.max(0, maxIdleMs)
  for (const [key, free] of framePoolFree) {
    if ((framePoolLastUsed.get(key) ?? 0) < cutoff) {
      framePoolFree.delete(key)
      framePoolLastUsed.delete(key)
      framePassPeak.delete(key)
      continue
    }
    const cap = (framePassPeak.get(key) ?? 0) + 4
    if (free.length > cap) free.length = cap
    framePassPeak.delete(key)  // restart the peak window each sweep
  }
  for (const [len, free] of fieldPoolFree) {
    if ((fieldPoolLastUsed.get(len) ?? 0) < cutoff) {
      fieldPoolFree.delete(len)
      fieldPoolLastUsed.delete(len)
      fieldPassPeak.delete(len)
      continue
    }
    const cap = (fieldPassPeak.get(len) ?? 0) + 4
    if (free.length > cap) free.length = cap
    fieldPassPeak.delete(len)
  }
}

// Pixel contents are NOT cleared — every caller overwrites all W×H pixels.
export function allocFrame(W: number, H: number): Frame {
  const frame = framePoolFree.get(`${W}x${H}`)?.pop()
    ?? Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
  poolCurr.frames.push(frame)
  return frame
}

export function allocField(len: number): Field {
  const field = fieldPoolFree.get(len)?.pop() ?? new Float32Array(len)
  field.fill(0)
  poolCurr.fields.push(field)
  return field
}

// Stateful previews intentionally survive between frames, but node and group
// ids are never reused. Track the last evaluation of each instance so buffers
// belonging to deleted or long-inactive graph instances can be reclaimed.
const stateLastUsed = new Map<string, number>()
const STATE_IDLE_TTL_MS = 30_000
const STATE_PRUNE_INTERVAL_MS = 5_000
let lastStatePrune = 0

export function markStateUsed(key: string): string {
  stateLastUsed.set(key, stateClock())
  return key
}

/*
 * Every per-instance state collection registers itself here as it is
 * declared, beside the node that owns it: both the idle sweep and the full
 * reset below must cover all of them or state leaks past its owner, and a
 * registry cannot be forgotten the way a hand-kept list could.
 */
type StateMap = { readonly size: number; delete: (key: string) => boolean; clear: () => void }
const instanceMaps = new Map<string, StateMap>()
const caches = new Map<string, { readonly size: number }>()

/** Declare a per-instance state map: keyed by a node's `stateKey`, its entries
 *  are swept once idle and cleared by `resetEvaluatorState`. */
export function instanceState<M extends StateMap>(name: string, map: M): M {
  instanceMaps.set(name, map)
  return map
}

/** Declare a cache that is not keyed by instance (so neither sweep touches
 *  it) but belongs in the memory probe. */
export function evaluatorCache<M extends { readonly size: number }>(name: string, map: M): M {
  caches.set(name, map)
  return map
}

/** Drop persistent evaluator buffers that have not participated in a recent
 * evaluation. Exported so graph lifecycle code/tests can force an immediate
 * sweep; normal preview evaluation runs a throttled sweep automatically. */
export function pruneEvaluatorState(maxIdleMs = STATE_IDLE_TTL_MS, now = stateClock()): number {
  const cutoff = now - Math.max(0, maxIdleMs)
  const stale: string[] = []
  for (const [key, lastUsed] of stateLastUsed) {
    if (lastUsed < cutoff) stale.push(key)
  }
  if (stale.length === 0) return 0

  for (const key of stale) {
    for (const map of instanceMaps.values()) map.delete(key)
    disposeAnimartrixState(key)
    disposeCodeSandbox(key)   // Code-node worker (if any) lives outside these Maps
    stateLastUsed.delete(key)
  }
  return stale.length
}

/** Discard *all* evaluator state — every per-instance simulation buffer plus
 * the frame/field pools and their sweep timers — returning the module to the
 * condition it was in before the first evaluation.
 *
 * This exists because the idle sweeps above are driven by wall-clock time, so
 * whether a given instance's state survives between two evaluations depends on
 * how long the surrounding work took. That is fine for a live preview, but it
 * makes any batch renderer non-reproducible: state carried over from a previous
 * render perturbs the next one, and (via the shared seeded RNG) everything
 * after it. Offline renderers call this between renders so each one starts
 * cold. Not used by the live preview loop. */
export function resetEvaluatorState(): void {
  for (const key of stateLastUsed.keys()) {
    disposeAnimartrixState(key)
    disposeCodeSandbox(key)
  }
  for (const map of instanceMaps.values()) map.clear()
  stateLastUsed.clear()
  framePoolFree.clear()
  fieldPoolFree.clear()
  framePoolLastUsed.clear()
  fieldPoolLastUsed.clear()
  framePassPeak.clear()
  fieldPassPeak.clear()
  poolPrev = { frames: [], fields: [] }
  poolCurr = { frames: [], fields: [] }
  lastPoolSweep = 0
  lastStatePrune = 0
}

/** Dev-only memory probe: the entry count of every retained evaluator
 * collection, plus total buffered pixels/floats in the frame/field pools. Watch
 * this while a suspect graph runs — a number that climbs without settling is the
 * leaking collection. Exposed on `window.__FASTLED_MEM__()` in dev builds. */
export function getEvaluatorMemoryStats(): {
  stateMaps: Record<string, number>
  trackedKeys: number
  pool: { framePixels: number; fieldFloats: number; frameLists: number; fieldLists: number }
  totalStateEntries: number
} {
  const stateMaps: Record<string, number> = {}
  for (const [name, map] of instanceMaps) stateMaps[name] = map.size
  for (const [name, map] of caches) stateMaps[name] = map.size
  let framePixels = 0, frameLists = 0
  for (const [key, list] of framePoolFree) {
    const [w, h] = key.split('x').map(Number)
    framePixels += list.length * (w || 0) * (h || 0)
    frameLists += list.length
  }
  let fieldFloats = 0, fieldLists = 0
  for (const [len, list] of fieldPoolFree) { fieldFloats += list.length * len; fieldLists += list.length }
  const totalStateEntries = Object.values(stateMaps).reduce((a, b) => a + b, 0)
  return { stateMaps, trackedKeys: stateLastUsed.size, pool: { framePixels, fieldFloats, frameLists, fieldLists }, totalStateEntries }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __FASTLED_MEM__?: typeof getEvaluatorMemoryStats }).__FASTLED_MEM__ = getEvaluatorMemoryStats
}

export function maybePruneEvaluatorState(): void {
  const now = stateClock()
  if (now - lastStatePrune < STATE_PRUNE_INTERVAL_MS) return
  pruneEvaluatorState(STATE_IDLE_TTL_MS, now)
  lastStatePrune = now
}
