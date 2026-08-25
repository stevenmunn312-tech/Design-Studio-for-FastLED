import { describe, it, expect } from 'vitest'
import {
  OLED_CONTROLLERS,
  OLED_PAGE_HEIGHT,
  oledControllerFor,
  createOledSurface,
  clearOledSurface,
  setPixel,
  getPixel,
  drawOledText,
  drawHLine,
  drawVLine,
  drawRect,
  fillRect,
  drawProgressBar,
  drawIndicator,
  oledTextWidth,
  oledTextCapacity,
  fitOledText,
  oledSurfaceRows,
} from '../oledSurface'

const sh1106 = OLED_CONTROLLERS.SH1106
const ssd1306 = OLED_CONTROLLERS.SSD1306

function litCount(surface: ReturnType<typeof createOledSurface>): number {
  let n = 0
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) if (getPixel(surface, x, y)) n++
  }
  return n
}

describe('controllers', () => {
  // Driving an SH1106 as an SSD1306 shifts the image two pixels and wraps the
  // remainder down the edge. It looks like a wiring fault, so the offset lives
  // in the controller descriptor rather than being fixed up per device.
  it('gives the SH1106 its column offset and the SSD1306 none', () => {
    expect(sh1106.columnOffset).toBe(2)
    expect(ssd1306.columnOffset).toBe(0)
  })

  it('matches a controller family rather than an exact package marking', () => {
    expect(oledControllerFor('SH1106G')?.id).toBe('SH1106')
    expect(oledControllerFor('SH1106')?.id).toBe('SH1106')
    expect(oledControllerFor('SSD1306')?.id).toBe('SSD1306')
    expect(oledControllerFor('ST7789')).toBeNull()
    expect(oledControllerFor(undefined)).toBeNull()
  })

  it('shares a panel size across both controllers', () => {
    expect(sh1106.width).toBe(ssd1306.width)
    expect(sh1106.height).toBe(ssd1306.height)
  })
})

describe('surface', () => {
  it('is page-major, one byte per eight vertical pixels', () => {
    const surface = createOledSurface(sh1106)
    expect(surface.pages).toBe(sh1106.height / OLED_PAGE_HEIGHT)
    expect(surface.data.length).toBe(sh1106.width * surface.pages)
  })

  it('packs a pixel into the bit the controller expects', () => {
    const surface = createOledSurface(sh1106)
    setPixel(surface, 0, 0)
    expect(surface.data[0]).toBe(0x01)
    clearOledSurface(surface)
    setPixel(surface, 0, 7)
    expect(surface.data[0]).toBe(0x80)
    clearOledSurface(surface)
    // Row 8 is the first row of page 1, not bit 8 of page 0.
    setPixel(surface, 0, 8)
    expect(surface.data[0]).toBe(0x00)
    expect(surface.data[surface.width]).toBe(0x01)
  })

  it('round-trips a pixel', () => {
    const surface = createOledSurface(sh1106)
    setPixel(surface, 40, 30)
    expect(getPixel(surface, 40, 30)).toBe(true)
    setPixel(surface, 40, 30, false)
    expect(getPixel(surface, 40, 30)).toBe(false)
  })

  it('ignores anything drawn off the panel rather than wrapping it', () => {
    const surface = createOledSurface(sh1106)
    setPixel(surface, -1, 0)
    setPixel(surface, surface.width, 0)
    setPixel(surface, 0, -1)
    setPixel(surface, 0, surface.height)
    expect(litCount(surface)).toBe(0)
    expect(getPixel(surface, -1, 0)).toBe(false)
  })

  it('clears completely', () => {
    const surface = createOledSurface(sh1106)
    fillRect(surface, 0, 0, surface.width, surface.height)
    expect(litCount(surface)).toBe(surface.width * surface.height)
    clearOledSurface(surface)
    expect(litCount(surface)).toBe(0)
  })
})

describe('text', () => {
  it('measures with the shared font metrics', () => {
    // 3px glyphs with 1px spacing: n*4 - 1.
    expect(oledTextWidth('A')).toBe(3)
    expect(oledTextWidth('AB')).toBe(7)
    expect(oledTextWidth('')).toBe(0)
  })

  it('reports how many characters fit a width', () => {
    expect(oledTextCapacity(3)).toBe(1)
    expect(oledTextCapacity(7)).toBe(2)
    expect(oledTextCapacity(2)).toBe(0)
    // A 128px row at 4px per character.
    expect(oledTextCapacity(124)).toBe(31)
  })

  it('draws text and reports the width it used', () => {
    const surface = createOledSurface(sh1106)
    const width = drawOledText(surface, 0, 0, 'A')
    expect(width).toBe(3)
    expect(litCount(surface)).toBeGreaterThan(0)
  })

  it('draws nothing for an empty string', () => {
    const surface = createOledSurface(sh1106)
    expect(drawOledText(surface, 0, 0, '')).toBe(0)
    expect(litCount(surface)).toBe(0)
  })

  // Truncating in characters against real metrics keeps the marker visible; a
  // pixel clip would eat the ellipsis first.
  it('fits long text with a visible ellipsis at a glyph boundary', () => {
    const fitted = fitOledText('ABCDEFGHIJKLMNOP', 40)
    expect(fitted.endsWith('...')).toBe(true)
    expect(oledTextWidth(fitted)).toBeLessThanOrEqual(40)
  })

  it('leaves text that already fits alone', () => {
    expect(fitOledText('BPM', 124)).toBe('BPM')
  })

  it('folds to the glyphs the shared font can draw', () => {
    // Lower case folds up; '#' has no glyph and becomes the fallback.
    expect(fitOledText('ab#', 124)).toBe('AB?')
  })

  it('returns nothing when the field cannot hold one glyph', () => {
    expect(fitOledText('ABC', 2)).toBe('')
  })

  // Text drawn at the far corner must clip, not wrap: a wrapped glyph would
  // appear at the opposite edge as if the panel were corrupt.
  it('clips text at the panel edge rather than wrapping it', () => {
    const surface = createOledSurface(sh1106)
    drawOledText(surface, 120, 60, 'ABCDEFGHIJ')
    const rows = oledSurfaceRows(surface)
    const blank = '.'.repeat(surface.width)
    // Nothing above the draw point, and nothing back at the left edge.
    for (let y = 0; y < 60; y++) expect(rows[y], `row ${y}`).toBe(blank)
    for (let y = 60; y < surface.height; y++) {
      expect(rows[y].slice(0, 100), `row ${y} left`).toBe('.'.repeat(100))
    }
  })
})

describe('primitives', () => {
  it('draws lines of the requested length', () => {
    const surface = createOledSurface(sh1106)
    drawHLine(surface, 2, 3, 5)
    expect(litCount(surface)).toBe(5)
    clearOledSurface(surface)
    drawVLine(surface, 2, 3, 5)
    expect(litCount(surface)).toBe(5)
  })

  it('draws a rectangle outline, not a fill', () => {
    const surface = createOledSurface(sh1106)
    drawRect(surface, 0, 0, 4, 4)
    // Perimeter of a 4x4 box is 12 pixels.
    expect(litCount(surface)).toBe(12)
    expect(getPixel(surface, 1, 1)).toBe(false)
  })

  it('fills a rectangle', () => {
    const surface = createOledSurface(sh1106)
    fillRect(surface, 0, 0, 4, 4)
    expect(litCount(surface)).toBe(16)
  })
})

describe('progress bar', () => {
  const bar = (value: number) => {
    const surface = createOledSurface(sh1106)
    drawProgressBar(surface, 0, 0, 10, 7, value)
    return surface
  }

  it('draws its outline even at zero', () => {
    expect(litCount(bar(0))).toBe((10 * 2) + ((7 - 2) * 2))
  })

  // A bar that overwrites its own border does not read as full, and one that
  // spills past it corrupts whatever is drawn alongside.
  it('fills inside the outline and no further', () => {
    const full = bar(1)
    expect(getPixel(full, 1, 1)).toBe(true)
    expect(getPixel(full, 8, 5)).toBe(true)
    expect(getPixel(full, 10, 3)).toBe(false)
  })

  it('clamps out-of-range and non-finite values', () => {
    expect(litCount(bar(5))).toBe(litCount(bar(1)))
    expect(litCount(bar(-1))).toBe(litCount(bar(0)))
    expect(litCount(bar(Number.NaN))).toBe(litCount(bar(0)))
  })

  it('refuses a bar too small to have an inside', () => {
    const surface = createOledSurface(sh1106)
    drawProgressBar(surface, 0, 0, 2, 2, 1)
    expect(litCount(surface)).toBe(0)
  })
})

describe('indicator', () => {
  it('fills when on and outlines when off', () => {
    const on = createOledSurface(sh1106)
    drawIndicator(on, 0, 0, true, 5)
    const off = createOledSurface(sh1106)
    drawIndicator(off, 0, 0, false, 5)
    expect(litCount(on)).toBe(25)
    expect(litCount(off)).toBe(16)
  })
})

describe('oledSurfaceRows', () => {
  it('renders one string per pixel row', () => {
    const surface = createOledSurface(sh1106)
    setPixel(surface, 1, 0)
    const rows = oledSurfaceRows(surface)
    expect(rows).toHaveLength(surface.height)
    expect(rows[0].startsWith('.#')).toBe(true)
    expect(rows[1]).toBe('.'.repeat(surface.width))
  })
})
