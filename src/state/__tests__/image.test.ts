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

  it('accepts optional alpha and rejects a mismatched alpha plane', () => {
    expect(asImage({ w: 1, h: 1, pixels: [1, 2, 3], alpha: [128] })).toEqual({
      w: 1, h: 1, pixels: [1, 2, 3], alpha: [128],
    })
    expect(asImage({ w: 2, h: 1, pixels: [1, 2, 3, 4, 5, 6], alpha: [255] })).toBeNull()
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

  it('smoothly samples between source pixels', () => {
    const img = { w: 2, h: 1, pixels: [0, 0, 0, 100, 200, 40] }
    const frame = sampleImageToFrame(img, 4, 1, { sampling: 'smooth' })
    expect(frame[0]).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 25, g: 50, b: 10 },
      { r: 75, g: 150, b: 30 },
      { r: 100, g: 200, b: 40 },
    ])
  })

  it('applies brightness to image pixels and the gap background', () => {
    const img = { w: 2, h: 1, pixels: [100, 80, 60, 40, 20, 10] }
    const frame = sampleImageToFrame(img, 2, 2, {
      fit: 'contain', positionY: 0, brightness: 0.5, background: { r: 20, g: 40, b: 60 },
    })
    expect(frame[0]).toEqual([{ r: 50, g: 40, b: 30 }, { r: 20, g: 10, b: 5 }])
    expect(frame[1]).toEqual([{ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 }])
  })

  it('zooms into the source and steers the crop window', () => {
    const img = { w: 4, h: 1, pixels: [10, 0, 0, 20, 0, 0, 30, 0, 0, 40, 0, 0] }
    const left = sampleImageToFrame(img, 2, 1, { zoom: 2, cropX: 0 })
    const right = sampleImageToFrame(img, 2, 1, { zoom: 2, cropX: 1 })
    expect(left[0].map(p => p.r)).toEqual([10, 20])
    expect(right[0].map(p => p.r)).toEqual([30, 40])
  })

  it('composites alpha over the configured background', () => {
    const img = {
      w: 2, h: 1, pixels: [255, 0, 0, 0, 0, 255], alpha: [0, 128],
    }
    const frame = sampleImageToFrame(img, 2, 1, { background: { r: 0, g: 100, b: 0 } })
    expect(frame[0]).toEqual([{ r: 0, g: 100, b: 0 }, { r: 0, g: 50, b: 128 }])
  })

  it('smoothly interpolates premultiplied alpha without colour halos', () => {
    const img = {
      w: 2, h: 1, pixels: [255, 0, 0, 0, 0, 255], alpha: [0, 255],
    }
    const frame = sampleImageToFrame(img, 4, 1, { sampling: 'smooth' })
    expect(frame[0]).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 0, g: 0, b: 64 },
      { r: 0, g: 0, b: 191 },
      { r: 0, g: 0, b: 255 },
    ])
  })
})
