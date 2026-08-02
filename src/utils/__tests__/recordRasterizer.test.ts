import { describe, expect, it } from 'vitest'
import { rasterizeRecordedFrame } from '../recordRasterizer'

describe('rasterizeRecordedFrame', () => {
  it('expands flat logical pixels into scale-sized RGBA blocks', () => {
    const rgba = rasterizeRecordedFrame(Uint8ClampedArray.from([255, 0, 0, 0, 20, 255]), 2, 1, 2, 'pixels')
    const pixels = Array.from({ length: 8 }, (_, index) => [...rgba.slice(index * 4, index * 4 + 4)])

    expect(pixels).toEqual([
      [255, 0, 0, 255], [255, 0, 0, 255], [0, 20, 255, 255], [0, 20, 255, 255],
      [255, 0, 0, 255], [255, 0, 0, 255], [0, 20, 255, 255], [0, 20, 255, 255],
    ])
  })

  it('renders lit LED centres over an opaque dark substrate', () => {
    const rgba = rasterizeRecordedFrame(Uint8ClampedArray.from([255, 80, 0]), 1, 1, 8, 'leds')
    const corner = [...rgba.slice(0, 4)]
    const centreOffset = (4 * 8 + 4) * 4
    const centre = [...rgba.slice(centreOffset, centreOffset + 4)]

    expect(corner[3]).toBe(255)
    expect(centre[3]).toBe(255)
    expect(centre[0]).toBeGreaterThan(corner[0])
    expect(centre[1]).toBeGreaterThan(corner[1])
  })
})
