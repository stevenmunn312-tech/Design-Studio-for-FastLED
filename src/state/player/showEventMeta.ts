// What a show event is called, what it looks like and what a new one holds.
// The node's timeline strip and the full lane editor both read these, so an
// event keeps one name, one colour and one default wherever it is edited.

import { PARTICLE_STYLES } from '../../codegen/performanceGenerator'
import type { ShowCommand, ShowEvent } from '../../types/showFile'

export const SHOW_EVENT_META: Record<ShowCommand, { label: string; color: string }> = {
  SET_PATTERN:    { label: 'Pattern',    color: 'var(--accent-pattern)' },
  SET_PALETTE:    { label: 'Palette',    color: 'var(--accent-color)' },
  SET_SPEED:      { label: 'Speed',      color: 'var(--accent-math)' },
  SET_BRIGHTNESS: { label: 'Brightness', color: 'var(--accent-output)' },
  SET_ENERGY:     { label: 'Energy',     color: 'var(--accent-show)' },
  SET_PARAM:      { label: 'Param',      color: 'var(--accent-signal)' },
  BEAT_FLASH:     { label: 'Beat flash', color: 'var(--accent-audio)' },
  PARTICLE_BURST: { label: 'Particles',  color: 'var(--accent-input)' },
  TRANSITION:     { label: 'Transition', color: 'var(--accent-composite)' },
}

/** What a show plays before its first event of each kind. */
export const SHOW_DEFAULTS = {
  pattern: 'NoiseField',
  palette: 'rainbow',
  speed: 1,
  energy: 0,
  brightness: 200,
} as const

/** The range each value channel is drawn and edited over. */
export const SHOW_VALUE_RANGES: Record<'SET_SPEED' | 'SET_BRIGHTNESS' | 'SET_ENERGY' | 'SET_PARAM', { min: number; max: number; step: number }> = {
  SET_SPEED:      { min: 0, max: 3,   step: 0.05 },
  SET_BRIGHTNESS: { min: 0, max: 255, step: 1 },
  SET_ENERGY:     { min: 0, max: 1,   step: 0.01 },
  SET_PARAM:      { min: 0, max: 1,   step: 0.01 },
}

/** Params for a new event, or for an event whose command changed. */
export function defaultShowParams(cmd: ShowCommand): ShowEvent['params'] {
  switch (cmd) {
    case 'SET_PATTERN':    return { name: 'Plasma' }
    case 'SET_PALETTE':    return { name: SHOW_DEFAULTS.palette }
    case 'SET_SPEED':      return { value: SHOW_DEFAULTS.speed }
    case 'SET_BRIGHTNESS': return { value: SHOW_DEFAULTS.brightness }
    case 'SET_ENERGY':     return { value: 0.5 }
    case 'SET_PARAM':      return { index: 0, value: 0 }
    case 'BEAT_FLASH':     return { intensity: 200, decay: 200 }
    case 'PARTICLE_BURST': return { intensity: 200, hue: 0, style: 0 }
    case 'TRANSITION':     return { type: 'crossfade', duration: 0.5 }
  }
}

/** `m:ss.t` show time. */
export function formatShowTime(ms: number): string {
  const s = Math.max(0, ms / 1000)
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((Math.max(0, ms) % 1000) / 100))}`
}

/** The pattern a SET_PATTERN plays, by name. A tag step picks by its tags. */
export function showPatternLabel(event: ShowEvent, patternLabels?: readonly string[]): string {
  if (event.params.index !== undefined) {
    const index = Number(event.params.index)
    if (index < 0) return 'Tag pick'
    return patternLabels?.[index] ?? (event.params.name !== undefined ? String(event.params.name) : `#${index + 1}`)
  }
  return String(event.params.name ?? '')
}

/** One-line summary of an event's params. */
export function showEventSummary(event: ShowEvent, patternLabels?: readonly string[], paramNames?: readonly string[]): string {
  switch (event.cmd) {
    case 'SET_PATTERN':    return showPatternLabel(event, patternLabels)
    case 'SET_PALETTE':    return String(event.params.name)
    case 'SET_SPEED':      return `×${Number(event.params.value).toFixed(2)}`
    case 'SET_BRIGHTNESS': return String(Math.round(Number(event.params.value)))
    case 'SET_ENERGY':     return Number(event.params.value).toFixed(2)
    case 'SET_PARAM': {
      const index = Number(event.params.index ?? 0)
      const name = event.params.name !== undefined ? String(event.params.name) : paramNames?.[index] ?? `#${index}`
      return `${name} ${Number(event.params.value).toFixed(2)}`
    }
    case 'BEAT_FLASH':     return `i${Math.round(Number(event.params.intensity))} d${Math.round(Number(event.params.decay))}`
    case 'PARTICLE_BURST': return `${PARTICLE_STYLES[Number(event.params.style ?? 0)] ?? 'rise'} i${Math.round(Number(event.params.intensity))}`
    case 'TRANSITION':     return `${event.params.type ?? 'crossfade'} ${Number(event.params.duration).toFixed(1)}s`
  }
}
