import { describe, expect, it } from 'vitest'
import {
  performanceOptionsFromProperties,
  sortShowEvents,
  generateShow,
  showFileToBinary,
  SHOW_PATTERNS,
  SHOW_TRANSITIONS,
} from '../performanceGenerator'
import type { ShowEvent, SongAnalysis } from '../../types/showFile'

const analysis: SongAnalysis = {
  title: 'Test Song',
  durationMs: 4000,
  beats: { timestamps: [500, 1000, 1500, 2000], bpm: 120, confidence: 0.9 },
  energy: [],
  sections: [
    { startMs: 0, endMs: 2000, type: 'verse', energy: 0.5 },
    { startMs: 2000, endMs: 4000, type: 'drop', energy: 0.9 },
  ],
  mood: { energy: 0.7, valence: 0.6, key: 'C major' },
}

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

describe('generateShow — collection vs enum patterns', () => {
  it('uses the built-in section→pattern names when no collection is wired', () => {
    const show = generateShow(analysis)
    expect(show.version).toBe(1)
    expect(show.patternSet).toBeUndefined()
    const setPattern = show.events.find((e) => e.cmd === 'SET_PATTERN')!
    expect(typeof setPattern.params.name).toBe('string')
    expect(setPattern.params.index).toBeUndefined()
  })

  it('emits a SET_ENERGY event per section carrying the 0–1 section energy', () => {
    const show = generateShow(analysis)
    const energyEvents = show.events.filter((e) => e.cmd === 'SET_ENERGY')
    expect(energyEvents).toHaveLength(analysis.sections.length)
    expect(energyEvents.map((e) => e.params.value)).toEqual(analysis.sections.map((s) => s.energy))
  })

  it('schedules by index into a wired collection (version 2 + patternSet)', () => {
    const ids = ['grp-a', 'grp-b', 'grp-c']
    const show = generateShow(analysis, {}, ids)
    expect(show.version).toBe(2)
    expect(show.patternSet).toEqual(ids)
    const setPatterns = show.events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(setPatterns.length).toBeGreaterThan(0)
    for (const ev of setPatterns) {
      expect(ev.params.name).toBeUndefined()
      const idx = ev.params.index as number
      expect(Number.isInteger(idx)).toBe(true)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(ids.length)
    }
  })
})

describe('showFileToBinary — version 2 collection shows', () => {
  it('stamps version 2 and encodes the pattern index directly', () => {
    const show = generateShow(analysis, {}, ['a', 'b'])
    const view = new DataView(showFileToBinary(show))
    expect(view.getUint8(4)).toBe(2)   // version byte (after the 4-byte magic)

    // Walk to the first SET_PATTERN event and read its index param.
    let off = 4 + 1 + 2 + 4 + 4   // version + bpm + duration + count
    const count = view.getUint32(11, true)
    let found = -1
    for (let i = 0; i < count; i++) {
      off += 4                       // t
      const cmd = view.getUint8(off++)
      const nParams = view.getUint8(off++)
      if (cmd === 0) { found = view.getFloat32(off, true); break }
      off += nParams * 4
    }
    expect(found).toBeGreaterThanOrEqual(0)
    expect(found).toBeLessThan(2)
  })

  it('keeps version 1 for enum shows', () => {
    const view = new DataView(showFileToBinary(generateShow(analysis)))
    expect(view.getUint8(4)).toBe(1)
  })
})

describe('editor option lists', () => {
  it('exposes round-trippable patterns and transitions for the editor dropdowns', () => {
    expect(SHOW_PATTERNS).toContain('Plasma')
    expect(SHOW_PATTERNS).toContain('Fire2012')
    expect(SHOW_TRANSITIONS).toEqual(['crossfade', 'wipe', 'dissolve'])
  })
})
