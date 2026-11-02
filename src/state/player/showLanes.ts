// Pure edits for the show lane editor. The component draws; this module
// snaps, moves, copies and describes clips so the same rules can be tested
// without a browser.

import type { ShowCommand, ShowEvent, ShowFile, SongSection } from '../../types/showFile'
import { sortShowEvents } from '../../codegen/performanceGenerator'
import type { ShowLock } from './showLocks'
import { normalizeLocks } from './showLocks'
import { applyRamp, blankRampChannel, rampValue } from './showRamp'
import { SHOW_DEFAULTS, defaultShowParams } from './showEventMeta'

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

/**
 * The event lanes under the pattern clips. SET_PARAM is drawn as one lane per
 * named input, never as an anonymous lane: an index without a name has
 * nothing to drive. A sequence has no beat flashes or particle bursts.
 */
export function laneCommands(kind: 'song' | 'sequence'): ShowCommand[] {
  return kind === 'sequence'
    ? ['TRANSITION', 'SET_PALETTE', 'SET_SPEED', 'SET_BRIGHTNESS', 'SET_ENERGY']
    : ['TRANSITION', 'SET_PALETTE', 'SET_SPEED', 'SET_BRIGHTNESS', 'SET_ENERGY', 'BEAT_FLASH', 'PARTICLE_BURST']
}

/** Snap modes that have marks to snap to. None is always offered. */
export function snapModes(beats: readonly number[], sections: readonly SongSection[]): SnapMode[] {
  return [
    ...(beats.length > 0 ? ['beat' as const] : []),
    ...(sections.length > 0 ? ['section' as const] : []),
    'none',
  ]
}

/** The value commands drawn as a line rather than as markers. */
export function isValueCommand(cmd: ShowCommand): cmd is 'SET_SPEED' | 'SET_BRIGHTNESS' | 'SET_ENERGY' | 'SET_PARAM' {
  return RAMP_COMMANDS.has(cmd)
}

export interface ChannelPoint {
  t: number
  v: number
}

function rampOf(event: ShowEvent): number {
  const rampMs = Number(event.params.rampMs ?? 0)
  return Number.isFinite(rampMs) && rampMs > 0 ? rampMs : 0
}

function cutAt(points: ChannelPoint[], t: number, v: number) {
  while (points.length > 0 && points[points.length - 1].t > t) points.pop()
  points.push({ t, v })
}

/**
 * The polyline one value channel follows, by the ramp rule the players use: a
 * ramp starts from the value in force and a later event cuts it short.
 * `events` are time-sorted.
 */
export function channelPath(
  events: readonly ShowEvent[],
  matches: (event: ShowEvent) => boolean,
  initial: number,
  durationMs: number,
): ChannelPoint[] {
  const channel = blankRampChannel(initial)
  const points: ChannelPoint[] = [{ t: 0, v: initial }]
  for (const event of events) {
    if (!matches(event)) continue
    const from = rampValue(channel.span, channel.held, event.t)
    cutAt(points, event.t, from)
    const to = Number(event.params.value)
    const rampMs = rampOf(event)
    applyRamp(channel, event.t, to, rampMs)
    points.push({ t: event.t + rampMs, v: to })
  }
  cutAt(points, durationMs, rampValue(channel.span, channel.held, durationMs))
  return points
}

export interface ChannelMark {
  index: number
  t: number
  /** The value in force when the event starts. */
  from: number
  to: number
  rampMs: number
}

/** Each event of one channel with the value it starts from, for drawing its handles on the line. */
export function channelMarks(events: readonly ShowEvent[], matches: (event: ShowEvent) => boolean, initial: number): ChannelMark[] {
  const channel = blankRampChannel(initial)
  const marks: ChannelMark[] = []
  events.forEach((event, index) => {
    if (!matches(event)) return
    const from = rampValue(channel.span, channel.held, event.t)
    const to = Number(event.params.value)
    const rampMs = rampOf(event)
    applyRamp(channel, event.t, to, rampMs)
    marks.push({ index, t: event.t, from, to, rampMs })
  })
  return marks
}

/** The value a channel holds at `t`, on the same rule as `channelPath`. */
export function channelValueAt(events: readonly ShowEvent[], matches: (event: ShowEvent) => boolean, initial: number, t: number): number {
  const channel = blankRampChannel(initial)
  for (const event of events) {
    if (event.t > t) break
    if (matches(event)) applyRamp(channel, event.t, Number(event.params.value), rampOf(event))
  }
  return rampValue(channel.span, channel.held, t)
}

/** A value range that holds the channel's own extremes as well as its usual range. */
export function channelRange(points: readonly ChannelPoint[], min: number, max: number): { min: number; max: number } {
  let lo = min
  let hi = max
  for (const point of points) {
    if (point.v < lo) lo = point.v
    if (point.v > hi) hi = point.v
  }
  return { min: lo, max: hi > lo ? hi : lo + 1 }
}

const RULER_STEPS_MS = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000]

/** Ruler tick times for a window, at least `minGapPx` apart. */
export function rulerTicks(startMs: number, endMs: number, widthPx: number, minGapPx = 64): number[] {
  const span = Math.max(1, endMs - startMs)
  const step = RULER_STEPS_MS.find((ms) => (ms / span) * widthPx >= minGapPx) ?? RULER_STEPS_MS[RULER_STEPS_MS.length - 1]
  const ticks: number[] = []
  for (let t = Math.ceil(startMs / step) * step; t <= endMs; t += step) ticks.push(t)
  return ticks
}

/** Zoom by `factor` keeping `anchorMs` under the same pixel. */
export function zoomAround(
  zoom: number,
  startMs: number,
  anchorMs: number,
  factor: number,
  durationMs: number,
  maxZoom = 32,
): { zoom: number; startMs: number } {
  const nextZoom = Math.max(1, Math.min(maxZoom, zoom * factor))
  const windowMs = durationMs / zoom
  const nextWindow = durationMs / nextZoom
  const ratio = windowMs > 0 ? (anchorMs - startMs) / windowMs : 0
  const nextStart = Math.max(0, Math.min(durationMs - nextWindow, anchorMs - ratio * nextWindow))
  return { zoom: nextZoom, startMs: nextStart }
}

export interface PaletteClip {
  start: number
  end: number
  eventIndex: number
  name: string
}

/** A palette runs from one SET_PALETTE to the next. */
export function paletteClips(events: readonly ShowEvent[], durationMs: number): PaletteClip[] {
  const palettes = events
    .map((event, eventIndex) => ({ event, eventIndex }))
    .filter((item) => item.event.cmd === 'SET_PALETTE')
  return palettes.map((item, order) => ({
    start: item.event.t,
    end: palettes[order + 1]?.event.t ?? durationMs,
    eventIndex: item.eventIndex,
    name: String(item.event.params.name ?? ''),
  }))
}

function lastBefore(events: readonly ShowEvent[], cmd: ShowCommand, t: number): ShowEvent | undefined {
  let found: ShowEvent | undefined
  for (const event of events) {
    if (event.t > t) break
    if (event.cmd === cmd) found = event
  }
  return found
}

/**
 * A new event for a lane at `t`. It starts on the value already in force, so
 * adding a point changes nothing until it is edited or ramped.
 */
export function newLaneEvent(show: ShowFile, events: readonly ShowEvent[], cmd: ShowCommand, t: number, paramIndex = 0): ShowEvent {
  const at = Math.max(0, Math.min(show.durationMs, Math.round(t)))
  const valueOf = (initial: number, matches: (event: ShowEvent) => boolean) => channelValueAt(events, matches, initial, at)
  switch (cmd) {
    case 'SET_PATTERN': {
      const current = lastBefore(events, 'SET_PATTERN', at)
      const params: ShowEvent['params'] = current ? { ...current.params } : show.patternSet ? { index: 0 } : { name: SHOW_DEFAULTS.pattern }
      return { t: at, cmd, params }
    }
    case 'SET_PALETTE':
      return { t: at, cmd, params: { name: String(lastBefore(events, 'SET_PALETTE', at)?.params.name ?? SHOW_DEFAULTS.palette) } }
    case 'SET_SPEED':
      return { t: at, cmd, params: { value: valueOf(SHOW_DEFAULTS.speed, (event) => event.cmd === cmd) } }
    case 'SET_BRIGHTNESS':
      return { t: at, cmd, params: { value: Math.round(valueOf(SHOW_DEFAULTS.brightness, (event) => event.cmd === cmd)) } }
    case 'SET_ENERGY':
      return { t: at, cmd, params: { value: valueOf(SHOW_DEFAULTS.energy, (event) => event.cmd === cmd) } }
    case 'SET_PARAM':
      return {
        t: at,
        cmd,
        params: { index: paramIndex, value: valueOf(0, (event) => event.cmd === cmd && Number(event.params.index) === paramIndex) },
      }
    default:
      return { t: at, cmd, params: defaultShowParams(cmd) }
  }
}

/**
 * A sequence keeps a value only where a step starts, so its value events snap
 * to the nearest pattern start. Pattern clips move freely: moving one is what
 * changes a hold.
 */
export function nearestClipStart(clips: readonly PatternClip[], t: number): number {
  let best = clips[0]?.start ?? 0
  for (const clip of clips) if (Math.abs(clip.start - t) < Math.abs(best - t)) best = clip.start
  return best
}

export function rampCommands(): ReadonlySet<ShowCommand> {
  return RAMP_COMMANDS
}
