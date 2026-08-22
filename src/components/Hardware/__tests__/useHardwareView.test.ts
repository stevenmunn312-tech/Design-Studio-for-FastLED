import { describe, expect, it } from 'vitest'
import {
  clampHardwareZoom,
  hardwareFitTransform,
  HARDWARE_VIEW_MAX_ZOOM,
} from '../useHardwareView'

describe('hardware view zoom range', () => {
  it('allows a close enough view for board silkscreen labels', () => {
    expect(HARDWARE_VIEW_MAX_ZOOM).toBe(40)
    expect(clampHardwareZoom(24)).toBe(24)
    expect(clampHardwareZoom(80)).toBe(40)
  })

  it('retains the overview zoom floor', () => {
    expect(clampHardwareZoom(0.1)).toBe(0.35)
  })
})

describe('hardware view fit', () => {
  it('centres and scales wide bench content into the available viewport', () => {
    const fitted = hardwareFitTransform(
      { width: 1200, height: 600 },
      { x: 100, y: 100, width: 1600, height: 300 },
      { x: 280, y: 0, width: 640, height: 600 },
    )

    expect(fitted.k).toBeCloseTo(0.36)
    expect(fitted.x).toBeCloseTo(-108)
    expect(fitted.y).toBeCloseTo(18)
  })

  it('does not enlarge an arrangement that already fits', () => {
    expect(hardwareFitTransform(
      { width: 1000, height: 500 },
      { x: 400, y: 180, width: 200, height: 100 },
    )).toEqual({ x: 0, y: 20, k: 1 })
  })
})
