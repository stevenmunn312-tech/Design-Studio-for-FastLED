import { describe, expect, it } from 'vitest'
import { idleFrame } from '../idleFrame'

function brightestX(frame: ReturnType<typeof idleFrame>) {
  let best = { x: -1, value: -1 }
  for (let y = 0; y < frame.length; y++) {
    for (let x = 0; x < frame[y].length; x++) {
      const pixel = frame[y][x]
      const value = pixel.r + pixel.g + pixel.b
      if (value > best.value) best = { x, value }
    }
  }
  return best.x
}

describe('idleFrame', () => {
  it('keeps the standby matrix mostly dark', () => {
    const frame = idleFrame(0, 16, 16)
    const average = frame.flat().reduce((sum, pixel) => sum + pixel.r + pixel.g + pixel.b, 0) / (16 * 16 * 3)
    expect(average).toBeLessThan(25)
  })

  it('moves its diagnostic sweep over time', () => {
    expect(brightestX(idleFrame(90, 16, 16))).not.toBe(brightestX(idleFrame(240, 16, 16)))
  })
})
