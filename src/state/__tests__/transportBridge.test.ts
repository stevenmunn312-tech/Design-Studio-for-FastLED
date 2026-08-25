import { describe, it, expect } from 'vitest'
import {
  buttonEdge,
  blankButtonEdgeState,
  normalizeButtonEdgeSettings,
  DEFAULT_BUTTON_EDGE_SETTINGS,
  scrubCommit,
  SCRUB_EPSILON,
  resolveTransportStatus,
  blankTransportStatus,
  formatTransportTime,
  type ButtonEdgeState,
} from '../transportBridge'

const settings = DEFAULT_BUTTON_EDGE_SETTINGS

describe('buttonEdge', () => {
  // The contract fixed once for every transport sink: a button reads true while
  // held, and a one-shot action takes the rising edge. Next advancing a track
  // every frame a finger rests on it is the bug this prevents.
  it('pulses once on a press, not once per frame held', () => {
    const state = blankButtonEdgeState(0)
    const pulses: boolean[] = []
    // Press at t=0, hold through t=500 with no repeat.
    for (const now of [0, 40, 100, 200, 500]) pulses.push(buttonEdge(state, true, now, false, settings))
    expect(pulses.filter(Boolean)).toHaveLength(1)
  })

  it('ignores a bounce shorter than the debounce window', () => {
    const state = blankButtonEdgeState(0)
    expect(buttonEdge(state, true, 0, false, settings)).toBe(false)
    // Released again before debounceMs elapsed — never stabilised, never fired.
    expect(buttonEdge(state, false, 10, false, settings)).toBe(false)
    expect(buttonEdge(state, false, 100, false, settings)).toBe(false)
  })

  it('fires once the press has been stable for the debounce window', () => {
    const state = blankButtonEdgeState(0)
    expect(buttonEdge(state, true, 0, false, settings)).toBe(false)
    expect(buttonEdge(state, true, settings.debounceMs, false, settings)).toBe(true)
  })

  it('repeats a held button only when the caller asks', () => {
    const held = (repeat: boolean) => {
      const state = blankButtonEdgeState(0)
      let count = 0
      for (let now = 0; now <= 2000; now += 20) {
        if (buttonEdge(state, true, now, repeat, settings)) count++
      }
      return count
    }
    expect(held(false)).toBe(1)
    expect(held(true)).toBeGreaterThan(5)
  })

  it('does not emit a burst of catch-up pulses after a long frame gap', () => {
    const state = blankButtonEdgeState(0)
    buttonEdge(state, true, 0, true, settings)
    buttonEdge(state, true, settings.debounceMs, true, settings)
    // One very late frame: the repeat schedule advances past it rather than
    // firing once per missed interval.
    expect(buttonEdge(state, true, 10_000, true, settings)).toBe(true)
    expect(buttonEdge(state, true, 10_001, true, settings)).toBe(false)
  })

  it('re-arms after a release', () => {
    const state: ButtonEdgeState = blankButtonEdgeState(0)
    buttonEdge(state, true, 0, false, settings)
    expect(buttonEdge(state, true, 50, false, settings)).toBe(true)
    buttonEdge(state, false, 100, false, settings)
    buttonEdge(state, false, 200, false, settings)
    buttonEdge(state, true, 300, false, settings)
    expect(buttonEdge(state, true, 400, false, settings)).toBe(true)
  })

  it('clamps hostile settings rather than trusting them', () => {
    const s = normalizeButtonEdgeSettings({ debounceMs: -5, repeatIntervalMs: 0 })
    expect(s.debounceMs).toBe(0)
    expect(s.repeatIntervalMs).toBeGreaterThanOrEqual(1)
  })

  // NaN would make `now - changedAt >= debounce` false forever, so the button
  // would stop working rather than misbehave visibly.
  it('falls back for unparseable settings instead of passing NaN through', () => {
    const s = normalizeButtonEdgeSettings({ debounceMs: 'soon', repeatIntervalMs: {} })
    expect(s.debounceMs).toBe(DEFAULT_BUTTON_EDGE_SETTINGS.debounceMs)
    expect(s.repeatIntervalMs).toBe(DEFAULT_BUTTON_EDGE_SETTINGS.repeatIntervalMs)

    const state = blankButtonEdgeState(0)
    buttonEdge(state, true, 0, false, s)
    expect(buttonEdge(state, true, 1000, false, s)).toBe(true)
  })
})

describe('scrubCommit', () => {
  // A parked slider publishes its value every frame. Treating that as a seek
  // would drag playback back to the same spot forever.
  it('does not seek while the control is parked', () => {
    const state = { last: 0, seen: false }
    expect(scrubCommit(state, 0.5)).toBeNull()
    expect(scrubCommit(state, 0.5)).toBeNull()
    expect(scrubCommit(state, 0.5)).toBeNull()
  })

  it('never seeks on the first reading', () => {
    // A graph that loads with its slider at 0.5 has not asked for anything.
    expect(scrubCommit({ last: 0, seen: false }, 0.5)).toBeNull()
  })

  it('seeks when the control moves', () => {
    const state = { last: 0, seen: false }
    scrubCommit(state, 0.2)
    expect(scrubCommit(state, 0.7)).toBeCloseTo(0.7)
  })

  it('ignores jitter below the threshold', () => {
    const state = { last: 0, seen: false }
    scrubCommit(state, 0.5)
    expect(scrubCommit(state, 0.5 + SCRUB_EPSILON / 2)).toBeNull()
    expect(scrubCommit(state, 0.5 + SCRUB_EPSILON * 2)).not.toBeNull()
  })

  it('clamps out-of-range and rejects non-finite input', () => {
    const state = { last: 0, seen: false }
    scrubCommit(state, 0)
    expect(scrubCommit(state, 5)).toBe(1)
    expect(scrubCommit(state, Number.NaN)).toBeNull()
  })
})

describe('resolveTransportStatus', () => {
  it('reports nothing playing for an empty transport', () => {
    expect(resolveTransportStatus({})).toEqual(blankTransportStatus())
  })

  it('converts milliseconds to seconds and derives progress', () => {
    const status = resolveTransportStatus({ posMs: 30_000, durationMs: 120_000 })
    expect(status.elapsedSec).toBe(30)
    expect(status.durationSec).toBe(120)
    expect(status.progress).toBe(0.25)
  })

  // A bar that overflows its widget is a rendering bug on a device with no room
  // to absorb it.
  it('never lets progress exceed one', () => {
    const status = resolveTransportStatus({ posMs: 200_000, durationMs: 120_000 })
    expect(status.progress).toBe(1)
    expect(status.elapsedSec).toBe(120)
  })

  it('reports zero progress rather than dividing by an unknown duration', () => {
    const status = resolveTransportStatus({ posMs: 30_000, durationMs: 0 })
    expect(status.progress).toBe(0)
    expect(status.elapsedSec).toBe(30)
  })

  it('presents the pattern position one-based for display', () => {
    const status = resolveTransportStatus({ patternIndex: 0, patternNames: ['Fire', 'Rain', 'Waves'] })
    expect(status.patternIndex).toBe(1)
    expect(status.patternName).toBe('Fire')
    expect(status.patternCount).toBe(3)
  })

  it('reports no pattern rather than a phantom first one', () => {
    const status = resolveTransportStatus({ patternIndex: null, patternNames: ['Fire'] })
    expect(status.patternIndex).toBe(0)
    expect(status.patternName).toBe('')
    expect(status.patternCount).toBe(1)
  })

  it('clamps an index past the end of the collection', () => {
    const status = resolveTransportStatus({ patternIndex: 9, patternNames: ['Fire', 'Rain'] })
    expect(status.patternIndex).toBe(2)
    expect(status.patternName).toBe('Rain')
  })

  it('clamps volume to its range', () => {
    expect(resolveTransportStatus({ volume: 3 }).volume).toBe(1)
    expect(resolveTransportStatus({ volume: -1 }).volume).toBe(0)
    expect(resolveTransportStatus({ volume: Number.NaN }).volume).toBe(0)
  })

  it('treats a missing playing flag as not playing', () => {
    expect(resolveTransportStatus({ playing: null }).playing).toBe(false)
  })
})

describe('formatTransportTime', () => {
  it('prints M:SS', () => {
    expect(formatTransportTime(0)).toBe('0:00')
    expect(formatTransportTime(9)).toBe('0:09')
    expect(formatTransportTime(65)).toBe('1:05')
    expect(formatTransportTime(600)).toBe('10:00')
  })

  // A fixed display row has no space to grow an hours field, so minutes keep
  // counting rather than the layout changing shape mid-track.
  it('keeps counting in minutes past an hour', () => {
    expect(formatTransportTime(3661)).toBe('61:01')
  })

  it('floors rather than rounding up into a second that has not happened', () => {
    expect(formatTransportTime(9.99)).toBe('0:09')
  })

  it('treats negative and non-finite input as zero', () => {
    expect(formatTransportTime(-5)).toBe('0:00')
    expect(formatTransportTime(Number.NaN)).toBe('0:00')
  })
})
