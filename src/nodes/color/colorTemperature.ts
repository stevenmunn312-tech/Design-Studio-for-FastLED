/**
 * Color Temperature's range, shared by its slider, the preview and the
 * sketch so all three hold a wired value to the same bounds.
 *
 * In Kelvin, the unit LEDs are sold by, and lower is warmer, as on every
 * bulb's box. 1800 K is candlelight and 9000 K a clear blue sky; the useful
 * whites, 2700–6500 K, take most of the slider (a linear 1000–12000 K map
 * once squeezed them into 0.15–0.5 of a 0–1 "warmth" that ran backwards).
 */
export const COLOR_TEMPERATURE_K = { min: 1800, max: 9000, default: 4000 } as const

export function clampColorTemperature(kelvin: number): number {
  return Math.max(COLOR_TEMPERATURE_K.min, Math.min(COLOR_TEMPERATURE_K.max, kelvin))
}

/** The same clamp as C++, around a float expression. */
export function colorTemperatureCpp(kelvin: string): string {
  return `kelvinToRGB(constrain(${kelvin}, ${COLOR_TEMPERATURE_K.min}.0f, ${COLOR_TEMPERATURE_K.max}.0f))`
}
