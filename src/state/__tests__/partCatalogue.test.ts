import { describe, expect, it } from 'vitest'
import {
  PART_CATALOGUE,
  catalogueDisplays,
  catalogueRings,
  displayResolution,
  isDisplayPart,
  partById,
  partDimensionsMm,
  partRenderSrc,
  ringDiameterMm,
} from '../partCatalogue'

describe('part catalogue', () => {
  it('carries the modelled parts', () => {
    expect(Object.keys(PART_CATALOGUE).length).toBeGreaterThanOrEqual(16)
    expect(partById('max98357a-i2s-amplifier')).toBeDefined()
    expect(partById('inmp441-i2s-microphone')).toBeDefined()
  })

  it('states datasheet-verified dimensions, not remembered ones', () => {
    // The two the app had guessed wrong. 0.70 x 1.00 inch for the amplifier,
    // per Adafruit's fabrication print; the app had said 17.8 x 13.2 and drew
    // the board at about half its real length.
    expect(partById('max98357a-i2s-amplifier')!.dimensionsMm).toEqual({ width: 17.78, height: 25.4 })
    expect(partById('inmp441-i2s-microphone')!.dimensionsMm).toEqual({ width: 15, height: 10.5 })
  })

  // Not an exhaustive census: the catalogue grows as assets are modelled, and a
  // list that churns on every one stops being read. These are the driver
  // contracts the display slices are built against.
  it('carries each modelled display with its driver contract', () => {
    const displays = Object.fromEntries(catalogueDisplays().map((entry) => [entry.partId, entry.display!]))
    expect(displays['tm1637-4digit-display']).toMatchObject({ controller: 'TM1637', resolutionPx: [4, 7] })
    expect(displays['max7219-8digit-7segment']).toMatchObject({ controller: 'MAX7219', resolutionPx: [8, 7] })
    expect(displays['ssd1306-oled-128x64']).toMatchObject({ controller: 'SSD1306', resolutionPx: [128, 64] })
    expect(displays['sh1106-oled-128x64']).toMatchObject({ controller: 'SH1106G', resolutionPx: [128, 64] })
    expect(displays['st7789-tft-240x240']).toMatchObject({ controller: 'ST7789', resolutionPx: [240, 240] })
  })

  // The two 1-bit OLEDs share a resolution and a layout contract but not a
  // controller, and the 2-column offset between them is the classic way one
  // gets driven as the other.
  it('tells the two OLED controllers apart at the same resolution', () => {
    const ssd = partById('ssd1306-oled-128x64')!.display!
    const sh = partById('sh1106-oled-128x64')!.display!
    expect(ssd.resolutionPx).toEqual(sh.resolutionPx)
    expect(ssd.controller).not.toBe(sh.controller)
  })

  // Every display declares a complete contract, whatever else lands.
  it('gives every catalogued display a usable spec', () => {
    for (const entry of catalogueDisplays()) {
      const spec = entry.display!
      expect(spec.controller, entry.partId).toBeTruthy()
      expect(spec.interface, entry.partId).toBeTruthy()
      expect(spec.resolutionPx, entry.partId).toHaveLength(2)
      expect(spec.resolutionPx.every((n) => Number.isInteger(n) && n > 0), entry.partId).toBe(true)
    }
  })

  // A board that carries a screen is not a module you attach to a board, so it
  // must not arrive through the part catalogue at all.
  it('keeps the integrated CYD board out of the part catalogue', () => {
    expect(partById('esp32-2432s028r')).toBeUndefined()
  })

  // The resolution every fixed layout is computed against. Typing it into the
  // app is how it comes to disagree with the panel on the bench.
  it('reads panel geometry from the asset rather than the app', () => {
    expect(displayResolution('ssd1306-oled-128x64')).toEqual({ width: 128, height: 64 })
    expect(displayResolution('ili9341-xpt2046-touch-320x240')).toEqual({ width: 320, height: 240 })
    expect(displayResolution('max98357a-i2s-amplifier')).toBeNull()
    expect(displayResolution('not-a-real-part')).toBeNull()
  })

  it('names the touch controller only where one is fitted', () => {
    expect(partById('ili9341-xpt2046-touch-320x240')!.display!.touchController).toBe('XPT2046')
    expect(partById('st7789-tft-240x240')!.display!.touchController).toBeNull()
  })

  // The category is a label; the spec is the contract. They must agree, or a
  // part is filed as a display the driver layer cannot drive, or driven as one
  // the menu never offers.
  it('files every display under the display category and vice versa', () => {
    for (const entry of Object.values(PART_CATALOGUE)) {
      expect(entry.display !== undefined, entry.partId).toBe(entry.category === 'display')
    }
    expect(catalogueDisplays().every((entry) => entry.category === 'display')).toBe(true)
  })

  // Derived from the asset declaring a spec, not from a category string, so the
  // two cannot drift apart.
  it('tells a display from every other part', () => {
    expect(isDisplayPart('ssd1306-oled-128x64')).toBe(true)
    expect(isDisplayPart('max98357a-i2s-amplifier')).toBe(false)
    expect(isDisplayPart('ws2812b-ring-24')).toBe(false)
    expect(isDisplayPart('not-a-real-part')).toBe(false)
  })

  it('states datasheet-verified display dimensions', () => {
    // Adafruit 326 (0.96in OLED) and DFRobot DFR0665 (2.8in touch TFT).
    expect(partById('ssd1306-oled-128x64')!.dimensionsMm).toEqual({ width: 29.2, height: 26.7 })
    expect(partById('ili9341-xpt2046-touch-320x240')!.dimensionsMm).toEqual({ width: 80, height: 50 })
  })

  it('falls back for a part nobody has modelled yet', () => {
    const fallback = { width: 5, height: 5 }
    expect(partDimensionsMm('not-a-real-part', fallback)).toBe(fallback)
    expect(partRenderSrc('not-a-real-part')).toBeNull()
  })

  it('serves renders from the site root', () => {
    expect(partRenderSrc('max98357a-i2s-amplifier')).toBe('/parts/max98357a-i2s-amplifier.webp')
  })

  it('records the LED pitch each output was modelled at', () => {
    expect(partById('hub75-panel-64x64-p4')!.ledLayout).toMatchObject({ form: 'hub75', pitchMm: 4 })
    expect(partById('ws2812b-matrix-16x16')!.ledLayout).toMatchObject({ form: 'matrix', pitchMm: 10 })
  })
})

describe('ringDiameterMm', () => {
  it('knows the rings that were actually modelled', () => {
    expect(catalogueRings().map((ring) => ring.count)).toEqual([8, 12, 16, 24, 60])
    expect(ringDiameterMm(8)).toBe(32.2)
    expect(ringDiameterMm(12)).toBe(37)
    expect(ringDiameterMm(16)).toBe(44.5)
    expect(ringDiameterMm(24)).toBe(65.5)
    expect(ringDiameterMm(60)).toBe(158)
  })

  it('does not reproduce the old formula, which was wrong at both ends', () => {
    // `N x 10 / pi` predicted 25.5 mm at 8 LEDs and 191 mm at 60.
    expect(ringDiameterMm(8)).toBeGreaterThan((8 * 10) / Math.PI)
    expect(ringDiameterMm(60)).toBeLessThan((60 * 10) / Math.PI)
  })

  it('interpolates between neighbouring counts', () => {
    // 20 sits halfway between the 16 (44.5) and 24 (65.5) rings.
    expect(ringDiameterMm(20)).toBeCloseTo((44.5 + 65.5) / 2, 5)
  })

  it('holds the nearest ring pitch outside the modelled range', () => {
    // Past 60 the hub stops mattering and only circumference grows.
    expect(ringDiameterMm(120)).toBeCloseTo(316, 5)
    expect(ringDiameterMm(4)).toBeCloseTo(16.1, 5)
  })

  it('is monotonic — more LEDs is never a smaller ring', () => {
    let previous = 0
    for (let count = 1; count <= 120; count++) {
      const diameter = ringDiameterMm(count)
      expect(diameter).toBeGreaterThanOrEqual(previous)
      previous = diameter
    }
  })
})
