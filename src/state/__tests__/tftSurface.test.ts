import { describe, it, expect } from 'vitest'
import {
  TFT_CONTROLLERS,
  TFT_ROTATIONS,
  TFT_BYTES_PER_PIXEL,
  asTftRotation,
  tftControllerFor,
  tftMadctl,
  tftRotatedSize,
  tftWindowOrigin,
  rgb565,
  rgb565Components,
  createTftSurface,
  createTftSurfaceFor,
  clearTftSurface,
  clearTftDirty,
  markTftDirty,
  tftDirtyPixels,
  setTftPixel,
  getTftPixel,
  fillTftRect,
  drawTftRect,
  drawTftText,
  drawTftField,
  drawTftBar,
  drawTftArtwork,
  tftBarFill,
  tftTextWidth,
  tftTextHeight,
  tftTextCapacity,
  tftFieldTextX,
  fitTftText,
  tftSurfaceBytes,
  tftSurfaceRows,
  type TftField,
  type TftRotation,
  type TftSurface,
} from '../tftSurface'
import { FONT_H, FONT_W } from '../font'

const st7789 = TFT_CONTROLLERS.ST7789
const st7789v = TFT_CONTROLLERS.ST7789V

const WHITE = rgb565(255, 255, 255)
const RED = rgb565(255, 0, 0)

function litCount(surface: TftSurface, background = 0): number {
  let n = 0
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) if (getTftPixel(surface, x, y) !== background) n++
  }
  return n
}

describe('controllers', () => {
  // Recording the 2.4-inch module as 320x240 would bake one orientation into
  // the catalogue and leave the other unrepresentable, so both descriptors
  // state native portrait and rotation does the rest.
  it('states both panels in native portrait', () => {
    expect([st7789.width, st7789.height]).toEqual([240, 240])
    expect([st7789v.width, st7789v.height]).toEqual([240, 320])
  })

  // The 1.3-inch panel is shorter than the frame memory behind it. That gap is
  // the whole reason tftWindowOrigin exists.
  it('records frame memory separately from the glass', () => {
    expect([st7789.ramWidth, st7789.ramHeight]).toEqual([240, 320])
    expect(st7789.height).toBeLessThan(st7789.ramHeight)
    expect(st7789v.height).toBe(st7789v.ramHeight)
  })

  // ST7789V starts with ST7789. A shortest-match lookup hands the 240x320
  // module the 240x240 descriptor and every layout is drawn eighty rows short.
  it('matches the longest controller name, not the first prefix', () => {
    expect(tftControllerFor('ST7789V')?.id).toBe('ST7789V')
    expect(tftControllerFor('ST7789')?.id).toBe('ST7789')
    expect(tftControllerFor('st7789v')?.id).toBe('ST7789V')
  })

  it('does not answer for a controller it has no descriptor for', () => {
    expect(tftControllerFor('ILI9341')).toBeNull()
    expect(tftControllerFor('SH1106')).toBeNull()
    expect(tftControllerFor(undefined)).toBeNull()
  })

  // Both IPS modules are wired normally-black: without INVON the panel renders
  // a photographic negative, which reads as a broken driver rather than a
  // missing command.
  it('marks both panels as needing inversion', () => {
    expect(st7789.invert).toBe(true)
    expect(st7789v.invert).toBe(true)
  })
})

describe('rotation', () => {
  it('offers four mountings and falls back to none', () => {
    expect([...TFT_ROTATIONS]).toEqual(['0', '90', '180', '270'])
    expect(asTftRotation('90')).toBe('90')
    expect(asTftRotation('45')).toBe('0')
    expect(asTftRotation(undefined)).toBe('0')
  })

  it('exchanges the axes at 90 and 270', () => {
    expect(tftRotatedSize(st7789v, '0')).toEqual({ width: 240, height: 320 })
    expect(tftRotatedSize(st7789v, '90')).toEqual({ width: 320, height: 240 })
    expect(tftRotatedSize(st7789v, '180')).toEqual({ width: 240, height: 320 })
    expect(tftRotatedSize(st7789v, '270')).toEqual({ width: 320, height: 240 })
  })

  it('leaves a square panel square whichever way it is bolted', () => {
    for (const rotation of TFT_ROTATIONS) {
      expect(tftRotatedSize(st7789, rotation)).toEqual({ width: 240, height: 240 })
    }
  })

  it('sets the MADCTL mirror and exchange bits per rotation', () => {
    expect(tftMadctl(st7789, '0')).toBe(0x00)
    expect(tftMadctl(st7789, '90')).toBe(0x60)
    expect(tftMadctl(st7789, '180')).toBe(0xc0)
    expect(tftMadctl(st7789, '270')).toBe(0xa0)
  })

  it('adds the colour-order bit only for a BGR-wired panel', () => {
    const bgr = { ...st7789, colorOrder: 'BGR' as const }
    expect(tftMadctl(bgr, '0')).toBe(0x08)
    expect(tftMadctl(st7789, '0') & 0x08).toBe(0)
  })
})

describe('window origin', () => {
  // The values every ST7789 library carries as a hand-written table. Deriving
  // them from one sentence — mirroring an axis renumbers the memory behind the
  // glass — is what stops the next module getting a fifth case wrong.
  it('derives the known 240x240 offsets rather than listing them', () => {
    expect(tftWindowOrigin(st7789, '0')).toEqual({ col: 0, row: 0 })
    expect(tftWindowOrigin(st7789, '90')).toEqual({ col: 0, row: 0 })
    expect(tftWindowOrigin(st7789, '180')).toEqual({ col: 0, row: 80 })
    expect(tftWindowOrigin(st7789, '270')).toEqual({ col: 80, row: 0 })
  })

  it('needs no offset when the glass fills the frame memory', () => {
    for (const rotation of TFT_ROTATIONS) {
      expect(tftWindowOrigin(st7789v, rotation)).toEqual({ col: 0, row: 0 })
    }
  })

  // Whatever the rotation, the addressed window has to stay inside the RAM it
  // is addressing — the failure this whole function exists to prevent.
  it('keeps the window inside controller memory at every rotation', () => {
    for (const controller of [st7789, st7789v]) {
      for (const rotation of TFT_ROTATIONS as readonly TftRotation[]) {
        const origin = tftWindowOrigin(controller, rotation)
        const size = tftRotatedSize(controller, rotation)
        const ramW = rotation === '90' || rotation === '270' ? controller.ramHeight : controller.ramWidth
        const ramH = rotation === '90' || rotation === '270' ? controller.ramWidth : controller.ramHeight
        expect(origin.col + size.width).toBeLessThanOrEqual(ramW)
        expect(origin.row + size.height).toBeLessThanOrEqual(ramH)
      }
    }
  })
})

describe('colour', () => {
  it('packs 5-6-5 with green in the middle', () => {
    expect(rgb565(0, 0, 0)).toBe(0x0000)
    expect(rgb565(255, 255, 255)).toBe(0xffff)
    expect(rgb565(255, 0, 0)).toBe(0xf800)
    expect(rgb565(0, 255, 0)).toBe(0x07e0)
    expect(rgb565(0, 0, 255)).toBe(0x001f)
  })

  it('clamps rather than wrapping an out-of-range channel', () => {
    expect(rgb565(999, -20, 0)).toBe(rgb565(255, 0, 0))
  })

  // Shifting the low bits back in rather than padding with zeros, so a
  // round-tripped white stays white instead of drifting to near-white.
  it('round-trips full scale exactly', () => {
    expect(rgb565Components(rgb565(255, 255, 255))).toEqual({ r: 255, g: 255, b: 255 })
    expect(rgb565Components(rgb565(0, 0, 0))).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('surface', () => {
  it('is row-major and sized to the mounted panel', () => {
    const surface = createTftSurfaceFor(st7789v, '90')
    expect([surface.width, surface.height]).toEqual([320, 240])
    expect(surface.data.length).toBe(320 * 240)
  })

  it('reads back what it wrote and ignores anything off the panel', () => {
    const surface = createTftSurface(16, 8)
    setTftPixel(surface, 3, 4, RED)
    expect(getTftPixel(surface, 3, 4)).toBe(RED)
    setTftPixel(surface, -1, 0, WHITE)
    setTftPixel(surface, 16, 0, WHITE)
    setTftPixel(surface, 0, 8, WHITE)
    expect(litCount(surface)).toBe(1)
  })

  it('clips a fill to the panel instead of wrapping into the next row', () => {
    const surface = createTftSurface(8, 4)
    fillTftRect(surface, 6, 0, 8, 1, WHITE)
    expect(litCount(surface)).toBe(2)
    expect(getTftPixel(surface, 0, 1)).toBe(0)
  })

  it('draws an outline without filling it', () => {
    const surface = createTftSurface(10, 10)
    drawTftRect(surface, 0, 0, 5, 5, WHITE)
    expect(litCount(surface)).toBe(16)
    expect(getTftPixel(surface, 2, 2)).toBe(0)
  })
})

describe('dirty tracking', () => {
  it('starts clean and reports nothing to ship', () => {
    const surface = createTftSurface(32, 32)
    expect(surface.dirty).toBeNull()
    expect(tftDirtyPixels(surface)).toBe(0)
  })

  it('covers exactly what was written', () => {
    const surface = createTftSurface(32, 32)
    fillTftRect(surface, 4, 6, 10, 3, WHITE)
    expect(surface.dirty).toEqual({ x: 4, y: 6, w: 10, h: 3 })
    expect(tftDirtyPixels(surface)).toBe(30)
  })

  // A single box over-sends when two changes are far apart and can never
  // under-send, which is the trade a fixed layout is happy to make.
  it('unions two writes into their bounding box', () => {
    const surface = createTftSurface(32, 32)
    fillTftRect(surface, 0, 0, 2, 2, WHITE)
    fillTftRect(surface, 20, 25, 4, 4, WHITE)
    expect(surface.dirty).toEqual({ x: 0, y: 0, w: 24, h: 29 })
  })

  it('clips the box to the panel', () => {
    const surface = createTftSurface(16, 16)
    markTftDirty(surface, -8, -8, 40, 40)
    expect(surface.dirty).toEqual({ x: 0, y: 0, w: 16, h: 16 })
  })

  it('ignores a mark with nothing inside the panel', () => {
    const surface = createTftSurface(16, 16)
    markTftDirty(surface, 20, 20, 4, 4)
    expect(surface.dirty).toBeNull()
  })

  it('forgets what was shipped', () => {
    const surface = createTftSurface(16, 16)
    fillTftRect(surface, 1, 1, 2, 2, WHITE)
    clearTftDirty(surface)
    expect(surface.dirty).toBeNull()
  })

  // A cleared surface really is dirty everywhere, which is why the firmware
  // paints its background once at setup rather than on a refresh deadline.
  it('marks the whole panel when it is cleared', () => {
    const surface = createTftSurface(24, 12)
    clearTftSurface(surface, RED)
    expect(surface.dirty).toEqual({ x: 0, y: 0, w: 24, h: 12 })
    expect(getTftPixel(surface, 23, 11)).toBe(RED)
  })
})

describe('text metrics', () => {
  it('scales the shared font by whole pixels', () => {
    expect(tftTextHeight(1)).toBe(FONT_H)
    expect(tftTextHeight(3)).toBe(FONT_H * 3)
    expect(tftTextWidth('A', 1)).toBe(FONT_W)
    expect(tftTextWidth('AB', 1)).toBe((FONT_W * 2) + 1)
    expect(tftTextWidth('AB', 2)).toBe(((FONT_W * 2) + 1) * 2)
  })

  it('reports no width for nothing to draw', () => {
    expect(tftTextWidth('', 4)).toBe(0)
  })

  it('counts the characters a width can hold at a scale', () => {
    // Trailing letter spacing is not part of the drawn width, so the last
    // glyph fits in one column less than the stride.
    expect(tftTextCapacity(FONT_W, 1)).toBe(1)
    expect(tftTextCapacity(FONT_W - 1, 1)).toBe(0)
    expect(tftTextCapacity((FONT_W * 2) + 1, 1)).toBe(2)
    expect(tftTextCapacity(FONT_W * 2, 2)).toBe(1)
  })

  it('marks a cut with an ellipsis at a glyph boundary', () => {
    const width = tftTextWidth('ABCDEFGH', 1)
    expect(fitTftText('ABCDEFGH', width, 1)).toBe('ABCDEFGH')
    expect(fitTftText('ABCDEFGHIJ', width, 1)).toBe('ABCDE...')
  })

  it('drops the marker rather than showing only dots in a tiny field', () => {
    expect(fitTftText('ABCDEF', tftTextWidth('AAA', 1), 1)).toBe('ABC')
    expect(fitTftText('ABCDEF', 0, 1)).toBe('')
  })

  // The same fold the OLED does, from the same shared helper, so a stranger's
  // ID3 tag looks the same on every panel in the build.
  it('folds a character the shared font cannot draw', () => {
    expect(fitTftText('AéB', 1000, 1)).toBe('A?B')
    expect(fitTftText('abc', 1000, 1)).toBe('ABC')
  })
})

describe('text drawing', () => {
  it('repeats each font pixel scale times on both axes', () => {
    const one = createTftSurface(40, 20)
    drawTftText(one, 0, 0, 'A', WHITE, 1)
    const four = createTftSurface(40, 20)
    drawTftText(four, 0, 0, 'A', WHITE, 2)
    expect(litCount(four)).toBe(litCount(one) * 4)
  })

  it('reports the drawn width without the trailing spacing', () => {
    const surface = createTftSurface(80, 20)
    expect(drawTftText(surface, 0, 0, 'AB', WHITE, 2)).toBe(tftTextWidth('AB', 2))
  })

  it('stays inside the panel when it starts off the edge', () => {
    const surface = createTftSurface(8, 8)
    drawTftText(surface, -20, -20, 'WWWW', WHITE, 2)
    expect(litCount(surface)).toBe(0)
  })
})

describe('fields', () => {
  const cell = (align: TftField['align']): TftField => ({ x: 10, y: 4, w: 60, h: 10, scale: 2, align })

  it('places text by its alignment inside the cell', () => {
    expect(tftFieldTextX(cell('left'), 'AB')).toBe(10)
    expect(tftFieldTextX(cell('right'), 'AB')).toBe(10 + 60 - tftTextWidth('AB', 2))
    expect(tftFieldTextX(cell('center'), 'AB')).toBe(10 + Math.floor((60 - tftTextWidth('AB', 2)) / 2))
  })

  // With no framebuffer on the device, a cell that did not erase itself would
  // leave the tail of a longer string behind and nothing would notice.
  it('erases its whole cell before drawing', () => {
    const surface = createTftSurface(100, 20)
    drawTftField(surface, cell('left'), 'LONGER TEXT', WHITE, 0)
    const before = litCount(surface)
    expect(before).toBeGreaterThan(0)
    drawTftField(surface, cell('left'), 'HI', WHITE, 0)
    expect(litCount(surface)).toBeLessThan(before)
    // Nothing of the first string survives past the second one's glyphs.
    expect(getTftPixel(surface, 10 + tftTextWidth('HI', 2) + 8, 8)).toBe(0)
  })

  it('paints the background even when there is nothing to say', () => {
    const surface = createTftSurface(100, 20)
    fillTftRect(surface, 0, 0, 100, 20, WHITE)
    drawTftField(surface, cell('left'), '', RED, RED)
    expect(getTftPixel(surface, 10, 4)).toBe(RED)
  })

  it('truncates to the cell rather than spilling past it', () => {
    const surface = createTftSurface(100, 20)
    drawTftField(surface, cell('left'), 'ABCDEFGHIJKLMNOP', WHITE, 0)
    for (let y = 0; y < 20; y++) expect(getTftPixel(surface, 70, y)).toBe(0)
  })
})

describe('bars', () => {
  it('measures the fill in the pixels it will actually paint', () => {
    expect(tftBarFill(102, 0)).toBe(0)
    expect(tftBarFill(102, 1)).toBe(100)
    expect(tftBarFill(102, 0.5)).toBe(50)
  })

  it('clamps a value past its ends and refuses a reading that is not one', () => {
    expect(tftBarFill(102, 2)).toBe(100)
    expect(tftBarFill(102, -1)).toBe(0)
    expect(tftBarFill(102, Number.NaN)).toBe(0)
  })

  it('has nothing to fill in a bar with no interior', () => {
    expect(tftBarFill(2, 1)).toBe(0)
  })

  // The unfilled interior is painted rather than left alone, so the bar erases
  // its own previous fill without the layout clearing around it.
  it('paints the track behind the part that is not filled', () => {
    const surface = createTftSurface(40, 10)
    const track = rgb565(20, 20, 20)
    drawTftBar(surface, { x: 0, y: 0, w: 22, h: 8 }, 1, WHITE, track, RED)
    drawTftBar(surface, { x: 0, y: 0, w: 22, h: 8 }, 0.25, WHITE, track, RED)
    expect(getTftPixel(surface, 2, 4)).toBe(WHITE)
    expect(getTftPixel(surface, 18, 4)).toBe(track)
  })
})

describe('artwork', () => {
  const art = (w: number, h: number, color: number) => {
    const bytes = new Uint8Array(w * h * TFT_BYTES_PER_PIXEL)
    for (let i = 0; i < w * h; i++) {
      bytes[i * 2] = (color >> 8) & 0xff
      bytes[(i * 2) + 1] = color & 0xff
    }
    return bytes
  }

  // Big-endian pairs, the order the wire and a PROGMEM table both want, so the
  // device blits finished bytes and needs no second implementation.
  it('reads baked bytes as big-endian pairs', () => {
    const surface = createTftSurface(8, 8)
    drawTftArtwork(surface, 1, 1, 2, 2, art(2, 2, RED))
    expect(getTftPixel(surface, 1, 1)).toBe(RED)
    expect(getTftPixel(surface, 2, 2)).toBe(RED)
    expect(getTftPixel(surface, 0, 0)).toBe(0)
  })

  it('draws as far as a short buffer reaches instead of throwing', () => {
    const surface = createTftSurface(8, 8)
    expect(() => drawTftArtwork(surface, 0, 0, 4, 4, art(2, 2, RED))).not.toThrow()
    expect(litCount(surface)).toBeGreaterThan(0)
  })
})

describe('shipping', () => {
  it('writes the panel out big-endian', () => {
    const surface = createTftSurface(2, 1)
    setTftPixel(surface, 0, 0, 0x1234)
    setTftPixel(surface, 1, 0, 0xabcd)
    expect([...tftSurfaceBytes(surface)]).toEqual([0x12, 0x34, 0xab, 0xcd])
  })

  it('ships only the dirty box when it is handed one', () => {
    const surface = createTftSurface(8, 8)
    clearTftSurface(surface, 0)
    clearTftDirty(surface)
    fillTftRect(surface, 2, 3, 2, 1, RED)
    const bytes = tftSurfaceBytes(surface, surface.dirty)
    expect(bytes.length).toBe(2 * 1 * TFT_BYTES_PER_PIXEL)
    expect([...bytes]).toEqual([RED >> 8, RED & 0xff, RED >> 8, RED & 0xff])
  })

  it('renders rows a failing layout can be read from', () => {
    const surface = createTftSurface(4, 2)
    setTftPixel(surface, 1, 0, WHITE)
    expect(tftSurfaceRows(surface)).toEqual(['.#..', '....'])
  })
})
