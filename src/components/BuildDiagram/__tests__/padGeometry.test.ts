import { describe, it, expect } from 'vitest'
import { MODULE_PAD_GEOMETRY, peripheralPadPoint, peripheralPadCount } from '../physicalDiagramLayout'
import { partById } from '../../../state/partCatalogue'
import type { HardwareManifestItem } from '../../../build/hardwareManifest'
import type { ItemLayout } from '../physicalDiagramLayout'

function layoutFor(partId: string, kind: HardwareManifestItem['kind']): ItemLayout {
  return {
    x: 0, y: 0,
    item: {
      id: `${kind}:x`, kind, title: kind, subtitle: '', sourceNodeId: 'x',
      supported: true, pins: [], facts: { partId },
    } as HardwareManifestItem,
  } as ItemLayout
}

describe('measured pad geometry', () => {
  const entries = Object.entries(MODULE_PAD_GEOMETRY)

  it('covers the modules that have been measured', () => {
    expect(entries.length).toBeGreaterThanOrEqual(9)
    for (const partId of ['sh1106-oled-128x64', 'ssd1306-oled-128x64',
      'tm1637-4digit-display', 'max7219-8digit-7segment']) {
      expect(MODULE_PAD_GEOMETRY[partId], partId).toBeDefined()
    }
  })

  /*
   * The invariant that catches a mis-measurement or a replaced render: a module
   * has as many measured points as its header has pads. One short and the last
   * wire lands on its neighbour; one long and a pad nobody wired gets a wire.
   */
  it.each(entries)('gives %s one point per catalogued pad', (partId, points) => {
    const labels = partById(partId)?.pinLabelsLeftToRight
    expect(labels, `${partId} has no catalogued header`).toBeDefined()
    expect(points.length, `${partId}: ${points.length} points for ${labels!.length} pads`)
      .toBe(labels!.length)
  })

  it.each(entries)('keeps %s inside its own picture', (_partId, points) => {
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  })

  it.each(entries)('keeps %s pads distinct', (_partId, points) => {
    const seen = new Set(points.map(([x, y]) => `${x.toFixed(4)}:${y.toFixed(4)}`))
    expect(seen.size).toBe(points.length)
  })

  // A header that runs down an edge rather than across the bottom is the case
  // the old row-of-xs shape could not describe at all.
  it('describes a vertical header', () => {
    const max7219 = MODULE_PAD_GEOMETRY['max7219-8digit-7segment']
    const xs = new Set(max7219.map(([x]) => x))
    const ys = new Set(max7219.map(([, y]) => y))
    expect(xs.size).toBe(1)
    expect(ys.size).toBe(max7219.length)
  })

  it('describes a horizontal header', () => {
    const oled = MODULE_PAD_GEOMETRY['sh1106-oled-128x64']
    const ys = new Set(oled.map(([, y]) => y))
    expect(ys.size).toBe(1)
    expect(new Set(oled.map(([x]) => x)).size).toBe(oled.length)
  })

  /*
   * The measurement is honoured, checked by shape rather than by re-deriving
   * the fitted-box maths here: a horizontal header must come out as one row at
   * a constant y with x increasing, and a vertical one as a column at constant
   * x. An unmeasured part cannot produce either.
   */
  it('lays a measured horizontal header out as a row', () => {
    const oled = layoutFor('sh1106-oled-128x64', 'info-display')
    const points = Array.from({ length: peripheralPadCount(oled.item) }, (_, i) => peripheralPadPoint(oled, i))
    const ys = new Set(points.map((p) => p.y.toFixed(4)))
    expect(ys.size, 'pads should share one y').toBe(1)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].x, `pad ${i} is left of pad ${i - 1}`).toBeGreaterThan(points[i - 1].x)
    }
  })

  it('lays a measured vertical header out as a column', () => {
    const seg = layoutFor('max7219-8digit-7segment', 'segment-display')
    const points = Array.from({ length: peripheralPadCount(seg.item) }, (_, i) => peripheralPadPoint(seg, i))
    const xs = new Set(points.map((p) => p.x.toFixed(4)))
    expect(xs.size, 'pads should share one x').toBe(1)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y, `pad ${i} is above pad ${i - 1}`).toBeGreaterThan(points[i - 1].y)
    }
  })

  // Pad spacing on the drawing follows the spacing measured off the render, so
  // an unevenly pitched header stays uneven rather than being regularised.
  it('preserves the measured pitch', () => {
    const ssd = layoutFor('ssd1306-oled-128x64', 'info-display')
    const geometry = MODULE_PAD_GEOMETRY['ssd1306-oled-128x64']
    const points = Array.from({ length: geometry.length }, (_, i) => peripheralPadPoint(ssd, i))
    const drawnSpan = points[points.length - 1].x - points[0].x
    const measuredSpan = geometry[geometry.length - 1][0] - geometry[0][0]
    for (let i = 1; i < points.length; i++) {
      const drawn = (points[i].x - points[i - 1].x) / drawnSpan
      const measured = (geometry[i][0] - geometry[i - 1][0]) / measuredSpan
      expect(drawn, `gap ${i}`).toBeCloseTo(measured, 5)
    }
  })

  it('keeps every pad of a measured module inside its render box', () => {
    for (const [partId, points] of entries) {
      const kind: HardwareManifestItem['kind'] = 'info-display'
      const layout = layoutFor(partId, kind)
      for (let i = 0; i < points.length; i++) {
        const { x, y } = peripheralPadPoint(layout, i)
        expect(Number.isFinite(x) && Number.isFinite(y), `${partId} pad ${i}`).toBe(true)
      }
    }
  })
})
