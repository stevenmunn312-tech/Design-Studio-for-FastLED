// Locked spans replace the whole-show edited freeze.
//
// An edit locks the section it falls in. Regeneration keeps events inside a
// lock and writes the rest again. At each boundary the regenerated side
// restates pattern, palette, speed, energy and brightness, so neither side
// inherits the other's channels. A legacy edited show with no locks is one
// lock over the whole duration: the first later edit must not unlock the rest.

import type { ShowEvent, ShowFile, SongSection } from '../../types/showFile'
import { showStateAt } from './showPreview'
import { sortShowEvents } from '../../codegen/performanceGenerator'

export interface ShowLock {
  startMs: number
  endMs: number
}

export function normalizeLocks(locks: readonly ShowLock[], durationMs: number): ShowLock[] {
  const spans = locks
    .map((lock) => ({
      startMs: Math.max(0, Math.min(durationMs, Math.round(lock.startMs))),
      endMs: Math.max(0, Math.min(durationMs, Math.round(lock.endMs))),
    }))
    .filter((lock) => lock.endMs > lock.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  const merged: ShowLock[] = []
  for (const lock of spans) {
    const prev = merged[merged.length - 1]
    if (prev && lock.startMs <= prev.endMs) prev.endMs = Math.max(prev.endMs, lock.endMs)
    else merged.push({ ...lock })
  }
  return merged
}

/** `edited` with no lock list is the old whole-show freeze. */
export function effectiveLocks(show: ShowFile, edited: boolean): ShowLock[] {
  if (show.locks) return normalizeLocks(show.locks, show.durationMs)
  if (edited) return [{ startMs: 0, endMs: show.durationMs }]
  return []
}

export function lockContains(lock: ShowLock, t: number): boolean {
  return t >= lock.startMs && t < lock.endMs
}

export function sectionLockAt(sections: readonly SongSection[], t: number): ShowLock | null {
  const section = sections.find((item) => t >= item.startMs && t < item.endMs)
  if (!section) return null
  return { startMs: section.startMs, endMs: section.endMs }
}

const CHANNELS = ['SET_PATTERN', 'SET_PALETTE', 'SET_SPEED', 'SET_ENERGY', 'SET_BRIGHTNESS'] as const

function restate(show: ShowFile, t: number): ShowEvent[] {
  const state = showStateAt(show, Math.max(0, t))
  const pattern: ShowEvent = state.patternIndex >= 0
    ? { t, cmd: 'SET_PATTERN', params: { index: state.patternIndex } }
    : { t, cmd: 'SET_PATTERN', params: { name: state.pattern } }
  return [
    pattern,
    { t, cmd: 'SET_PALETTE', params: { name: state.palette } },
    { t, cmd: 'SET_SPEED', params: { value: state.speed } },
    { t, cmd: 'SET_ENERGY', params: { value: state.energy } },
    { t, cmd: 'SET_BRIGHTNESS', params: { value: state.brightness } },
  ]
}

/**
 * Keep `locked` events inside each span, take `fresh` events outside them, and
 * restate the five channels at both edges. The start edge copies the locked
 * show, so regenerated history does not leak in. The end edge copies the fresh
 * show, so locked history does not leak out.
 */
export function regenerateKeepingLocks(locked: ShowFile, fresh: ShowFile, locks: readonly ShowLock[]): ShowFile {
  const spans = normalizeLocks(locks, Math.max(locked.durationMs, fresh.durationMs))
  if (spans.length === 0) return fresh
  const inside = (t: number) => spans.some((lock) => lockContains(lock, t))
  const events: ShowEvent[] = [
    ...locked.events.filter((event) => inside(event.t)),
    ...fresh.events.filter((event) => !inside(event.t)),
  ]
  for (const lock of spans) {
    events.push(...restate(locked, lock.startMs))
    if (lock.endMs < fresh.durationMs) events.push(...restate(fresh, lock.endMs))
  }
  const kept = sortShowEvents(events).filter((event, index, list) => {
    if (!(CHANNELS as readonly string[]).includes(event.cmd)) return true
    const newer = list.findIndex((other, otherIndex) => otherIndex > index && other.t === event.t && other.cmd === event.cmd)
    return newer < 0
  })
  return {
    ...fresh,
    events: kept,
    ...(locked.sections ? { sections: locked.sections } : {}),
    locks: spans,
  }
}

function eventKey(event: ShowEvent): string {
  return JSON.stringify([event.t, event.cmd, event.params])
}

/** Section spans that contain an event the edit added, removed or retimed. */
export function locksForEventChanges(
  previous: ShowFile,
  next: ShowFile,
  sections: readonly SongSection[],
): ShowLock[] {
  const before = new Set(previous.events.map(eventKey))
  const after = new Set(next.events.map(eventKey))
  const locks: ShowLock[] = []
  const mark = (t: number) => {
    const lock = sectionLockAt(sections, t)
    if (lock) locks.push(lock)
  }
  for (const event of next.events) if (!before.has(eventKey(event))) mark(event.t)
  for (const event of previous.events) if (!after.has(eventKey(event))) mark(event.t)
  return normalizeLocks(locks, next.durationMs)
}

export function formatLockSpan(lock: ShowLock): string {
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  return `${fmt(lock.startMs)}–${fmt(lock.endMs)}`
}
