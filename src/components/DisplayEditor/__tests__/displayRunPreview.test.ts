import { describe, expect, it } from 'vitest'
import type { DisplayWidget } from '../../../state/displayDocument'
import {
  dialValueFromDrag,
  initialDisplayControlValue,
  sliderValueFromPoint,
  stepDisplayControlValue,
} from '../displayRunPreview'

function control(type: 'Slider' | 'Dial', properties: Record<string, string | number | boolean>): DisplayWidget {
  return {
    id: type.toLowerCase(),
    type,
    label: type,
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    properties,
  }
}

describe('display run preview controls', () => {
  it('maps horizontal and vertical slider touch coordinates into snapped values', () => {
    const horizontal = control('Slider', { min: 0, max: 10, step: 0.5, orientation: 'horizontal' })
    const vertical = control('Slider', { min: -1, max: 1, step: 0.1, orientation: 'vertical' })

    expect(sliderValueFromPoint(horizontal, { x: 76, y: 0 }, { left: 1, top: 0, width: 100, height: 50 })).toBe(7.5)
    expect(sliderValueFromPoint(vertical, { x: 0, y: 25 }, { left: 0, top: 0, width: 100, height: 100 })).toBe(0.5)
  })

  it('clamps dial dragging and keyboard stepping to the configured range', () => {
    const dial = control('Dial', { min: 0, max: 1, step: 0.1 })

    expect(initialDisplayControlValue(dial)).toBe(0)
    expect(dialValueFromDrag(dial, 0.5, -60)).toBe(1)
    expect(dialValueFromDrag(dial, 0.5, 240)).toBe(0)
    expect(stepDisplayControlValue(dial, 0.5, 1)).toBe(0.6)
  })
})
