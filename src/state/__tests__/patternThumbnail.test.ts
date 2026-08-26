import { describe, it, expect } from 'vitest'
import {
  thumbnailFromFrame, thumbnailPixel, blankThumbnail, luminance, ditherThreshold,
  thumbnailFlashCost, thumbnailBudgetIssue,
  THUMBNAIL_W, THUMBNAIL_H, THUMBNAIL_BYTES, THUMBNAIL_SUPERSAMPLE,
  MAX_THUMBNAILS, MAX_THUMBNAIL_FLASH_BYTES,
} from '../patternThumbnail'
import { OLED_PAGE_HEIGHT } from '../oledSurface'

const SS = THUMBNAIL_SUPERSAMPLE

/** A supersampled frame of one flat colour. */
function solid(r: number, g: number, b: number) {
  return Array.from({ length: THUMBNAIL_H * SS }, () =>
    Array.from({ length: THUMBNAIL_W * SS }, () => ({ r, g, b })))
}

/** A supersampled frame built from a per-thumbnail-pixel luminance function. */
function fromLuma(at: (x: number, y: number) => number) {
  return Array.from({ length: THUMBNAIL_H * SS }, (_, sy) =>
    Array.from({ length: THUMBNAIL_W * SS }, (_, sx) => {
      const v = Math.round(Math.max(0, Math.min(1, at(Math.floor(sx / SS), Math.floor(sy / SS)))) * 255)
      return { r: v, g: v, b: v }
    }))
}

const litCount = (t: ReturnType<typeof blankThumbnail>) => {
  let n = 0
  for (let y = 0; y < THUMBNAIL_H; y++) for (let x = 0; x < THUMBNAIL_W; x++) if (thumbnailPixel(t, x, y)) n++
  return n
}

describe('packing', () => {
  it('is exactly four OLED pages, so a blit never straddles one', () => {
    expect(THUMBNAIL_H % OLED_PAGE_HEIGHT).toBe(0)
    expect(THUMBNAIL_H / OLED_PAGE_HEIGHT).toBe(4)
    expect(THUMBNAIL_BYTES).toBe((THUMBNAIL_W * THUMBNAIL_H) / 8)
  })

  it('starts dark and sized', () => {
    const blank = blankThumbnail()
    expect(blank.data).toHaveLength(THUMBNAIL_BYTES)
    expect(litCount(blank)).toBe(0)
  })

  // Page-major, bit 0 at top — the same layout as OledSurface, so the driver
  // ships the bytes verbatim instead of transposing them on a microcontroller.
  it('packs page-major with bit 0 at the top', () => {
    const t = thumbnailFromFrame(solid(255, 255, 255))
    expect(t.data[0] & 1).toBe(1)
    for (let y = 0; y < THUMBNAIL_H; y++) {
      const index = Math.floor(y / OLED_PAGE_HEIGHT) * THUMBNAIL_W
      expect((t.data[index] >> (y % OLED_PAGE_HEIGHT)) & 1, `row ${y}`).toBe(1)
    }
  })
})

describe('luminance', () => {
  // Perceptual weights, not a flat average: a flat one makes pure blue as
  // bright as pure green, and a blue pattern dithers to a solid block.
  it('weighs the channels the way an eye does', () => {
    expect(luminance({ r: 0, g: 255, b: 0 })).toBeGreaterThan(luminance({ r: 255, g: 0, b: 0 }))
    expect(luminance({ r: 255, g: 0, b: 0 })).toBeGreaterThan(luminance({ r: 0, g: 0, b: 255 }))
  })

  it('bounds itself to 0-1', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0)
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1)
    expect(luminance({ r: 999, g: 999, b: 999 })).toBe(1)
    expect(luminance({ r: -50, g: -50, b: -50 })).toBe(0)
  })
})

describe('dithering', () => {
  it('lights everything for white and nothing for black', () => {
    expect(litCount(thumbnailFromFrame(solid(255, 255, 255)))).toBe(THUMBNAIL_W * THUMBNAIL_H)
    expect(litCount(thumbnailFromFrame(solid(0, 0, 0)))).toBe(0)
  })

  // The point of dithering: a mid grey is neither black nor white but roughly
  // half the pixels, so a dim pattern reads as dim rather than as absent.
  it('turns a flat mid grey into about half a screen', () => {
    const lit = litCount(thumbnailFromFrame(solid(128, 128, 128)))
    const total = THUMBNAIL_W * THUMBNAIL_H
    expect(lit).toBeGreaterThan(total * 0.3)
    expect(lit).toBeLessThan(total * 0.7)
  })

  it('gets brighter monotonically', () => {
    const counts = [0, 0.25, 0.5, 0.75, 1]
      .map((v) => litCount(thumbnailFromFrame(fromLuma(() => v))))
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `step ${i}`).toBeGreaterThanOrEqual(counts[i - 1])
    }
    expect(counts[0]).toBe(0)
    expect(counts[counts.length - 1]).toBe(THUMBNAIL_W * THUMBNAIL_H)
  })

  // Ordered, not error-diffused: the threshold depends only on position, so
  // the same frame bakes the same bytes every time. That is what lets the
  // preview claim to show what shipped.
  it('is reproducible', () => {
    const frame = fromLuma((x, y) => ((x * 7 + y * 3) % 16) / 15)
    expect([...thumbnailFromFrame(frame).data]).toEqual([...thumbnailFromFrame(frame).data])
  })

  it('threshold depends only on position, and stays inside 0-1', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const t = ditherThreshold(x, y)
        expect(t).toBeGreaterThan(0)
        expect(t).toBeLessThan(1)
        expect(ditherThreshold(x + 4, y + 4)).toBe(t)   // 4x4 tile
      }
    }
  })

  it('handles negative coordinates without falling off the matrix', () => {
    expect(ditherThreshold(-1, -1)).toBe(ditherThreshold(3, 3))
  })
})

describe('downsampling', () => {
  // A pattern rendered straight at 32x32 loses thin features; the 2x render is
  // what gives the dither something between black and white to work with.
  it('averages the supersampled block rather than point-sampling it', () => {
    // Half of every 2x2 block white, half black: a point sample lands on one or
    // the other, an average lands at mid grey.
    const frame = Array.from({ length: THUMBNAIL_H * SS }, () =>
      Array.from({ length: THUMBNAIL_W * SS }, (_, sx) => {
        const on = (sx % SS) === 0
        return { r: on ? 255 : 0, g: on ? 255 : 0, b: on ? 255 : 0 }
      }))
    const lit = litCount(thumbnailFromFrame(frame))
    const total = THUMBNAIL_W * THUMBNAIL_H
    expect(lit).toBeGreaterThan(total * 0.3)
    expect(lit).toBeLessThan(total * 0.7)
  })

  it('leaves the rest dark rather than throwing on an undersized frame', () => {
    const small = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ r: 255, g: 255, b: 255 })))
    const t = thumbnailFromFrame(small)
    expect(t.data).toHaveLength(THUMBNAIL_BYTES)
    expect(litCount(t)).toBeGreaterThan(0)
    expect(litCount(t)).toBeLessThan(THUMBNAIL_W * THUMBNAIL_H)
  })

  it('reads an empty frame as dark', () => {
    expect(litCount(thumbnailFromFrame([]))).toBe(0)
  })
})

describe('the flash budget', () => {
  it('costs one thumbnail per pattern', () => {
    expect(thumbnailFlashCost(0)).toBe(0)
    expect(thumbnailFlashCost(10)).toBe(10 * THUMBNAIL_BYTES)
    expect(thumbnailFlashCost(MAX_THUMBNAILS)).toBe(MAX_THUMBNAIL_FLASH_BYTES)
  })

  it('says nothing while the collection fits', () => {
    expect(thumbnailBudgetIssue(0)).toBeNull()
    expect(thumbnailBudgetIssue(MAX_THUMBNAILS)).toBeNull()
  })

  // Flash runs out during someone else's build, long after the collection was
  // assembled, so the refusal has to carry the numbers and a way out.
  it('explains an over-budget collection in bytes, with a way out', () => {
    const issue = thumbnailBudgetIssue(MAX_THUMBNAILS + 1)
    expect(issue).not.toBeNull()
    expect(issue).toContain(String(MAX_THUMBNAILS))
    expect(issue).toContain(String(thumbnailFlashCost(MAX_THUMBNAILS + 1)))
    expect(issue).toMatch(/trim the collection/i)
  })

  it('treats nonsense as nothing rather than throwing', () => {
    expect(thumbnailFlashCost(Number.NaN)).toBe(0)
    expect(thumbnailFlashCost(-5)).toBe(0)
    expect(thumbnailBudgetIssue(Number.NaN)).toBeNull()
  })
})
