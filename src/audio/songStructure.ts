// Where a song changes, measured on its beat grid. Section detection reads a
// two-second smoothed envelope, so its boundaries land early and between beats;
// the Performance Generator needs the beat a change actually happens on.

import type { EnergyPoint, SongSection } from '../types/showFile'

/** Every beat across the whole song, and the typical gap between two. */
export interface SongGrid {
  beats: number[]
  periodMs: number
}

const BANDS = ['bass', 'mids', 'treble', 'overall'] as const
/** Fewer tracked beats than this say nothing reliable about the tempo. */
const MIN_TRACKED_BEATS = 8
/** How far a section boundary may move to reach the change it marks. */
const ALIGN_REACH_MS = 2500
/** Summed band change across a boundary that counts as a real step. */
const ALIGN_MIN_STEP = 0.4
/** Beats each side of a step that the sharp and the broad measures average. */
const SHARP_BEATS = 2
const BROAD_BEATS = 8

/**
 * The tracked beats, continued at their median period over the quiet ends the
 * tracker trims. A song with too few beats gets an even grid at its tempo, so
 * scheduling stays on a pulse instead of falling back to raw seconds.
 */
export function songGrid(timestamps: readonly number[], bpm: number, durationMs: number): SongGrid {
  const tracked = timestamps.length >= MIN_TRACKED_BEATS
  let periodMs = 60000 / (bpm > 0 ? bpm : 120)
  if (tracked) {
    const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]).sort((a, b) => a - b)
    const median = gaps[Math.floor(gaps.length / 2)]
    if (median > 0) periodMs = median
  }
  const beats = tracked ? [...timestamps] : [0]
  while (beats[0] - periodMs >= 0) beats.unshift(beats[0] - periodMs)
  while (beats[beats.length - 1] + periodMs <= durationMs) beats.push(beats[beats.length - 1] + periodMs)
  return { beats, periodMs }
}

/** Index of the grid beat nearest `t`. */
export function nearestBeatIndex(grid: SongGrid, t: number): number {
  const { beats } = grid
  let lo = 0
  let hi = beats.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (beats[mid] < t) lo = mid + 1
    else hi = mid
  }
  return lo > 0 && t - beats[lo - 1] <= beats[lo] - t ? lo - 1 : lo
}

/**
 * How much the music changes at `t`: the summed difference, over the three
 * bands and the overall level, between the mean of `spanMs` after and the mean
 * of `spanMs` before. Zero where either side runs off the song.
 */
function stepMeter(energy: readonly EnergyPoint[]): ((t: number, spanMs: number) => number) | null {
  if (energy.length < 2) return null
  const start = energy[0].t
  const hop = (energy[energy.length - 1].t - start) / (energy.length - 1)
  if (!(hop > 0)) return null
  const sums = BANDS.map((band) => {
    const prefix = new Float64Array(energy.length + 1)
    for (let i = 0; i < energy.length; i++) prefix[i + 1] = prefix[i] + energy[i][band]
    return prefix
  })
  const index = (t: number) => Math.max(0, Math.min(energy.length, Math.round((t - start) / hop)))
  return (t, spanMs) => {
    const from = index(t - spanMs)
    const at = index(t)
    const to = index(t + spanMs)
    if (at <= from || to <= at) return 0
    let step = 0
    for (const prefix of sums) {
      step += Math.abs((prefix[to] - prefix[at]) / (to - at) - (prefix[at] - prefix[from]) / (at - from))
    }
    return step
  }
}

/**
 * Move each section boundary onto the beat where the music steps. The strongest
 * step within reach wins; a boundary with no clear step nearby stays where it
 * is, and one already sitting on a step is left alone, so aligning twice gives
 * the same sections.
 */
export function alignSectionsToMusic(
  sections: readonly SongSection[],
  energy: readonly EnergyPoint[],
  grid: SongGrid,
): SongSection[] {
  const step = stepMeter(energy)
  const out = sections.map((section) => ({ ...section }))
  if (!step) return out
  const span = SHARP_BEATS * grid.periodMs
  const strength = (i: number) => (i >= 0 && i < grid.beats.length ? step(grid.beats[i], span) : 0)
  const isPeak = (i: number) => {
    const s = strength(i)
    if (s < ALIGN_MIN_STEP) return false
    for (let d = 1; d <= SHARP_BEATS; d++) if (strength(i - d) > s || strength(i + d) > s) return false
    return true
  }
  for (let k = 1; k < out.length; k++) {
    const boundary = out[k].startMs
    const here = nearestBeatIndex(grid, boundary)
    if (Math.abs(grid.beats[here] - boundary) < grid.periodMs / 2 && isPeak(here)) {
      out[k].startMs = out[k - 1].endMs = grid.beats[here]
      continue
    }
    // Stay clear of the neighbouring boundaries so no section collapses.
    const earliest = out[k - 1].startMs + span
    const latest = out[k].endMs - span
    let best = -1
    for (let i = 0; i < grid.beats.length; i++) {
      const t = grid.beats[i]
      if (t < boundary - ALIGN_REACH_MS || t <= earliest) continue
      if (t > boundary + ALIGN_REACH_MS || t >= latest) break
      if (isPeak(i) && (best < 0 || strength(i) > strength(best))) best = i
    }
    if (best >= 0) out[k].startMs = out[k - 1].endMs = grid.beats[best]
  }
  return out
}

/** A beat where the song changes character, and by how much. */
export interface StructureChange {
  t: number
  strength: number
}

/**
 * The beats where the song changes inside or between sections: peaks of the
 * broad (two-bar) step measure at or above `threshold`, each placed on the
 * sharpest step within a bar of it.
 */
export function structureChanges(
  energy: readonly EnergyPoint[],
  grid: SongGrid,
  threshold: number,
): StructureChange[] {
  const step = stepMeter(energy)
  if (!step) return []
  const { beats, periodMs } = grid
  const broad = beats.map((t) => step(t, BROAD_BEATS * periodMs))
  const changes: StructureChange[] = []
  for (let i = 0; i < beats.length; i++) {
    if (broad[i] < threshold) continue
    let peak = true
    for (let d = 1; d <= BROAD_BEATS && peak; d++) {
      // The earlier beat of an equal pair is the peak.
      if ((broad[i - d] ?? 0) >= broad[i] || (broad[i + d] ?? 0) > broad[i]) peak = false
    }
    if (!peak) continue
    let sharpest = i
    for (let j = Math.max(0, i - 4); j <= Math.min(beats.length - 1, i + 4); j++) {
      if (step(beats[j], SHARP_BEATS * periodMs) > step(beats[sharpest], SHARP_BEATS * periodMs)) sharpest = j
    }
    changes.push({ t: beats[sharpest], strength: broad[i] })
  }
  return changes
}
