import { describe, it, expect } from 'vitest'
import {
  buttonEdge,
  blankButtonEdgeState,
  normalizeButtonEdgeSettings,
  DEFAULT_BUTTON_EDGE_SETTINGS,
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
