import { describe, it, expect } from 'vitest'
import { asImage, sampleImageToFrame } from '../image'

describe('asImage', () => {
  it('accepts a well-formed image', () => {
    const img = asImage({ w: 1, h: 1, pixels: [1, 2, 3] })
    expect(img).toEqual({ w: 1, h: 1, pixels: [1, 2, 3] })
  })

  it('rejects non-objects and missing fields', () => {
    expect(asImage(null)).toBeNull()
    expect(asImage('nope')).toBeNull()
    expect(asImage({ w: 2, h: 2 })).toBeNull()
  })

  it('rejects bad dimensions and mismatched pixel length', () => {
    expect(asImage({ w: 0, h: 2, pixels: [] })).toBeNull()
    expect(asImage({ w: 1.5, h: 1, pixels: [1, 2, 3] })).toBeNull()
    expect(asImage({ w: 2, h: 2, pixels: [1, 2, 3] })).toBeNull() // needs 12 entries
  })
})

describe('sampleImageToFrame', () => {
  it('nearest-neighbour upscales a 2×2 image to a larger frame', () => {
    const img = { w: 2, h: 2, pixels: [10, 0, 0, 0, 20, 0, 0, 0, 30, 40, 40, 40] }
    const frame = sampleImageToFrame(img, 4, 4)
    expect(frame.length).toBe(4)
    expect(frame[0][0]).toEqual({ r: 10, g: 0, b: 0 })    // top-left source pixel
    expect(frame[0][3]).toEqual({ r: 0, g: 20, b: 0 })    // top-right
    expect(frame[3][3]).toEqual({ r: 40, g: 40, b: 40 })  // bottom-right
  })
})
