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

  it('contains an image and positions the letterbox area', () => {
    const img = { w: 2, h: 1, pixels: [255, 0, 0, 0, 255, 0] }
    const top = sampleImageToFrame(img, 2, 2, { fit: 'contain', positionY: 0 })
    const bottom = sampleImageToFrame(img, 2, 2, { fit: 'contain', positionY: 1 })
    expect(top[0]).toEqual([{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }])
    expect(top[1]).toEqual([{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }])
    expect(bottom[0]).toEqual([{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }])
    expect(bottom[1]).toEqual(top[0])
  })

  it('uses position to steer a cover crop', () => {
    const img = { w: 4, h: 2, pixels: [
      10, 0, 0, 20, 0, 0, 30, 0, 0, 40, 0, 0,
      50, 0, 0, 60, 0, 0, 70, 0, 0, 80, 0, 0,
    ] }
    const left = sampleImageToFrame(img, 2, 2, { fit: 'cover', positionX: 0 })
    const right = sampleImageToFrame(img, 2, 2, { fit: 'cover', positionX: 1 })
    expect(left[0].map(p => p.r)).toEqual([10, 20])
    expect(right[0].map(p => p.r)).toEqual([30, 40])
  })

  it('rotates clockwise and flips in the displayed orientation', () => {
    const img = { w: 2, h: 2, pixels: [
      10, 0, 0, 20, 0, 0,
      30, 0, 0, 40, 0, 0,
    ] }
    const rotated = sampleImageToFrame(img, 2, 2, { rotation: 90 })
    const flipped = sampleImageToFrame(img, 2, 2, { rotation: 90, flipX: true })
    expect(rotated.map(row => row.map(p => p.r))).toEqual([[30, 10], [40, 20]])
    expect(flipped.map(row => row.map(p => p.r))).toEqual([[10, 30], [20, 40]])
  })

  it('places an original-size image without scaling it', () => {
    const img = { w: 2, h: 1, pixels: [10, 0, 0, 20, 0, 0] }
    const frame = sampleImageToFrame(img, 4, 3, { fit: 'original', positionX: 1, positionY: 1 })
    expect(frame.map(row => row.map(p => p.r))).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 10, 20],
    ])
  })
})
