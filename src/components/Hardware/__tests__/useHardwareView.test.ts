import { describe, expect, it } from 'vitest'
import { clampHardwareZoom, HARDWARE_VIEW_MAX_ZOOM } from '../useHardwareView'

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
