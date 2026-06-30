import { describe, expect, it } from 'vitest'
import {
  performanceOptionsFromProperties,
  sortShowEvents,
  SHOW_PATTERNS,
  SHOW_TRANSITIONS,
} from '../performanceGenerator'
import type { ShowEvent } from '../../types/showFile'

describe('performanceOptionsFromProperties', () => {
  it('normalises node controls into safe generator options', () => {
    expect(performanceOptionsFromProperties({
      beatIntensity: 2,
      energySensitivity: -1,
      transitionDuration: 9,
      paletteMode: 'fixed',
      fixedPalette: 'ice',
    })).toEqual({
      beatIntensity: 1,
      energySensitivity: 0,
      transitionDuration: 3,
      paletteMode: 'fixed',
      fixedPalette: 'ice',
    })
  })

  it('falls back from invalid saved values', () => {
    expect(performanceOptionsFromProperties({
      beatIntensity: 'nope',
      energySensitivity: null,
      paletteMode: 'surprise',
      fixedPalette: 'not-a-palette',
    })).toMatchObject({ beatIntensity: 0.8, energySensitivity: 0.7, paletteMode: 'mood', fixedPalette: 'rainbow' })
  })
})

describe('sortShowEvents', () => {
  it('orders by time, then groups same-instant commands (pattern before flash)', () => {
    const events: ShowEvent[] = [
      { t: 1000, cmd: 'BEAT_FLASH', params: { intensity: 200, decay: 200 } },
      { t: 0, cmd: 'BEAT_FLASH', params: { intensity: 200, decay: 200 } },
      { t: 0, cmd: 'SET_PATTERN', params: { name: 'Fire' } },
      { t: 0, cmd: 'SET_PALETTE', params: { name: 'lava' } },
    ]
    const sorted = sortShowEvents(events)
    expect(sorted.map((e) => `${e.t}:${e.cmd}`)).toEqual([
      '0:SET_PATTERN',
      '0:SET_PALETTE',
      '0:BEAT_FLASH',
      '1000:BEAT_FLASH',
    ])
  })

  it('does not mutate the input array', () => {
    const events: ShowEvent[] = [
      { t: 100, cmd: 'SET_SPEED', params: { value: 1 } },
      { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 200 } },
    ]
    sortShowEvents(events)
    expect(events[0].t).toBe(100)
  })
})

describe('editor option lists', () => {
  it('exposes round-trippable patterns and transitions for the editor dropdowns', () => {
    expect(SHOW_PATTERNS).toContain('Plasma')
    expect(SHOW_PATTERNS).toContain('Fire2012')
    expect(SHOW_TRANSITIONS).toEqual(['crossfade', 'wipe', 'dissolve'])
  })
})
