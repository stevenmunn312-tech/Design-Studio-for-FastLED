import { describe, expect, it } from 'vitest'
import {
  effectiveRangeScale, logRangeUsable, logTravelPosition, logTravelValue, RANGE_SCALE_LOG_CPP, RANGE_SCALE_LOG_JS,
  RANGE_TRAVEL_STEPS, rangePosition, rangeValueAt, snapRangeValue,
} from '../rangeScale'
import { COLOR_TRAILS_TRAIL_LENGTH } from '../../nodes/audioReactive/colorTrails'
import { NODE_LIBRARY, libraryDefaults, propertyMeta } from '../nodeLibrary'

const { min, max, step } = COLOR_TRAILS_TRAIL_LENGTH

describe('range scale', () => {
  it('travels a log range by ratios: each decade takes the same distance', () => {
    expect(rangePosition(1, 1, 1000, 'log')).toBe(0)
    expect(rangePosition(10, 1, 1000, 'log')).toBeCloseTo(1 / 3, 12)
    expect(rangePosition(100, 1, 1000, 'log')).toBeCloseTo(2 / 3, 12)
    expect(rangePosition(1000, 1, 1000, 'log')).toBe(1)
    expect(rangeValueAt(0.5, 1, 100, 'log')).toBeCloseTo(10, 12)
    // Linear stays linear.
    expect(rangePosition(25, 0, 100)).toBe(0.25)
    expect(rangeValueAt(0.25, 0, 100)).toBe(25)
  })

  it('round-trips a value through its position on either scale', () => {
    for (const value of [0.1, 0.37, 1, 2.5, 9.6213, 14.4, 17.7672, 60, 119.9, 120]) {
      expect(rangeValueAt(rangePosition(value, min, max, 'log'), min, max, 'log')).toBeCloseTo(value, 9)
    }
    for (const value of [-3, 0, 0.5, 7.25]) {
      expect(rangeValueAt(rangePosition(value, -3, 7.25), -3, 7.25)).toBeCloseTo(value, 12)
    }
    for (const position of [0, 0.125, 0.5, 0.9, 1]) {
      expect(rangePosition(rangeValueAt(position, min, max, 'log'), min, max, 'log')).toBeCloseTo(position, 12)
    }
  })

  it('lands exactly on both ends', () => {
    expect(rangeValueAt(0, min, max, 'log')).toBe(min)
    expect(rangeValueAt(1, min, max, 'log')).toBe(max)
    expect(rangePosition(min, min, max, 'log')).toBe(0)
    expect(rangePosition(max, min, max, 'log')).toBe(1)
  })

  it('clamps positions and values outside the range, and holds a non-number at the minimum', () => {
    expect(rangePosition(0.01, min, max, 'log')).toBe(0)
    expect(rangePosition(500, min, max, 'log')).toBe(1)
    expect(rangePosition(-4, 0, 1)).toBe(0)
    expect(rangeValueAt(-0.5, min, max, 'log')).toBe(min)
    expect(rangeValueAt(1.5, min, max, 'log')).toBe(max)
    expect(rangeValueAt(Number.NaN, min, max, 'log')).toBe(min)
    expect(rangePosition(Number.NaN, min, max, 'log')).toBe(0)
    expect(rangePosition(Number.POSITIVE_INFINITY, min, max, 'log')).toBe(0)
    // An empty range has one value and one place.
    expect(rangeValueAt(0.7, 3, 3, 'log')).toBe(3)
    expect(rangePosition(3, 3, 3, 'log')).toBe(0)
  })

  it('travels linearly when a log range has no minimum above zero', () => {
    expect(logRangeUsable(0.1, 120)).toBe(true)
    expect(logRangeUsable(0, 120)).toBe(false)
    expect(logRangeUsable(-1, 1)).toBe(false)
    expect(logRangeUsable(5, 5)).toBe(false)
    expect(effectiveRangeScale('log', 0, 120)).toBe('linear')
    expect(effectiveRangeScale('log', 0.1, 120)).toBe('log')
    expect(effectiveRangeScale('logarithmic', 0.1, 120)).toBe('linear')
    expect(effectiveRangeScale(undefined, 0.1, 120)).toBe('linear')
    expect(rangeValueAt(0.5, 0, 100, 'log')).toBe(50)
    expect(rangePosition(50, 0, 100, 'log')).toBe(0.5)
  })

  it('snaps on the step from the minimum, inside the range, without drift', () => {
    expect(snapRangeValue(14.4321, min, max, step)).toBe(14.4)
    expect(snapRangeValue(0.149, min, max, step)).toBe(0.1)
    expect(snapRangeValue(0.151, min, max, step)).toBe(0.2)
    expect(snapRangeValue(500, min, max, step)).toBe(120)
    expect(snapRangeValue(-1, min, max, step)).toBe(0.1)
    expect(snapRangeValue(Number.NaN, min, max, step)).toBe(0.1)
    // From the minimum: 0.05 + whole steps of 0.1.
    expect(snapRangeValue(0.31, 0.05, 5, 0.1)).toBe(0.35)
    expect(snapRangeValue(2.345, 0, 10, 0)).toBe(2.345)
  })

  it('puts the Color Trails bundled trails in the upper middle of the slider, not its first sixth', () => {
    expect(COLOR_TRAILS_TRAIL_LENGTH.scale).toBe('log')
    for (const seconds of [9.6213, 12.8303, 14.4, 14.8051, 17.7672]) {
      const position = rangePosition(seconds, min, max, 'log')
      expect(position, `${seconds} s`).toBeGreaterThan(0.6)
      expect(position, `${seconds} s`).toBeLessThan(0.75)
      expect(rangePosition(seconds, min, max), `${seconds} s linear`).toBeLessThan(0.16)
    }
  })

  it('moves a log input one step when a position is too small to reach the next', () => {
    expect(logTravelPosition(min, min, max)).toBe(0)
    expect(logTravelPosition(max, min, max)).toBe(RANGE_TRAVEL_STEPS)
    // An arrow key at the bottom is a tenth of a 0.1 s step.
    expect(logTravelValue(1, min, min, max, step)).toBe(0.2)
    expect(logTravelValue(logTravelPosition(0.2, min, max) - 1, 0.2, min, max, step)).toBe(0.1)
    // Further up a position is more than a step, and lands where it points.
    const at = logTravelPosition(14.4, min, max)
    expect(logTravelValue(at + 1, 14.4, min, max, step)).toBe(14.5)
    expect(logTravelValue(at, 14.4, min, max, step)).toBe(14.4)
    expect(logTravelValue(RANGE_TRAVEL_STEPS, 14.4, min, max, step)).toBe(120)
    expect(logTravelValue(0, 14.4, min, max, step)).toBe(0.1)
    // Held at both ends.
    expect(logTravelValue(RANGE_TRAVEL_STEPS, 120, min, max, step)).toBe(120)
  })

  it('emits the firmware and page twins of the same curve', () => {
    expect(RANGE_SCALE_LOG_CPP).toContain('static float _rsLogValue(float position, float minimum, float maximum, float step) {')
    expect(RANGE_SCALE_LOG_CPP).toContain('float value = minimum * powf(maximum / minimum, constrain(position, 0.0f, 1.0f));')
    expect(RANGE_SCALE_LOG_CPP).toContain('if (step > 0.0f) value = minimum + roundf((value - minimum) / step) * step;')
    expect(RANGE_SCALE_LOG_CPP).toContain('return constrain(logf(constrain(value, minimum, maximum) / minimum) / logf(maximum / minimum), 0.0f, 1.0f);')
    // No CRGB, FastLED or LVGL: the helper stands on Arduino's maths alone.
    expect(RANGE_SCALE_LOG_CPP).not.toMatch(/\b(CRGB|FastLED|lv_)\w*/)

    // The page's twin, run on a control's data attributes.
    const page = new Function(`${RANGE_SCALE_LOG_JS}\nreturn { lv: lv, lp: lp }`)() as {
      lv: (c: unknown, p: number) => number
      lp: (c: unknown, x: unknown) => number
    }
    const control = { dataset: { min: String(min), max: String(max) } }
    for (const position of [0, 0.01, 0.25, 0.5, 0.7, 0.99, 1]) {
      expect(page.lv(control, position)).toBeCloseTo(rangeValueAt(position, min, max, 'log'), 9)
    }
    for (const value of [0.1, 0.5, 14.4, 120]) {
      expect(page.lp(control, value)).toBeCloseTo(rangePosition(value, min, max, 'log'), 12)
    }
    expect(page.lv(control, -1)).toBe(min)
    expect(page.lv(control, 9)).toBe(max)
    expect(page.lp(control, 'not a number')).toBe(0)
    expect(page.lp(control, 1e9)).toBe(1)
  })

  it('declares log travel only on sliders whose minimum is above zero', () => {
    const logRows: string[] = []
    for (const definition of NODE_LIBRARY) {
      for (const key of Object.keys(libraryDefaults(definition.type))) {
        const meta = propertyMeta(definition.type, key)
        if (meta?.control !== 'slider' || meta.scale !== 'log') continue
        logRows.push(`${definition.type}.${key}`)
        expect(logRangeUsable(meta.min, meta.max), `${definition.type}.${key}`).toBe(true)
      }
    }
    // Durations and rates spanning two decades or more whose usual values sat
    // in the first twentieth of a linear slider, and pitch. Thresholds,
    // calibration, counts, ports and seeds stay linear.
    expect(logRows.sort()).toEqual([
      'Breathe.bpm', 'BuzzerOutput.pitchHz', 'ColorTrails.trailLength', 'Interval.interval',
      'PatternMaster.maxTime', 'PatternMaster.minTime', 'PatternSlideshow.maxTime', 'PatternSlideshow.minTime',
      'Sequencer.interval', 'Trigger.holdTime', 'Trigger.stableTime',
    ])
  })
})
