import { describe, expect, it } from 'vitest'
import type { DisplayWidget } from '../../../state/displays/displayDocument'
import {
  dialValueFromDrag,
  initialDisplayControlValue,
  sliderValueFromPoint,
  stepDisplayControlValue,
} from '../displayRunPreview'
import { rangePosition } from '../../../state/rangeScale'

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

  it('reads a log Slider by its place along the travel and reports seconds on its step', () => {
    const slider = control('Slider', { min: 0.1, max: 120, step: 0.1, scale: 'log', orientation: 'horizontal' })
    const rect = { left: 0, top: 0, width: 300, height: 50 }
    expect(sliderValueFromPoint(slider, { x: 0, y: 0 }, rect)).toBe(0.1)
    expect(sliderValueFromPoint(slider, { x: 100, y: 0 }, rect)).toBe(1.1)
    expect(sliderValueFromPoint(slider, { x: 150, y: 0 }, rect)).toBe(3.5)
    expect(sliderValueFromPoint(slider, { x: 300, y: 0 }, rect)).toBe(120)
    expect(sliderValueFromPoint(slider, { x: 900, y: 0 }, rect)).toBe(120)
    // Each value lands where the preview draws it: the round trip holds.
    const at = rangePosition(14.4, 0.1, 120, 'log') * 300
    expect(sliderValueFromPoint(slider, { x: at, y: 0 }, rect)).toBe(14.4)
    // Asked for log with a zero minimum, it slides linearly.
    const zero = control('Slider', { min: 0, max: 10, step: 1, scale: 'log' })
    expect(sliderValueFromPoint(zero, { x: 50, y: 0 }, { left: 0, top: 0, width: 100, height: 50 })).toBe(5)
  })

  it('turns a log Dial by a decade for the same drag at either end', () => {
    const dial = control('Dial', { min: 1, max: 1000, step: 1, scale: 'log' })
    // 120 px crosses the whole range, three decades: 40 px is one.
    expect(dialValueFromDrag(dial, 1, -40)).toBe(10)
    expect(dialValueFromDrag(dial, 100, -40)).toBe(1000)
    expect(dialValueFromDrag(dial, 1000, 40)).toBe(100)
    expect(dialValueFromDrag(dial, 10, 400)).toBe(1)
  })
})
