import { describe, expect, it, vi } from 'vitest'
import {
  performanceOptionsFromProperties,
  sortShowEvents,
  generateShow,
  showFileToBinary,
  bakeEnvelope,
  ENVELOPE_RATE_HZ,
  SHOW_PATTERNS,
  SHOW_TRANSITIONS,
} from '../performanceGenerator'
import type { ShowEvent, SongAnalysis, EnergyPoint } from '../../types/showFile'

// An analysis carrying a 0–2s energy track (bass ramps 0→1→0.5), for envelope tests.
const withEnergy: SongAnalysis = {
  title: 'E', durationMs: 2000,
  beats: { timestamps: [], bpm: 120, confidence: 0.9 },
  energy: [
    { t: 0,    bass: 0,   mids: 0.2, treble: 0.4, overall: 0.2 },
    { t: 1000, bass: 1,   mids: 0.6, treble: 0.8, overall: 0.8 },
    { t: 2000, bass: 0.5, mids: 0.5, treble: 0.5, overall: 0.5 },
  ],
  sections: [{ startMs: 0, endMs: 2000, type: 'drop', energy: 0.8 }],
  mood: { energy: 0.7, valence: 0.6, key: 'C major' },
}

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
      patternHold: 10,
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

  // Section-aware selection (slice 3): the fixture has a verse section at t=0 and
  // a drop section at t=2000, so tagging makes the per-section pick deterministic.
  it('restricts a tagged collection pattern to its eligible sections', () => {
    const ids = ['g-verse', 'g-drop']
    const tags = [['verse'], ['drop']]   // aligned by index with ids
    const setPatterns = generateShow(analysis, {}, ids, tags).events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(setPatterns).toHaveLength(2)
    expect(setPatterns.find((e) => e.t === 0)!.params.index).toBe(0)      // verse → pattern 0
    expect(setPatterns.find((e) => e.t === 2000)!.params.index).toBe(1)   // drop  → pattern 1
  })

  it('treats an untagged collection pattern as eligible in any section', () => {
    const ids = ['g-intro-only', 'g-any']
    const tags = [['intro'], []]   // pattern 0 never matches verse/drop; pattern 1 is "any"
    const setPatterns = generateShow(analysis, {}, ids, tags).events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(setPatterns.every((e) => e.params.index === 1)).toBe(true)
  })

  it('falls back to the whole set when no pattern matches a section', () => {
    const ids = ['a', 'b']
    const tags = [['intro'], ['intro']]   // nothing is eligible in verse/drop
    const setPatterns = generateShow(analysis, {}, ids, tags).events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(setPatterns.every((e) => [0, 1].includes(e.params.index as number))).toBe(true)
  })

  // A single long section so within-section cycling has room to switch.
  const longAnalysis: SongAnalysis = {
    ...analysis,
    durationMs: 20000,
    sections: [{ startMs: 0, endMs: 20000, type: 'drop', energy: 0.9 }],
  }

  it('cycles through several patterns within a long section', () => {
    // 20s section, 5s min hold → switches at 0/5/10/15s; a 3-pattern collection
    // gives real variety. (No beats past 2s in this fixture, so switches fall
    // back to plain time-based, which is what makes the count deterministic.)
    const ids = ['g0', 'g1', 'g2']
    const show = generateShow(longAnalysis, { patternHold: 5 }, ids)
    const setPatterns = show.events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(setPatterns).toHaveLength(4)
    // No two consecutive slots repeat the same pattern.
    for (let i = 1; i < setPatterns.length; i++) {
      expect(setPatterns[i].params.index).not.toBe(setPatterns[i - 1].params.index)
    }
    // Each switch after the first is preceded by a transition.
    expect(show.events.filter((e) => e.cmd === 'TRANSITION')).toHaveLength(3)
  })

  it('cycles enum patterns too, avoiding immediate repeats', () => {
    const setPatterns = generateShow(longAnalysis, { patternHold: 5 }).events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(setPatterns.length).toBeGreaterThan(1)
    for (let i = 1; i < setPatterns.length; i++) {
      expect(setPatterns[i].params.name).not.toBe(setPatterns[i - 1].params.name)
    }
  })

  it('holds a single pattern when a section is too short to cycle', () => {
    // The fixture's sections are 2s each — far shorter than the 6s default hold.
    const perSection = generateShow(analysis, {}, ['a', 'b']).events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(perSection).toHaveLength(analysis.sections.length)
  })

  it('does not cycle when only one pattern is available for the section', () => {
    // One pattern in the collection → nothing to switch to, even in a long section.
    const setPatterns = generateShow(longAnalysis, { patternHold: 5 }, ['solo']).events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(setPatterns).toHaveLength(1)
    expect(setPatterns[0].params.index).toBe(0)
  })

  it('snaps within-section switches to the beat after the minimum hold', () => {
    // Beats every 700ms so the 5s hold never lands exactly on one — each switch
    // must fall on a beat *after* at least 5s have elapsed (hold longer to sync).
    const beatsArr = Array.from({ length: 60 }, (_, i) => i * 700)
    const beatSong: SongAnalysis = {
      ...analysis,
      durationMs: 30000,
      beats: { timestamps: beatsArr, bpm: 120, confidence: 0.9 },
      sections: [{ startMs: 0, endMs: 30000, type: 'drop', energy: 0.9 }],
    }
    const setPatterns = generateShow(beatSong, { patternHold: 5 }, ['x', 'y']).events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(setPatterns[0].t).toBe(0)                      // first is a plain cut-in
    for (let i = 1; i < setPatterns.length; i++) {
      expect(beatsArr).toContain(setPatterns[i].t)        // lands on a beat
      expect(setPatterns[i].t - setPatterns[i - 1].t).toBeGreaterThanOrEqual(5000)  // held ≥ minimum
    }
  })

  it('adds an extra beat-aligned switch on a significant energy surge', () => {
    // Energy is flat then jumps hard at 15s. With a 10s hold the periodic schedule
    // switches at ~10s and ~20s; the surge forces an extra switch near 15s.
    const energy: EnergyPoint[] = []
    for (let t = 0; t <= 30000; t += 100) energy.push({ t, bass: 0, mids: 0, treble: 0, overall: t >= 15000 ? 0.9 : 0.1 })
    const beatsArr = Array.from({ length: 120 }, (_, i) => i * 250)
    const surgeSong: SongAnalysis = {
      ...analysis,
      durationMs: 30000,
      beats: { timestamps: beatsArr, bpm: 120, confidence: 0.9 },
      energy,
      sections: [{ startMs: 0, endMs: 30000, type: 'chorus', energy: 0.7 }],
    }
    const withSurge = generateShow(surgeSong, { patternHold: 10 }, ['x', 'y', 'z']).events.filter((e) => e.cmd === 'SET_PATTERN')
    const noSurge = generateShow({ ...surgeSong, energy: [] }, { patternHold: 10 }, ['x', 'y', 'z']).events.filter((e) => e.cmd === 'SET_PATTERN')
    expect(withSurge.length).toBeGreaterThan(noSurge.length)
    expect(withSurge.some((e) => e.t === 15000)).toBe(true)
  })
})

describe('generateShow — extra transitions from a wired TransitionSet', () => {
  it('only ever uses the rule-based crossfade/wipe/dissolve pool when no extras are given', () => {
    const show = generateShow(analysis)
    const types = show.events.filter((e) => e.cmd === 'TRANSITION').map((e) => e.params.type)
    expect(types.length).toBeGreaterThan(0)
    expect(types.every((t) => ['crossfade', 'wipe', 'dissolve'].includes(t as string))).toBe(true)
  })

  it('mixes in the extra pool when a TransitionSet is wired', () => {
    // Force the 50/50 gate to always take the extra branch, and its index pick
    // to always land on the first entry, so the result is deterministic.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const show = generateShow(analysis, {}, [], [], ['iris', 'zoom'])
      const types = show.events.filter((e) => e.cmd === 'TRANSITION').map((e) => e.params.type)
      expect(types.length).toBeGreaterThan(0)
      expect(types.every((t) => t === 'iris')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('round-trips an extra transition style through the binary export', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const show = generateShow(analysis, {}, [], [], ['iris'])
      const view = new DataView(showFileToBinary(show))
      const count = view.getUint32(11, true)
      let off = 15
      let foundIrisId = -1
      for (let i = 0; i < count; i++) {
        const cmd = view.getUint8(off + 4)          // t_ms(4) then cmd(1)
        const pc = view.getUint8(off + 5)           // param count byte
        if (cmd === 5) foundIrisId = view.getFloat32(off + 6, true)   // 5 = TRANSITION, first param = type id
        off += 4 + 1 + 1 + pc * 4
      }
      expect(foundIrisId).toBe(3)   // iris's stable id in TRANSITION_IDS
    } finally {
      spy.mockRestore()
    }
  })
})

describe('bakeEnvelope + baked audio', () => {
  it('resamples the energy track to the fixed frame rate with interpolation', () => {
    const env = bakeEnvelope(withEnergy)
    expect(env.rateHz).toBe(ENVELOPE_RATE_HZ)
    expect(env.bass).toHaveLength(100)          // 2000ms × 50/1000
    expect(env.bass[0]).toBeCloseTo(0)          // first point
    expect(env.bass[25]).toBeCloseTo(0.5, 1)    // 500ms → halfway 0→1
    expect(env.bass[50]).toBeCloseTo(1, 1)      // 1000ms → the peak point
  })

  it('generateShow attaches the envelope only when the analysis has energy', () => {
    expect(generateShow(withEnergy).audio).toBeDefined()
    expect(generateShow(withEnergy).audio!.rateHz).toBe(50)
    expect(generateShow(analysis).audio).toBeUndefined()   // fixture has energy: []
  })

  it('appends the envelope after the events in the binary, quantised to bytes', () => {
    const show = generateShow(withEnergy)
    const view = new DataView(showFileToBinary(show))
    // Walk the header + events to reach the trailing envelope block.
    let off = 15
    const count = view.getUint32(11, true)
    for (let i = 0; i < count; i++) { off += 4 + 1; const pc = view.getUint8(off); off += 1 + pc * 4 }
    const rate = view.getUint8(off); off += 1
    const frames = view.getUint32(off, true); off += 4
    expect(rate).toBe(50)
    expect(frames).toBe(show.audio!.bass.length)
    expect(view.byteLength).toBe(off + frames * 3)      // 3 bytes/frame, nothing trailing
    expect(view.getUint8(off + 50 * 3)).toBe(255)       // frame 50 bass (1.0) → 255
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
    expect(SHOW_TRANSITIONS).toEqual([
      'crossfade', 'wipe', 'dissolve', 'iris', 'clockwipe', 'push', 'checkerboard',
      'diagonal', 'fadeblack', 'fadewhite', 'blinds', 'ripple', 'spiral', 'curtain',
      'scanlines', 'zoom',
    ])
  })
})
