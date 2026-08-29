import { describe, expect, it } from 'vitest'
import { fullscreenMatrixDimensions, resampleFullscreenFrame } from '../fullscreenMatrix'

describe('fullscreen matrix', () => {
  it('uses one virtual LED per 20 screen pixels at 1080p', () => {
    expect(fullscreenMatrixDimensions(1920, 1080)).toEqual({ width: 96, height: 54 })
  })

  it('bounds the temporary grid on very large displays', () => {
    const dimensions = fullscreenMatrixDimensions(7680, 4320)
    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(24_000)
    expect(dimensions.width / dimensions.height).toBeCloseTo(16 / 9, 1)
  })

  it('expands the source across the temporary grid and preserves its corners', () => {
    const source = [
      [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }],
      [{ r: 0, g: 0, b: 255 }, { r: 255, g: 255, b: 255 }],
    ]
    const expanded = resampleFullscreenFrame(source, 4, 3)

    expect(expanded).toHaveLength(3)
    expect(expanded[0]).toHaveLength(4)
    expect(expanded[0][0]).toEqual(source[0][0])
    expect(expanded[0][3]).toEqual(source[0][1])
    expect(expanded[2][0]).toEqual(source[1][0])
    expect(expanded[2][3]).toEqual(source[1][1])
  })
})
