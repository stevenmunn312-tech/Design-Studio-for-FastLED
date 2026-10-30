import { describe, expect, it } from 'vitest'
import { playerPositionMs } from '../playerTransport'

// A Music Player's patterns run on the track position. posMs follows the
// audio element's timeupdate events, about four a second, so reading it made
// the patterns step four times a second whatever the frame rate.
describe('playerPositionMs', () => {
  const show = { nodeId: 'pg', title: 'Show', durationMs: 1000, hasPrev: false, hasNext: false, toggle() {}, seek() {}, prev() {}, next() {} }

  it('reads the local player live, between its timeupdate events', () => {
    let live = 1234.5
    const state = { transport: null, posMs: 1000, localClock: () => live }
    expect(playerPositionMs(state)).toBe(1234.5)
    live = 1251.2
    expect(playerPositionMs(state)).toBe(1251.2)
  })

  it('keeps a show transport on its own position, and falls back without a clock', () => {
    expect(playerPositionMs({ transport: show, posMs: 500, localClock: () => 9999 })).toBe(500)
    expect(playerPositionMs({ transport: null, posMs: 700, localClock: null })).toBe(700)
    expect(playerPositionMs({ transport: null, posMs: 700, localClock: () => Number.NaN })).toBe(700)
  })
})
