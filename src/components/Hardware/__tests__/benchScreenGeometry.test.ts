import { describe, expect, it } from 'vitest'
import { catalogueDisplays } from '../../../build/parts/partCatalogue'
import { segmentControllerFor } from '../../../state/displays/segmentDisplay'
import { TFT_ROTATIONS } from '../../../state/displays/tftSurface'
import {
  benchScreensFor,
  screenContentTransform,
  segmentDigitPlacements,
  tftScreenTurn,
  type ScreenRect,
} from '../benchScreenGeometry'

/**
 * Displays whose screen the render cannot show, and why. Every other catalogued
 * display has to carry measured screens, so a display imported later fails
 * here until `measure_display_screens.py` has measured it.
 */
const SCREEN_NOT_IN_RENDER: Record<string, string> = {
  'ili9341-xc4630-parallel-touch-320x240': 'a shield rendered from its component side; the LCD faces the board',
}

/** Apply `translate(a b) rotate(t) scale(sx sy) translate(c d)` to a point. */
function apply(transform: string, x: number, y: number): [number, number] {
  const n = transform.match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number)
  const [tx, ty, turn, sx, sy, ox, oy] = n
  const px = (x + ox) * sx
  const py = (y + oy) * sy
  const r = turn * Math.PI / 180
  return [
    tx + (px * Math.cos(r)) - (py * Math.sin(r)),
    ty + (px * Math.sin(r)) + (py * Math.cos(r)),
  ]
}

function close([x, y]: [number, number], [ex, ey]: [number, number]) {
  expect(x).toBeCloseTo(ex, 6)
  expect(y).toBeCloseTo(ey, 6)
}

describe('bench screen geometry', () => {
  it('has a measured screen inside the render for every display the render can show', () => {
    for (const entry of catalogueDisplays()) {
      const bench = benchScreensFor(entry.partId)
      if (SCREEN_NOT_IN_RENDER[entry.partId]) {
        expect(bench, entry.partId).toBeNull()
        continue
      }
      expect(bench, `${entry.partId} has no display.screensPx`).not.toBeNull()
      for (const screen of bench!.screens) {
        expect(screen.x).toBeGreaterThanOrEqual(0)
        expect(screen.y).toBeGreaterThanOrEqual(0)
        expect(screen.x + screen.width).toBeLessThanOrEqual(bench!.renderWidth)
        expect(screen.y + screen.height).toBeLessThanOrEqual(bench!.renderHeight)
      }
    }
  })

  it('measures a bitmap panel at its own pixel aspect, so its pixels come out square', () => {
    for (const entry of catalogueDisplays()) {
      const bench = benchScreensFor(entry.partId)
      if (!bench || entry.display!.controller.match(/^(TM1637|MAX7219)/)) continue
      expect(bench.screens, entry.partId).toHaveLength(1)
      const [w, h] = entry.display!.resolutionPx
      const glass = bench.screens[0]
      const aspect = glass.width / glass.height
      const native = w / h
      const fits = [native, 1 / native].some((candidate) => Math.abs(aspect - candidate) / candidate < 0.02)
      expect(fits, `${entry.partId}: ${aspect.toFixed(3)} against ${native.toFixed(3)}`).toBe(true)
    }
  })

  it('gives a segment module one window per digit package', () => {
    for (const entry of catalogueDisplays()) {
      const bench = benchScreensFor(entry.partId)
      if (!bench || !entry.display!.controller.match(/^(TM1637|MAX7219)/)) continue
      const digits = segmentControllerFor(entry.display!.controller).digits
      expect(digits % bench.screens.length, entry.partId).toBe(0)
    }
  })

  it('turns a TFT picture the opposite way to the mounting', () => {
    const portrait: ScreenRect = { x: 0, y: 0, width: 240, height: 320 }
    expect(TFT_ROTATIONS.map((rotation) => tftScreenTurn(rotation, portrait))).toEqual([0, 270, 180, 90])
    const landscape: ScreenRect = { x: 0, y: 0, width: 320, height: 240 }
    expect(tftScreenTurn('90', landscape)).toBe(0)
    expect(tftScreenTurn('0', landscape)).toBe(90)
  })

  it('maps the picture corners onto the glass corners for each turn', () => {
    const glass: ScreenRect = { x: 10, y: 20, width: 240, height: 320 }
    // Upright: top-left to top-left.
    close(apply(screenContentTransform(glass, 240, 320, 0), 0, 0), [10, 20])
    close(apply(screenContentTransform(glass, 240, 320, 0), 240, 320), [250, 340])
    // Half a turn: the picture's top-left lands bottom-right.
    close(apply(screenContentTransform(glass, 240, 320, 180), 0, 0), [250, 340])
    // A landscape picture a quarter turn clockwise: its top-left lands top-right.
    close(apply(screenContentTransform(glass, 320, 240, 90), 0, 0), [250, 20])
    close(apply(screenContentTransform(glass, 320, 240, 90), 320, 240), [10, 340])
    // And anticlockwise: top-left lands bottom-left.
    close(apply(screenContentTransform(glass, 320, 240, 270), 0, 0), [10, 340])
  })

  it('spreads eight digits over two four-digit packages, left to right', () => {
    const windows: ScreenRect[] = [
      { x: 0, y: 0, width: 400, height: 100 },
      { x: 500, y: 0, width: 400, height: 100 },
    ]
    const places = segmentDigitPlacements(windows, 8)
    expect(places).toHaveLength(8)
    places.forEach((place, index) => {
      const window = windows[index < 4 ? 0 : 1]
      expect(place.x).toBeGreaterThan(window.x)
      expect(place.x + (place.scale * 0.56)).toBeLessThan(window.x + window.width)
      expect(place.y).toBeGreaterThan(window.y)
      expect(place.y + place.scale).toBeLessThan(window.y + window.height)
      if (index > 0) expect(place.x).toBeGreaterThan(places[index - 1].x)
    })
  })
})
