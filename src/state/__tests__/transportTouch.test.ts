import { describe, expect, it } from 'vitest'
import { fixedTransportGeometry, nowPlayingGeometry } from '../transportDisplay'
import { TFT_CONTROLLERS, tftRotatedSize, type TftRotation } from '../tftSurface'
import {
  DEFAULT_XPT2046_CALIBRATION,
  TOUCH_CALIBRATION_CORNERS,
  TOUCH_CALIBRATION_SAMPLES_PER_CORNER,
  beginTouchCalibrationCorner,
  captureTouchCalibrationSample,
  createTouchCalibrationCapture,
  mapTransportTouch,
  retryTouchCalibrationCorner,
  touchCalibrationFromSamples,
  touchRegionAt,
  transportTouchRegions,
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

  // Show Status is read-only. Its LED toggle and brightness bar were drawn
  // from readings a Slideshow does not have, and both went with them to the
  // custom-display layer, which can wire an LED output's Controls directly.
  it('offers no hit areas on a read-only Show Status panel', () => {
    expect(transportTouchRegions(panel, '0', 'Show Status')).toEqual([])
  })

  it('offers no hit areas on a waiting panel', () => {
    expect(transportTouchRegions(panel, '0', 'Waiting')).toEqual([])
  })

  it('maps every Fixed Transport button and its volume bar', () => {
    const g = fixedTransportGeometry(240, 320)
    expect(transportTouchRegions(panel, '0', 'Fixed Transport')).toEqual([
      { action: 'previous', rect: g.previous.rect },
      { action: 'playPause', rect: g.playPause.rect },
      { action: 'next', rect: g.next.rect },
      { action: 'volume', rect: g.volume, valueAxis: 'x' },
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

describe('guided touch calibration', () => {
  const points = {
    topLeft: { x: 220, y: 210 },
    topRight: { x: 3880, y: 205 },
    bottomRight: { x: 3890, y: 3870 },
    bottomLeft: { x: 215, y: 3885 },
  } as const

  function fillCurrent(capture: ReturnType<typeof createTouchCalibrationCapture>) {
    const corner = TOUCH_CALIBRATION_CORNERS[capture.cornerIndex].id
    let next = capture
    for (let i = 0; i < TOUCH_CALIBRATION_SAMPLES_PER_CORNER; i += 1) {
      const point = points[corner]
      next = captureTouchCalibrationSample(next, {
        x: point.x + (i === 0 ? 40 : 0),
        y: point.y + (i === 0 ? -40 : 0),
      })
    }
    return next
  }

  it('ignores readings until the current corner is armed', () => {
    const capture = captureTouchCalibrationSample(createTouchCalibrationCapture(), { x: 200, y: 200 })
    expect(capture.samples.topLeft).toEqual([])
    expect(capture.phase).toBe('ready')
  })

  it('captures every corner and derives jitter-resistant raw bounds', () => {
    let capture = createTouchCalibrationCapture()
    for (let corner = 0; corner < TOUCH_CALIBRATION_CORNERS.length; corner += 1) {
      capture = beginTouchCalibrationCorner(capture)
      capture = fillCurrent(capture)
    }
    expect(capture.phase).toBe('complete')
    expect(capture.result).toEqual({ xMin: 215, xMax: 3890, yMin: 205, yMax: 3885 })
  })

  it('rejects out-of-range readings and lets a captured corner be retried', () => {
    let capture = beginTouchCalibrationCorner(createTouchCalibrationCapture())
    capture = captureTouchCalibrationSample(capture, { x: -1, y: 200 })
    expect(capture.samples.topLeft).toHaveLength(0)
    capture = fillCurrent(capture)
    expect(capture.phase).toBe('captured')
    capture = retryTouchCalibrationCorner(capture)
    expect(capture.phase).toBe('collecting')
    expect(capture.samples.topLeft).toEqual([])
  })

  it('refuses bounds that do not span both axes', () => {
    const samples = Object.fromEntries(TOUCH_CALIBRATION_CORNERS.map(({ id }) => [
      id,
      Array.from({ length: TOUCH_CALIBRATION_SAMPLES_PER_CORNER }, () => ({ x: 1000, y: 1000 })),
    ])) as Parameters<typeof touchCalibrationFromSamples>[0]
    expect(touchCalibrationFromSamples(samples)).toBeNull()
  })
})
