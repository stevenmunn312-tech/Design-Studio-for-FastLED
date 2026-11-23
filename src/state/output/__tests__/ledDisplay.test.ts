import { describe, expect, it } from 'vitest'
import { LED_DISPLAY_GAMMA, LED_DISPLAY_LUT, ledDisplayValue } from '../ledDisplay'

/** The share of full light a screen pixel at `value` emits. */
const screenLight = (value: number) => (value / 255) ** LED_DISPLAY_GAMMA

describe('ledDisplay', () => {
  it('keeps black black and full full', () => {
    expect(ledDisplayValue(0)).toBe(0)
    expect(ledDisplayValue(255)).toBe(255)
  })

  it('makes the screen emit the share of light the LED emits', () => {
    // An LED is linear in its value; the screen value must land on the same
    // share of full light, to within the screen's 8-bit steps.
    for (const value of [8, 46, 110, 160, 200, 240]) {
      expect(screenLight(ledDisplayValue(value))).toBeCloseTo(value / 255, 2)
    }
  })

  it('lifts the low and middle values a plain copy would under-show', () => {
    expect(ledDisplayValue(46)).toBeGreaterThan(110)
    expect(ledDisplayValue(110)).toBeGreaterThan(170)
  })

  it('never reverses two LED values', () => {
    for (let value = 1; value < 256; value += 1) {
      expect(LED_DISPLAY_LUT[value]).toBeGreaterThanOrEqual(LED_DISPLAY_LUT[value - 1])
    }
  })

  it('clamps and truncates values outside the 8-bit range', () => {
    expect(ledDisplayValue(-20)).toBe(0)
    expect(ledDisplayValue(400)).toBe(255)
    expect(ledDisplayValue(110.9)).toBe(ledDisplayValue(110))
  })
})

describe('ledDisplay with the output Gamma', () => {
  it('shows a Gamma 2.2 output as the colours the pattern made', async () => {
    // The whole point of the default: the output's Gamma and the display
    // curve cancel, so the LED output's picture is the pattern's picture.
    const { applyLedOutputRuntime, LED_OUTPUT_GAMMA_DEFAULT } = await import('../ledOutputRuntime')
    let worstDark = 0
    let worstRest = 0
    for (let value = 0; value < 256; value += 1) {
      const [[sent]] = applyLedOutputRuntime(
        [[{ r: value, g: value, b: value }]], { enabled: true, brightness: 1 }, LED_OUTPUT_GAMMA_DEFAULT,
      )
      const off = Math.abs(ledDisplayValue(sent.r) - value)
      if (value < 48) worstDark = Math.max(worstDark, off)
      else worstRest = Math.max(worstRest, off)
    }
    // From the low-middle up the two pictures agree to a few steps.
    expect(worstRest).toBeLessThanOrEqual(6)
    // The dark end cannot: an 8-bit LED has only a handful of values there,
    // and FastLED's video gamma keeps a lit pixel lit, so screen colours 1 to
    // about 20 all become LED value 1, which shows as 21. That is the real
    // loss of dark steps on hardware, and the preview shows it.
    expect(worstDark).toBeLessThanOrEqual(21)
  })
})
