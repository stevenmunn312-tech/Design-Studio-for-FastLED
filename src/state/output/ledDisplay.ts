// How an LED value is shown on a screen.
//
// An LED is linear: value 110 of 255 emits 43% of its full light. A screen is
// not: a pixel at 110 emits about 16% of its full light. Drawing LED values
// straight to the screen therefore shows the low and middle values, where
// most patterns live, at well under half the light the real LEDs give off,
// and a preview that looks dull stands in for hardware that does not.
//
// Every LED preview maps a frame value through this curve as it draws, so the
// screen emits the same share of full light as the LED would. The frame
// itself is never changed: what is streamed, baked, measured and uploaded
// stays the LED value.
//
// The LED output's Gamma field is applied to the frame before this, as the
// firmware applies it before the LEDs. With Gamma 2.2 on, the two curves
// cancel and the screen shows the pattern's own values, which is what that
// setting does on hardware.

/** The screen's response this undoes: light = value ^ 2.2. */
export const LED_DISPLAY_GAMMA = 2.2

/** Screen value for each LED value 0..255. */
export const LED_DISPLAY_LUT: Uint8Array = Uint8Array.from(
  { length: 256 },
  (_, value) => Math.round(255 * (value / 255) ** (1 / LED_DISPLAY_GAMMA)),
)

/** The screen value that emits the same share of full light as LED `value`. */
export function ledDisplayValue(value: number): number {
  return LED_DISPLAY_LUT[value <= 0 ? 0 : value >= 255 ? 255 : value | 0]
}
