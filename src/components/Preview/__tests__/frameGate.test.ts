import { describe, expect, it } from 'vitest'
import { frameGate } from '../frameGate'

/** Steps taken in `seconds` of animation frames at `hz`, each callback running
 *  0.5–3.5 ms into its frame (a fixed pseudo-random sequence). */
function stepsPerSecond(boardFps: number, hz: number, seconds = 10): number {
  const stepMs = 1000 / boardFps
  let seed = 7
  const jitter = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return 0.5 + 3 * (seed / 0x7fffffff) }
  let lastStep = 0
  let steps = 0
  for (let frame = 1; frame <= seconds * hz; frame++) {
    const next = frameGate((frame * 1000) / hz + jitter(), lastStep, stepMs)
    if (next === null) continue
    lastStep = next
    steps++
  }
  return steps / seconds
}

describe('frameGate', () => {
  it('holds the Board rate through callback jitter', () => {
    expect(stepsPerSecond(32, 60)).toBeCloseTo(32, 0)
    expect(stepsPerSecond(30, 30)).toBeCloseTo(30, 0)
    expect(stepsPerSecond(60, 60)).toBeCloseTo(60, 0)
    expect(stepsPerSecond(32, 144)).toBeCloseTo(32, 0)
    expect(stepsPerSecond(25, 60)).toBeCloseTo(25, 0)
  })

  it('is capped by the display', () => {
    expect(stepsPerSecond(60, 30)).toBeCloseTo(30, 0)
  })

  it('waits until a step is nearly due', () => {
    expect(frameGate(1020, 1000, 31.25)).toBeNull()
    expect(frameGate(1028, 1000, 31.25)).toBe(1031.25)
  })

  it('restarts the schedule after a stall instead of catching up', () => {
    expect(frameGate(5000, 1000, 31.25)).toBe(5000)
  })
})
