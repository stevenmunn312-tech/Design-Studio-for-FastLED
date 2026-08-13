// Board-aware INMP441 I2S pin defaults for a newly created MicInput.
//
// The library default (39/40/41) is the common ESP32-S3 wiring, but those pads
// do not exist on every ESP32 variant — GPIO40/41 are absent from the classic
// ESP32, C3, C6 and H2 entirely — so dropping a Microphone onto a classic-ESP32
// project produced a node that could never compile, flagged only after the fact
// by the board-compatibility check.
//
// Each entry below is picked to be genuinely free on that variant: present on
// the board, the right direction for its role (WS/SCK are driven by the MCU,
// SD is sampled from the mic), and clear of strapping pins, UART0, and the
// ADC2/Wi-Fi caveat, so a fresh node reports no pin errors *or* warnings.
// `micPinDefaults.test.ts` asserts exactly that against the GPIO catalogue, so
// a new board entry cannot quietly inherit an impossible default.

import { useUploadStore } from './uploadStore'

export interface MicI2sPins { i2sWs: number; i2sSck: number; i2sSd: number }

/** ESP32-S3: the library default, and what the show/audio path was validated on. */
const ESP32_S3_PINS: MicI2sPins = { i2sWs: 39, i2sSck: 40, i2sSd: 41 }

/** Classic ESP32: all ADC1, so no Wi-Fi conflict; SD lands on input-only 34. */
const ESP32_CLASSIC_PINS: MicI2sPins = { i2sWs: 32, i2sSck: 33, i2sSd: 34 }

export const MIC_PIN_DEFAULTS_BY_FQBN: Readonly<Record<string, MicI2sPins>> = {
  'esp32:esp32:esp32s3': ESP32_S3_PINS,
  'esp32:esp32:esp32': ESP32_CLASSIC_PINS,
  'esp32:esp32:esp32doit-devkit-v1': ESP32_CLASSIC_PINS,
  'esp32:esp32:esp32s2': { i2sWs: 33, i2sSck: 34, i2sSd: 35 },
  'esp32:esp32:esp32c3': { i2sWs: 4, i2sSck: 6, i2sSd: 7 },
  'esp32:esp32:esp32c6': { i2sWs: 18, i2sSck: 19, i2sSd: 20 },
  'esp32:esp32:esp32h2': { i2sWs: 10, i2sSck: 11, i2sSd: 12 },
}

/**
 * Pins a MicInput created against `fqbn` should start with, or `undefined` to
 * keep the library default. Non-ESP32 targets get no mapping on purpose: the
 * microphone can't be built for them at all (deploy validation says so
 * outright), so there is no pin choice that would make the node any more
 * valid — inventing one would only disguise that.
 */
export function micPinDefaultsForBoard(fqbn: string): MicI2sPins | undefined {
  return MIC_PIN_DEFAULTS_BY_FQBN[fqbn]
}

/** The selected board's mic pins, read at node-creation time. */
export function micPinDefaultsForSelectedBoard(): MicI2sPins | undefined {
  return micPinDefaultsForBoard(useUploadStore.getState().selectedFqbn)
}

const PIN_KEYS = ['i2sWs', 'i2sSck', 'i2sSd'] as const

function samePins(properties: Record<string, unknown>, pins: MicI2sPins): boolean {
  return PIN_KEYS.every((key) => Number(properties[key]) === pins[key])
}

/**
 * True when a MicInput's pins are still a stock default rather than something
 * the user typed. Matching against *every* board's default set — not just the
 * previously selected one — covers a project saved under one target and opened
 * under another, and the library default that pre-dates this mapping.
 */
export function micPinsAreDefault(properties: Record<string, unknown>): boolean {
  return Object.values(MIC_PIN_DEFAULTS_BY_FQBN).some((pins) => samePins(properties, pins))
}

/**
 * Pins to move an existing MicInput to when the upload target changes, or
 * `undefined` to leave it alone.
 *
 * Switching board used to leave a Microphone on the old target's pins, which on
 * a different ESP32 variant may not exist at all — the node looked configured
 * but could never build. Retargeting only ever touches a node still on a stock
 * default: edit any of the three and the node is yours, and a board switch
 * leaves it exactly as you set it (deploy validation still flags it if those
 * pins aren't on the new board).
 */
export function retargetedMicPins(
  properties: Record<string, unknown>,
  nextFqbn: string,
): MicI2sPins | undefined {
  const next = micPinDefaultsForBoard(nextFqbn)
  if (!next) return undefined
  if (!micPinsAreDefault(properties)) return undefined
  if (samePins(properties, next)) return undefined
  return next
}
