import { describe, expect, it } from 'vitest'
import { expandFlatFrame } from '../recordRasterizer'

describe('expandFlatFrame', () => {
  it('expands flat logical pixels into scale-sized RGBA blocks', () => {
    const rgba = expandFlatFrame(Uint8ClampedArray.from([255, 0, 0, 0, 20, 255]), 2, 1, 2)
    const pixels = Array.from({ length: 8 }, (_, index) => [...rgba.slice(index * 4, index * 4 + 4)])

    expect(pixels).toEqual([
      [255, 0, 0, 255], [255, 0, 0, 255], [0, 20, 255, 255], [0, 20, 255, 255],
      [255, 0, 0, 255], [255, 0, 0, 255], [0, 20, 255, 255], [0, 20, 255, 255],
    ])
  })

  it('reproduces LED colours exactly, with no glow or substrate', () => {
    const rgba = expandFlatFrame(Uint8ClampedArray.from([255, 80, 0, 0, 0, 0]), 1, 2, 4)
    // Every pixel of the lit row is the exact LED colour…
    for (let i = 0; i < 16; i++) {
      expect([...rgba.slice(i * 4, i * 4 + 4)]).toEqual([255, 80, 0, 255])
    }
    // …and the dark row stays fully black rather than picking up bloom.
    for (let i = 16; i < 32; i++) {
      expect([...rgba.slice(i * 4, i * 4 + 4)]).toEqual([0, 0, 0, 255])
    }
  })

  it('keeps a single-row strip a single row', () => {
    const rgba = expandFlatFrame(Uint8ClampedArray.from([10, 20, 30, 40, 50, 60]), 2, 1, 3)
    expect(rgba).toHaveLength(2 * 3 * 1 * 3 * 4)
  })
})
