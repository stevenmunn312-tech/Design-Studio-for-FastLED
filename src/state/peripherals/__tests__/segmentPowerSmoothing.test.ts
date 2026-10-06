import { describe, expect, it } from 'vitest'
import { smoothSegmentPower } from '../../displays/segmentDisplay'

describe('segment power smoothing', () => {
  it('shows the first reading immediately and holds subsequent updates for half a second', () => {
    let state = smoothSegmentPower(undefined, -1, 0)
    expect(state.shown).toBe(-1)
    state = smoothSegmentPower(state, -2, 250)
    expect(state.shown).toBe(-1)
    expect(state.filtered).toBeCloseTo(-1.393469)
    state = smoothSegmentPower(state, -2, 500)
    expect(state.shown).toBeCloseTo(-1.632121)
    state = smoothSegmentPower(state, -2, 750)
    expect(state.shown).toBeCloseTo(-1.632121)
  })

  it('uses elapsed time so its response does not depend on frame rate', () => {
    const start = smoothSegmentPower(undefined, 0, 0)
    let fast = start
    for (let time = 10; time <= 1000; time += 10) fast = smoothSegmentPower(fast, 10, time)
    const slow = smoothSegmentPower(start, 10, 1000)
    expect(fast.shown).toBeCloseTo(slow.shown)
    expect(slow.shown).toBeCloseTo(10 * (1 - Math.exp(-2)))
  })

  it('reports invalid data immediately and restarts cleanly on recovery or a clock rewind', () => {
    const start = smoothSegmentPower(undefined, 2, 1000)
    const invalid = smoothSegmentPower(start, NaN, 1100)
    expect(invalid.shown).toBeNaN()
    expect(smoothSegmentPower(invalid, 3, 1200).shown).toBe(3)
    expect(smoothSegmentPower(start, 4, 0).shown).toBe(4)
  })
})
