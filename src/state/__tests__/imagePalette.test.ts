import { describe, expect, it } from 'vitest'
import { dominantImageColors, imagePaletteStops16 } from '../imagePalette'

describe('image palette extraction', () => {
  it('extracts representative colours and expands them to 16 palette stops', () => {
    const image = {
      w: 4,
      h: 1,
      pixels: [
        255, 0, 0,
        255, 0, 0,
        255, 0, 0,
        0, 0, 255,
      ],
    }
    const anchors = dominantImageColors(image, 2)
    expect(anchors).toEqual([
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 0, b: 0 },
    ])

    const stops = imagePaletteStops16(image, 2)
    expect(stops).toHaveLength(16)
    expect(stops[0]).toEqual(anchors[0])
    expect(stops[15]).toEqual(anchors[1])
  })

  it('ignores fully transparent pixels', () => {
    const image = {
      w: 2,
      h: 1,
      pixels: [20, 40, 60, 0, 255, 0],
      alpha: [255, 0],
    }
    expect(dominantImageColors(image, 6)).toEqual([
      { r: 20, g: 40, b: 60 },
      { r: 20, g: 40, b: 60 },
    ])
  })

  it('extracts one stable palette across all animation frames', () => {
    const animation = {
      frames: [
        { w: 1, h: 1, pixels: [255, 180, 0] },
        { w: 1, h: 1, pixels: [0, 20, 255] },
      ],
      durations: [100, 300],
    }
    expect(dominantImageColors(animation, 2)).toEqual([
      { r: 0, g: 20, b: 255 },
      { r: 255, g: 180, b: 0 },
    ])
  })

  it('returns a black palette for missing or invalid image data', () => {
    expect(imagePaletteStops16(null)).toEqual(
      Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0 })),
    )
  })
})
