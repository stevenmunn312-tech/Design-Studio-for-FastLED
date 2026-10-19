// Pure edits for the show lane editor. The component draws; this module
// snaps, moves, copies and describes clips so the same rules can be tested
// without a browser.

import type { ShowCommand, ShowEvent, ShowFile, SongSection } from '../../types/showFile'
import { sortShowEvents } from '../../codegen/performanceGenerator'
import type { ShowLock } from './showLocks'
import { normalizeLocks } from './showLocks'

export type SnapMode = 'beat' | 'section' | 'none'

const RAMP_COMMANDS = new Set<ShowCommand>(['SET_SPEED', 'SET_BRIGHTNESS', 'SET_ENERGY', 'SET_PARAM'])

export function snapTime(
  timeMs: number,
  mode: SnapMode,
  beats: readonly number[],
  sections: readonly SongSection[],
  durationMs: number,
): number {
  const clamped = Math.max(0, Math.min(durationMs, Math.round(timeMs)))
  if (mode === 'none') return clamped
  const marks = mode === 'beat'
    ? beats
    : sections.flatMap((section) => [section.startMs, section.endMs])
  if (marks.length === 0) return clamped
  let best = marks[0]
  let bestDist = Math.abs(marks[0] - clamped)
  for (const mark of marks) {
    const dist = Math.abs(mark - clamped)
    if (dist < bestDist) {
      best = mark
      bestDist = dist
    }
  }
  return Math.max(0, Math.min(durationMs, best))
}

export interface PatternClip {
  start: number
  end: number
  eventIndex: number
  patternIndex: number
  patternName: string
  transitionMs: number
  transitionIndex: number | null
}

/** A clip runs from one SET_PATTERN to the next. The transition is the overlap. */
export function patternClips(show: ShowFile): PatternClip[] {
  const patterns = show.events
    .map((event, eventIndex) => ({ event, eventIndex }))
    .filter((item) => item.event.cmd === 'SET_PATTERN')
  return patterns.map((item, order) => {
    const start = item.event.t
    const end = patterns[order + 1]?.event.t ?? show.durationMs
    const transition = show.events
      .map((event, eventIndex) => ({ event, eventIndex }))
      .find((candidate) => candidate.event.cmd === 'TRANSITION' && candidate.event.t === start)
    const transitionMs = transition ? Math.max(0, Math.round(Number(transition.event.params.duration) * 1000)) : 0
    return {
      start,
      end,
      eventIndex: item.eventIndex,
      patternIndex: Number(item.event.params.index ?? -1),
      patternName: item.event.params.name !== undefined ? String(item.event.params.name) : '',
      transitionMs,
      transitionIndex: transition?.eventIndex ?? null,
    }
  })
}

export function replaceEvents(show: ShowFile, events: ShowEvent[]): ShowFile {
  return { ...show, events: sortShowEvents(events) }
}

export function moveEvents(
  events: readonly ShowEvent[],
  indices: readonly number[],
  dt: number,
  snap: (timeMs: number) => number,
  durationMs: number,
): ShowEvent[] {
  const chosen = new Set(indices)
  if (chosen.size === 0 || dt === 0) return [...events]
  const anchor = events[indices[0]]?.t ?? 0
  const snapped = snap(anchor + dt)
  const delta = snapped - anchor
  return events.map((event, index) => {
    if (!chosen.has(index)) return event
    return { ...event, t: Math.max(0, Math.min(durationMs, event.t + delta)) }
  })
}

export function deleteEvents(events: readonly ShowEvent[], indices: readonly number[]): ShowEvent[] {
  const chosen = new Set(indices)
  return events.filter((_, index) => !chosen.has(index))
}

export function clipboardEvents(events: readonly ShowEvent[], indices: readonly number[]): ShowEvent[] {
  const chosen = new Set(indices)
  const picked = events.filter((_, index) => chosen.has(index))
  if (picked.length === 0) return []
  const origin = Math.min(...picked.map((event) => event.t))
  return picked.map((event) => ({ ...event, params: { ...event.params }, t: event.t - origin }))
}

export function pasteEvents(
  events: readonly ShowEvent[],
  clipboard: readonly ShowEvent[],
  at: number,
  durationMs: number,
): { events: ShowEvent[]; indices: number[] } {
  if (clipboard.length === 0) return { events: [...events], indices: [] }
  const added = clipboard.map((event) => ({
    ...event,
    params: { ...event.params },
    t: Math.max(0, Math.min(durationMs, at + event.t)),
  }))
  const merged = sortShowEvents([...events, ...added])
  const indices = added.map((event) => merged.findIndex((item) => item === event))
  return { events: merged, indices }
}

export function nudgeEvents(
  events: readonly ShowEvent[],
  indices: readonly number[],
  dt: number,
  durationMs: number,
): ShowEvent[] {
  const chosen = new Set(indices)
  return events.map((event, index) => (
    chosen.has(index) ? { ...event, t: Math.max(0, Math.min(durationMs, event.t + dt)) } : event
  ))
}

export function setEventRamp(events: readonly ShowEvent[], index: number, rampMs: number): ShowEvent[] {
  return events.map((event, eventIndex) => {
    if (eventIndex !== index || !RAMP_COMMANDS.has(event.cmd)) return event
    const params = { ...event.params }
    if (rampMs > 0) params.rampMs = Math.round(rampMs)
    else delete params.rampMs
    return { ...event, params }
  })
}

export function setTransitionDuration(events: readonly ShowEvent[], index: number, durationSec: number): ShowEvent[] {
  return events.map((event, eventIndex) => {
    if (eventIndex !== index || event.cmd !== 'TRANSITION') return event
    return { ...event, params: { ...event.params, duration: Math.max(0, durationSec) } }
  })
}

export function eventsInWindow(
  events: readonly ShowEvent[],
  startMs: number,
  endMs: number,
): { event: ShowEvent; index: number }[] {
  const out: { event: ShowEvent; index: number }[] = []
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    const rampMs = Number(event.params.rampMs ?? 0)
    const end = event.t + (rampMs > 0 ? rampMs : 0)
    if (end < startMs || event.t > endMs) continue
    out.push({ event, index })
  }
  return out
}

export function toggleSectionLock(locks: readonly ShowLock[], section: SongSection, durationMs: number): ShowLock[] {
  const covered = locks.some((lock) => lock.startMs <= section.startMs && lock.endMs >= section.endMs)
  if (covered) {
    return normalizeLocks(locks.flatMap((lock) => {
      if (lock.endMs <= section.startMs || lock.startMs >= section.endMs) return [lock]
      const parts: ShowLock[] = []
      if (lock.startMs < section.startMs) parts.push({ startMs: lock.startMs, endMs: section.startMs })
      if (lock.endMs > section.endMs) parts.push({ startMs: section.endMs, endMs: lock.endMs })
      return parts
    }), durationMs)
  }
  return normalizeLocks([...locks, { startMs: section.startMs, endMs: section.endMs }], durationMs)
}

export function moveSection(sections: readonly SongSection[], index: number, startMs: number, endMs: number): SongSection[] {
  return sections.map((section, sectionIndex) => (
    sectionIndex === index ? { ...section, startMs: Math.round(startMs), endMs: Math.round(Math.max(startMs + 1, endMs)) } : section
  ))
}

export function retypeSection(sections: readonly SongSection[], index: number, type: SongSection['type']): SongSection[] {
  return sections.map((section, sectionIndex) => (sectionIndex === index ? { ...section, type } : section))
}

export const LANE_COMMANDS: ShowCommand[] = [
  'SET_PATTERN', 'TRANSITION', 'SET_PALETTE', 'SET_SPEED', 'SET_BRIGHTNESS', 'SET_ENERGY', 'SET_PARAM', 'BEAT_FLASH', 'PARTICLE_BURST',
]

export function rampCommands(): ReadonlySet<ShowCommand> {
  return RAMP_COMMANDS
}
