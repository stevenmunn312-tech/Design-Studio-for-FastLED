// A looping sequence of collection steps, shared by the Pattern Slideshow and
// the Music Player. The lane editor reads and writes it as a show whose axis
// is the sum of the holds. Firmware compiles the same steps into a table.

import type { ShowEvent, ShowFile } from '../../types/showFile'
import {
  ENERGY_BANDS, isEnergyBand, nextPatternIndex, type EnergyBand, type PickEntry, type PickMoment,
} from './patternPick'

export interface PatternStep {
  /** Collection index. Omit to pick by the tags below. */
  index?: number
  sections?: string[]
  energy?: EnergyBand[]
  /** Seconds, or beats when the Music Player's Beat Transitions is on. */
  hold: number
  transition: string
  transitionSec: number
  speed?: number
  energyValue?: number
  brightness?: number
  palette?: string
  params?: Record<string, number>
  /** Ramp, in seconds, for the optional role and named-input values. */
  rampSec?: number
}

const HOLD_MIN = 0.05

export function asPatternSteps(value: unknown): PatternStep[] {
  if (!Array.isArray(value)) return []
  const steps: PatternStep[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const step = raw as Partial<PatternStep>
    const hold = Number(step.hold)
    const transitionSec = Number(step.transitionSec)
    const index = step.index === undefined ? undefined : Math.max(0, Math.round(Number(step.index)))
    const sections = Array.isArray(step.sections) ? step.sections.filter((tag): tag is string => typeof tag === 'string') : undefined
    const energy = Array.isArray(step.energy) ? step.energy.filter(isEnergyBand) : undefined
    const params: Record<string, number> = {}
    if (step.params && typeof step.params === 'object') {
      for (const [key, item] of Object.entries(step.params)) {
        const n = Number(item)
        if (Number.isFinite(n)) params[key] = n
      }
    }
    steps.push({
      ...(index !== undefined && Number.isFinite(index) ? { index } : {}),
      ...(sections && sections.length ? { sections } : {}),
      ...(energy && energy.length ? { energy } : {}),
      hold: Number.isFinite(hold) && hold > 0 ? hold : 8,
      transition: typeof step.transition === 'string' && step.transition ? step.transition : 'crossfade',
      transitionSec: Number.isFinite(transitionSec) && transitionSec >= 0 ? transitionSec : 1,
      ...(Number.isFinite(Number(step.speed)) ? { speed: Number(step.speed) } : {}),
      ...(Number.isFinite(Number(step.energyValue)) ? { energyValue: Number(step.energyValue) } : {}),
      ...(Number.isFinite(Number(step.brightness)) ? { brightness: Number(step.brightness) } : {}),
      ...(typeof step.palette === 'string' && step.palette ? { palette: step.palette } : {}),
      ...(Object.keys(params).length ? { params } : {}),
      ...(Number.isFinite(Number(step.rampSec)) && Number(step.rampSec) > 0 ? { rampSec: Number(step.rampSec) } : {}),
    })
  }
  return steps
}

/** Milliseconds one step occupies on the editor axis. */
export function stepHoldMs(step: PatternStep, beatMs: number, countBeats: boolean): number {
  const unit = countBeats ? Math.max(1, beatMs) : 1000
  return Math.max(1, Math.round(Math.max(HOLD_MIN, step.hold) * unit))
}

export function sequenceDurationMs(steps: readonly PatternStep[], beatMs: number, countBeats: boolean): number {
  return steps.reduce((sum, step) => sum + stepHoldMs(step, beatMs, countBeats), 0)
}

function optionalNumber(value: number | undefined): Record<string, number> | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : { value }
}

/**
 * Steps become a show the lane editor already knows how to draw. Pattern clips
 * run from one step to the next. The transition is the overlap at the start
 * of the incoming clip. Role values sit on that same instant.
 */
export function sequenceToShow(
  steps: readonly PatternStep[],
  beatMs: number,
  countBeats: boolean,
  paramNames: readonly string[] = [],
): ShowFile {
  const events: ShowEvent[] = []
  let t = 0
  steps.forEach((step, order) => {
    const holdMs = stepHoldMs(step, beatMs, countBeats)
    if (order > 0 && step.transitionSec > 0) {
      events.push({
        t,
        cmd: 'TRANSITION',
        params: { type: step.transition, duration: step.transitionSec },
      })
    }
    events.push({
      t,
      cmd: 'SET_PATTERN',
      params: step.index === undefined ? { index: -1, tag: 1 } : { index: step.index },
    })
    const rampMs = step.rampSec && step.rampSec > 0 ? Math.round(step.rampSec * 1000) : 0
    const ramp = rampMs > 0 ? { rampMs } : {}
    if (step.speed !== undefined) events.push({ t, cmd: 'SET_SPEED', params: { value: step.speed, ...ramp } })
    if (step.brightness !== undefined) events.push({ t, cmd: 'SET_BRIGHTNESS', params: { value: step.brightness, ...ramp } })
    if (step.energyValue !== undefined) events.push({ t, cmd: 'SET_ENERGY', params: { value: step.energyValue, ...ramp } })
    if (step.palette) events.push({ t, cmd: 'SET_PALETTE', params: { name: step.palette } })
    if (step.params) {
      for (const [name, value] of Object.entries(step.params)) {
        const index = paramNames.indexOf(name)
        if (index < 0) continue
        events.push({ t, cmd: 'SET_PARAM', params: { index, value, ...ramp } })
      }
    }
    t += holdMs
  })
  return {
    version: 2,
    songTitle: 'Sequence',
    durationMs: Math.max(t, 1),
    bpm: countBeats && beatMs > 0 ? Math.round(60000 / beatMs) : 120,
    events,
    ...(paramNames.length ? { params: [...paramNames] } : {}),
  }
}

function eventRampSec(event: ShowEvent | undefined): number | undefined {
  if (!event) return undefined
  const rampMs = Number(event.params.rampMs ?? 0)
  return rampMs > 0 ? rampMs / 1000 : undefined
}

/** The inverse of sequenceToShow. A pattern event with no index is a tag step. */
export function showToSequence(
  show: ShowFile,
  previous: readonly PatternStep[],
  beatMs: number,
  countBeats: boolean,
): PatternStep[] {
  const patterns = show.events
    .map((event, index) => ({ event, index }))
    .filter((item) => item.event.cmd === 'SET_PATTERN')
  if (patterns.length === 0) return []
  const unit = countBeats ? Math.max(1, beatMs) : 1000
  return patterns.map((item, order) => {
    const start = item.event.t
    const end = patterns[order + 1]?.event.t ?? show.durationMs
    const hold = Math.max(HOLD_MIN, (end - start) / unit)
    const at = show.events.filter((event) => event.t === start)
    const transition = order === 0 ? undefined : at.find((event) => event.cmd === 'TRANSITION')
    const speed = at.find((event) => event.cmd === 'SET_SPEED')
    const brightness = at.find((event) => event.cmd === 'SET_BRIGHTNESS')
    const energy = at.find((event) => event.cmd === 'SET_ENERGY')
    const palette = at.find((event) => event.cmd === 'SET_PALETTE')
    const prior = previous[order]
    const tagged = item.event.params.index === undefined || Number(item.event.params.index) < 0 || item.event.params.tag === 1
    const params: Record<string, number> = {}
    for (const event of at) {
      if (event.cmd !== 'SET_PARAM') continue
      const name = show.params?.[Number(event.params.index)]
      if (!name) continue
      params[name] = Number(event.params.value)
    }
    const rampSec = eventRampSec(speed) ?? eventRampSec(brightness) ?? eventRampSec(energy)
    const step: PatternStep = {
      ...(tagged ? {} : { index: Math.max(0, Math.round(Number(item.event.params.index))) }),
      ...(prior?.sections?.length ? { sections: prior.sections } : {}),
      ...(prior?.energy?.length ? { energy: prior.energy } : {}),
      hold,
      transition: transition ? String(transition.params.type ?? 'crossfade') : (prior?.transition ?? 'crossfade'),
      transitionSec: transition ? Number(transition.params.duration ?? prior?.transitionSec ?? 1) : 0,
      ...(speed ? { speed: Number(speed.params.value) } : {}),
      ...(brightness ? { brightness: Number(brightness.params.value) } : {}),
      ...(energy ? { energyValue: Number(energy.params.value) } : {}),
      ...(palette ? { palette: String(palette.params.name) } : {}),
      ...(Object.keys(params).length ? { params } : {}),
      ...(rampSec ? { rampSec } : {}),
    }
    return step
  })
}

export interface SequenceCursor {
  /** Index into the step list. */
  index: number
  /** Show time, in seconds, when this step began. */
  start: number
  /** Beats counted inside this step. The beat that begins the step is zero. */
  beats: number
  /** Collection index resolved for this step. A tag step draws once, on entry. */
  patternIndex: number
}

export function blankSequenceCursor(): SequenceCursor {
  return { index: 0, start: 0, beats: 0, patternIndex: 0 }
}

export interface SequenceAdvance {
  cursor: SequenceCursor
  /** True on the frame a new step begins, which is when Restart clears state. */
  entered: boolean
  step: PatternStep | null
}

/**
 * One preview frame of a sequence.
 * `t` is the show clock in seconds. `stepDelta` is Next/Previous (Player
 * Controls). An empty list holds `current` and does not advance. Beat holds
 * count `beatEdge` and ignore the clock; second holds ignore beats.
 */
export function advanceSequence(
  steps: readonly PatternStep[],
  cursor: SequenceCursor,
  entries: readonly PickEntry[],
  current: number,
  t: number,
  beatEdge: boolean,
  countBeats: boolean,
  stepDelta: number,
  rand: () => number,
): SequenceAdvance {
  if (steps.length === 0) {
    return { cursor: { ...cursor, patternIndex: current }, entered: false, step: null }
  }
  const count = steps.length
  let index = ((cursor.index % count) + count) % count
  let start = cursor.start
  let beats = cursor.beats
  let patternIndex = cursor.patternIndex
  let entered = false
  const jump = Math.trunc(stepDelta)
  if (jump !== 0) {
    index = ((index + jump) % count + count) % count
    start = t
    beats = 0
    entered = true
  } else {
    const hold = Math.max(HOLD_MIN, steps[index].hold)
    const due = countBeats ? beatEdge && beats + 1 >= hold : t >= start + hold
    if (due) {
      index = (index + 1) % count
      start = t
      beats = 0
      entered = true
    } else if (countBeats && beatEdge) {
      beats += 1
    }
  }
  if (entered || patternIndex < 0 || patternIndex >= Math.max(entries.length, 1)) {
    patternIndex = resolveStepPattern(steps[index], entries, current, rand)
  }
  return {
    cursor: { index, start, beats, patternIndex },
    entered,
    step: steps[index],
  }
}

export function resolveStepPattern(
  step: PatternStep,
  entries: readonly PickEntry[],
  current: number,
  rand: () => number,
): number {
  if (entries.length === 0) return 0
  if (step.index !== undefined && Number.isFinite(step.index)) {
    const index = Math.round(step.index)
    if (index >= 0 && index < entries.length) return index
  }
  const moment: PickMoment = {
    energy: null,
    section: null,
    energies: step.energy ?? null,
    sections: step.sections ?? null,
  }
  return nextPatternIndex(entries, current, moment, 'next', rand).index
}

export function stepMomentTags(step: PatternStep): { sections: string[]; energy: EnergyBand[] } {
  return {
    sections: step.sections ?? [],
    energy: (step.energy ?? []).filter((band) => (ENERGY_BANDS as readonly string[]).includes(band)),
  }
}
