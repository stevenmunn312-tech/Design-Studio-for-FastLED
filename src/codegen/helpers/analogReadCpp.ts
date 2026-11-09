/*
 * `analogRead` full scale per board, so a pot, light sensor or joystick axis
 * reaches 1 everywhere. The ESP32 family reads 12 bits by default; ESP8266,
 * AVR, RP2040, SAMD and Teensy read 10. Dividing every board by 4095 left an
 * ESP8266 pot topping out at 0.25 and a centred joystick reading -0.75.
 *
 * The guard lets each analog read emit the block beside itself, wherever its
 * sketch puts it (loop, helper or player control), without a shared prelude.
 */
export const ANALOG_FULL_SCALE = 'DS_ANALOG_FULL_SCALE'

export const ANALOG_FULL_SCALE_CPP: readonly string[] = [
  `#ifndef ${ANALOG_FULL_SCALE}`,
  '#if defined(ESP32)',
  `#define ${ANALOG_FULL_SCALE} 4095.0f  // 12-bit analogRead`,
  '#else',
  `#define ${ANALOG_FULL_SCALE} 1023.0f  // 10-bit analogRead`,
  '#endif',
  '#endif',
]

/** `analogRead(pin)` as 0–1 on any board; emit `ANALOG_FULL_SCALE_CPP` first. */
export function analogLevelCpp(pinExpr: string | number): string {
  return `analogRead(${pinExpr}) / ${ANALOG_FULL_SCALE}`
}
