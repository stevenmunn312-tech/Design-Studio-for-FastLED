import { ledSupplyVolts } from '../controllerSettings'

/**
 * The full-white draw of one LED, at the voltage its chipset runs from.
 *
 * The one source every load figure reads: the Board, Readiness, Checks and
 * the Build Diagram's electrical plan all size from here, so they agree.
 */
export interface LedFullWhiteDraw {
  /** Supply voltage the chipset runs from. */
  volts: number
  /** Current one addressed LED draws at full white, at `volts`. */
  maPerLed: number
}

/**
 * A WS2812-class RGB LED at 5 V: about 20 mA a channel, three channels. The
 * figure FastLED's own examples and most guides use.
 */
const RGB_5V_MA_PER_LED = 60

/** A 5 V RGBW part lights a fourth, white die: four channels of about 20 mA. */
const RGBW_5V_MA_PER_LED = 80

/**
 * A 12 V WS2811 IC drives a group of three LEDs in series on each channel, so
 * one addressed pixel draws about 20 mA a channel at 12 V: 60 mA. Common
 * 12 V WS2811 strip is sold at 7.2 W/m for 10 pixels a metre, the same 60 mA.
 * Scaling the 5 V figure by voltage (25 mA) understated it by more than half.
 */
const WS2811_12V_MA_PER_LED = 60

/**
 * A WS2815 is one 5050 LED a pixel on a 12 V rail. 60 LED/m strip is sold at
 * up to 18 W/m, which is 25 mA a pixel at 12 V.
 */
const WS2815_12V_MA_PER_LED = 25

/**
 * HUB75 sub-pixels are small and current-limited by the panel's own driver
 * ICs, and only a fraction of the rows is lit at once. Reported draw on a
 * P4 64x64 (4096-pixel) indoor panel is about 1.0-2.5 A typical and 4 A at
 * the high end; anchored to that high end, about 1 mA a pixel at 5 V. One
 * panel model, so a rough guide like the strip figures.
 */
const HUB75_5V_MA_PER_PIXEL = 1

/**
 * Full-white draw of one LED on an output with this chipset and form. A HUB75
 * form is a scan panel whatever chipset a save still carries.
 */
export function ledFullWhiteDraw(chipset: unknown, form?: unknown): LedFullWhiteDraw {
  if (form === 'hub75' || chipset === 'HUB75') return { volts: 5, maPerLed: HUB75_5V_MA_PER_PIXEL }
  const volts = ledSupplyVolts(chipset)
  switch (chipset) {
    case 'WS2811': return { volts, maPerLed: WS2811_12V_MA_PER_LED }
    case 'WS2815': return { volts, maPerLed: WS2815_12V_MA_PER_LED }
    case 'SK6812-RGBW': return { volts, maPerLed: RGBW_5V_MA_PER_LED }
    default: return { volts, maPerLed: RGB_5V_MA_PER_LED }
  }
}
