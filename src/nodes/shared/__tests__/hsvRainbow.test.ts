import { describe, expect, it } from 'vitest'
import { FILL_RAINBOW_SAT, hsv2rgbRainbow } from '../hsvRainbow'
import { evalRainbow } from '../../generative/evaluate'

describe('hsv2rgbRainbow', () => {
  // Values worked through FastLED 3.10.8's hsv2rgb_rainbow by hand.
  it('lands the wheel where FastLED does, with its widened yellow', () => {
    expect(hsv2rgbRainbow(0, 255, 255)).toEqual({ r: 255, g: 0, b: 0 })
    expect(hsv2rgbRainbow(32, 255, 255)).toEqual({ r: 171, g: 85, b: 0 })
    expect(hsv2rgbRainbow(64, 255, 255)).toEqual({ r: 171, g: 170, b: 0 })
    expect(hsv2rgbRainbow(96, 255, 255)).toEqual({ r: 0, g: 255, b: 0 })
    expect(hsv2rgbRainbow(160, 255, 255)).toEqual({ r: 0, g: 0, b: 255 })
    expect(hsv2rgbRainbow(256 + 96, 255, 255)).toEqual(hsv2rgbRainbow(96, 255, 255))
  })

  it('desaturates toward a floor and dims through scale8_video', () => {
    // fill_rainbow's 240: desat = scale8_video(15, 15) = 1, so each channel
    // is scale8(c, 254) plus that floor.
    expect(hsv2rgbRainbow(0, FILL_RAINBOW_SAT, 255)).toEqual({ r: 255, g: 1, b: 1 })
    expect(hsv2rgbRainbow(0, 0, 255)).toEqual({ r: 255, g: 255, b: 255 })
    // val 128 becomes scale8_video(128, 128) = 65.
    expect(hsv2rgbRainbow(0, 255, 128)).toEqual({ r: 65, g: 0, b: 0 })
    expect(hsv2rgbRainbow(0, 255, 0)).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('Rainbow', () => {
  it('fills along the string order, as fill_rainbow does, or once per column or row', () => {
    const string = evalRainbow(10.7, 6, 'string', 4, 3)
    expect(string[0][0]).toEqual(hsv2rgbRainbow(10, FILL_RAINBOW_SAT, 255))
    expect(string[1][0]).toEqual(hsv2rgbRainbow(10 + 4 * 6, FILL_RAINBOW_SAT, 255))
    const horizontal = evalRainbow(10, 6, 'horizontal', 4, 3)
    expect(horizontal[2]).toEqual(horizontal[0])
    expect(horizontal[0][1]).toEqual(hsv2rgbRainbow(16, FILL_RAINBOW_SAT, 255))
    const vertical = evalRainbow(10, 6, 'vertical', 4, 3)
    expect(vertical[1][3]).toEqual(vertical[1][0])
    expect(vertical[2][0]).toEqual(hsv2rgbRainbow(22, FILL_RAINBOW_SAT, 255))
    // The byte wraps as the sketch's uint8_t does.
    expect(evalRainbow(250, 10, 'string', 2, 1)[0][1]).toEqual(hsv2rgbRainbow(4, FILL_RAINBOW_SAT, 255))
  })
})
