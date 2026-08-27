import { describe, expect, it } from 'vitest'
import { nowPlayingGeometry, showStatusGeometry } from '../transportDisplay'
import { TFT_CONTROLLERS, tftRotatedSize, type TftRotation } from '../tftSurface'
import {
  DEFAULT_XPT2046_CALIBRATION, mapTransportTouch, touchRegionAt, transportTouchRegions,
} from '../transportTouch'

const panel = TFT_CONTROLLERS.ST7789V

describe('XPT2046 coordinate mapping', () => {
  it.each<[TftRotation, { x: number; y: number }]>([
    ['0', { x: 0, y: 0 }],
    ['90', { x: 319, y: 0 }],
    ['180', { x: 239, y: 319 }],
    ['270', { x: 0, y: 239 }],
  ])('rotates the native top-left at %s', (rotation, expected) => {
    expect(mapTransportTouch(200, 200, panel, rotation)).toEqual(expected)
  })

  it('clamps samples outside calibration instead of producing off-screen points', () => {
    expect(mapTransportTouch(-10, 5000, panel, '0')).toEqual({ x: 0, y: 319 })
  })

  it('maps the calibrated far corner inside every mounted size', () => {
    for (const rotation of ['0', '90', '180', '270'] as const) {
      const point = mapTransportTouch(
        DEFAULT_XPT2046_CALIBRATION.xMax,
        DEFAULT_XPT2046_CALIBRATION.yMax,
        panel,
        rotation,
      )
      expect(point).not.toBeNull()
      const size = tftRotatedSize(panel, rotation)
      expect(point!.x).toBeGreaterThanOrEqual(0)
      expect(point!.y).toBeGreaterThanOrEqual(0)
      expect(point!.x).toBeLessThan(size.width)
      expect(point!.y).toBeLessThan(size.height)
    }
  })

  it('rejects an inverted calibration range like the firmware sampler', () => {
    expect(mapTransportTouch(1000, 1000, panel, '0', {
      xMin: 3900, xMax: 200, yMin: 200, yMax: 3900,
    })).toBeNull()
  })
})

describe('fixed-layout touch regions', () => {
  it('derives Now Playing hit areas from its visible state and volume fields', () => {
    const g = nowPlayingGeometry(320, 240)
    expect(transportTouchRegions(panel, '90', 'Now Playing')).toEqual([
      { action: 'playPause', rect: g.state },
      { action: 'volume', rect: g.volume, valueAxis: 'x' },
    ])
  })

  it('derives Show Status hit areas from its visible output and brightness fields', () => {
    const g = showStatusGeometry(240, 320)
    expect(transportTouchRegions(panel, '0', 'Show Status')).toEqual([
      { action: 'ledToggle', rect: g.output },
      { action: 'brightness', rect: g.brightness, valueAxis: 'x' },
    ])
  })

  it('returns an absolute slider value and rejects empty panel space', () => {
    const regions = transportTouchRegions(panel, '0', 'Now Playing')
    const volume = regions[1].rect
    expect(touchRegionAt({ x: volume.x + volume.w - 1, y: volume.y }, regions))
      .toEqual({ action: 'volume', value: 1 })
    expect(touchRegionAt({ x: 0, y: 0 }, regions)).toBeNull()
  })
})
