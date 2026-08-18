// Board-aware INMP441 compatibility and starting pins.
//
// This table is deliberately keyed by the exact upload FQBN. A chip may have
// an I2S peripheral while a particular board exposes different pads, and the
// Teensy I2S pins are fixed in hardware. Keeping capability and practical
// wiring together prevents the UI from enabling a microphone without also
// knowing what to put in its three pin fields.

import { useUploadStore } from './uploadStore'
import type { PhysicalBoardProfile } from '../build/boardProfiles'

export interface MicI2sPins { i2sWs: number; i2sSck: number; i2sSd: number }

/** The capture layer used by generated firmware. Every layer ultimately feeds
 * signed 16-bit mono PCM into FastLED's Processor, which is also the contract
 * implemented by the browser preview. */
export type Inmp441FirmwareBackend =
  | 'fastled-esp32'
  | 'fastled-teensy'
  | 'pico-i2s'
  | 'samd51-zero-i2s'
  | 'stm32-i2s'

export const INMP441_NO_BOARD_MESSAGE = 'No board selected'
export const INMP441_UNSUPPORTED_MESSAGE = 'The inmp441 microphone does not work with this board'

const ESP32_S3_PINS: MicI2sPins = { i2sWs: 39, i2sSck: 40, i2sSd: 41 }
const ESP32_CLASSIC_PINS: MicI2sPins = { i2sWs: 32, i2sSck: 33, i2sSd: 34 }
const ESP32_S2_PINS: MicI2sPins = { i2sWs: 33, i2sSck: 34, i2sSd: 35 }
const ESP32_C3_PINS: MicI2sPins = { i2sWs: 6, i2sSck: 4, i2sSd: 7 }
const ESP32_C6_PINS: MicI2sPins = { i2sWs: 7, i2sSck: 6, i2sSd: 2 }
const ESP32_H2_PINS: MicI2sPins = { i2sWs: 11, i2sSck: 10, i2sSd: 12 }
const TEENSY_4_PINS: MicI2sPins = { i2sWs: 20, i2sSck: 21, i2sSd: 8 }
const TEENSY_3_PINS: MicI2sPins = { i2sWs: 23, i2sSck: 9, i2sSd: 13 }
const PICO_PINS: MicI2sPins = { i2sWs: 21, i2sSck: 20, i2sSd: 22 }

export const MIC_PIN_DEFAULTS_BY_FQBN: Readonly<Record<string, MicI2sPins>> = {
  // ESP32 family. Named-board entries use pins actually exposed on that board.
  'esp32:esp32:esp32s3': ESP32_S3_PINS,
  'esp32:esp32:esp32': ESP32_CLASSIC_PINS,
  'esp32:esp32:esp32doit-devkit-v1': ESP32_CLASSIC_PINS,
  'esp32:esp32:esp32s2': ESP32_S2_PINS,
  'esp32:esp32:esp32c3': ESP32_C3_PINS,
  'esp32:esp32:esp32c6': ESP32_C6_PINS,
  'esp32:esp32:esp32h2': ESP32_H2_PINS,
  'esp32:esp32:nodemcu-32s': ESP32_CLASSIC_PINS,
  'esp32:esp32:esp32wrover': ESP32_CLASSIC_PINS,
  'esp32:esp32:lolin_s2_mini': ESP32_S2_PINS,
  'esp32:esp32:lolin_s3': ESP32_S3_PINS,
  'esp32:esp32:adafruit_feather_esp32s2': { i2sWs: 10, i2sSck: 11, i2sSd: 12 },
  'esp32:esp32:adafruit_feather_esp32s3': { i2sWs: 10, i2sSck: 11, i2sSd: 12 },
  'esp32:esp32:adafruit_qtpy_esp32s2': { i2sWs: 35, i2sSck: 36, i2sSd: 37 },
  'esp32:esp32:adafruit_feather_esp32_v2': { i2sWs: 32, i2sSck: 14, i2sSd: 33 },
  'esp32:esp32:lolin_c3_mini': ESP32_C3_PINS,
  'esp32:esp32:XIAO_ESP32C3': ESP32_C3_PINS,
  'esp32:esp32:XIAO_ESP32C6': { i2sWs: 22, i2sSck: 19, i2sSd: 2 },

  // PJRC Audio / FastLED Teensy backend. Teensy LC and 3.0 are excluded by
  // the backend because their normal builds cannot hold its I2S DMA buffers.
  'teensy:avr:teensy41': TEENSY_4_PINS,
  'teensy:avr:teensy40': TEENSY_4_PINS,
  'teensy:avr:teensyMM': TEENSY_4_PINS,
  'teensy:avr:teensy36': TEENSY_3_PINS,
  'teensy:avr:teensy35': TEENSY_3_PINS,
  'teensy:avr:teensy31': TEENSY_3_PINS,

  // Earle Philhower's RP2040/RP2350 Arduino core uses PIO for I2S. LRCLK is
  // paired with the adjacent BCLK pin; 20/21 plus data on 22 is a practical
  // breadboard-friendly starting point on the Pico headers.
  'rp2040:rp2040:rpipico': PICO_PINS,
  'rp2040:rp2040:rpipicow': PICO_PINS,
  'rp2040:rp2040:rpipico2': PICO_PINS,
  'rp2040:rp2040:rpipico2w': PICO_PINS,
  // KB2040 exposes GP8-GP10 together; Earle's I2S input pairs BCLK with the
  // next GPIO for LRCLK, so 8/9 keeps data on adjacent GP10.
  'rp2040:rp2040:adafruit_kb2040': { i2sWs: 9, i2sSck: 8, i2sSd: 10 },

  // SAMD51 board-variant I2S input pins, in Arduino pin numbering. These are
  // the core's PIN_I2S_FS / PIN_I2S_SCK / PIN_I2S_SDI definitions. MatrixPortal
  // M4 is deliberately absent: its current Adafruit variant declares no I2S
  // interface even though it uses the same MCU family.
  'adafruit:samd:adafruit_feather_m4': { i2sWs: 10, i2sSck: 1, i2sSd: 12 },
  'adafruit:samd:adafruit_grandcentral_m4': { i2sWs: 33, i2sSck: 14, i2sSd: 31 },

  // STM32duino SPI2/I2S2 wiring (PB12 WS, PB13 CK, PB15 SD), translated to
  // each board variant's Arduino digital-pin numbers. The common F103C8 Blue
  // Pill is deliberately excluded: its medium-density SPI block exposes only
  // the I2S-mode bit, not the full I2S configuration/prescaler registers needed
  // to clock an INMP441.
  'STMicroelectronics:stm32:blackpill_f411ce': { i2sWs: 27, i2sSck: 28, i2sSd: 30 },
  'STMicroelectronics:stm32:nucleo_f429zi': { i2sWs: 19, i2sSck: 18, i2sSd: 17 },
  'STMicroelectronics:stm32:nucleo_f439zi': { i2sWs: 19, i2sSck: 18, i2sSd: 17 },
}

export function micPinDefaultsForBoard(fqbn: string): MicI2sPins | undefined {
  return MIC_PIN_DEFAULTS_BY_FQBN[fqbn]
}

export function inmp441SupportedForBoard(fqbn: string): boolean {
  return micPinDefaultsForBoard(fqbn) !== undefined
}

/** Capture backend for an exact upload target. Capability and code generation
 * deliberately share this function so the UI cannot enable a board for which
 * the exporter would silently emit a null FastLED input. */
export function inmp441FirmwareBackendForBoard(
  fqbn: string,
): Inmp441FirmwareBackend | undefined {
  if (!inmp441SupportedForBoard(fqbn)) return undefined
  if (fqbn.startsWith('esp32:esp32:')) return 'fastled-esp32'
  if (fqbn.startsWith('teensy:avr:')) return 'fastled-teensy'
  if (fqbn.startsWith('rp2040:rp2040:')) return 'pico-i2s'
  if (fqbn.startsWith('adafruit:samd:')) return 'samd51-zero-i2s'
  if (fqbn.startsWith('STMicroelectronics:stm32:')) return 'stm32-i2s'
  return undefined
}

/** Exact mic-capable FQBN represented by a Board node profile. */
export function inmp441FqbnForBoardProfile(
  profile: { compatibleFqbns: readonly string[] } | undefined,
): string | undefined {
  return profile?.compatibleFqbns.find((fqbn) =>
    inmp441FirmwareBackendForBoard(fqbn) !== undefined)
}

export function inmp441SupportedForBoardProfile(
  profile: { compatibleFqbns: readonly string[] } | undefined,
): boolean {
  return profile?.compatibleFqbns.some(inmp441SupportedForBoard) ?? false
}

/**
 * The board profile's own INMP441 pins, when it carries them.
 *
 * Preferred over the FQBN table because an FQBN names a chip, not a board: a
 * XIAO ESP32S3 and an ESP32-S3-DevKitC-1 are both `esp32:esp32:esp32s3`, and
 * only the profile knows which pads are actually broken out. The table stays as
 * the fallback for boards with no imported profile data.
 */
export function micPinsFromProfile(
  profile: Pick<PhysicalBoardProfile, 'peripheralPins'> | undefined,
): MicI2sPins | undefined {
  const pins = profile?.peripheralPins?.inmp441
  if (!pins) return undefined
  return { i2sWs: pins.wsLrclk, i2sSck: pins.sckBclk, i2sSd: pins.sdDout }
}

/** The selected board's mic pins, read at node-creation time. */
export function micPinDefaultsForSelectedBoard(
  profile?: Pick<PhysicalBoardProfile, 'peripheralPins'>,
): MicI2sPins | undefined {
  return micPinsFromProfile(profile) ?? micPinDefaultsForBoard(useUploadStore.getState().selectedFqbn)
}

const PIN_KEYS = ['i2sWs', 'i2sSck', 'i2sSd'] as const

function samePins(properties: Record<string, unknown>, pins: MicI2sPins): boolean {
  return PIN_KEYS.every((key) => Number(properties[key]) === pins[key])
}

/** True when a MicInput's pins match one of Studio's board starting points. */
export function micPinsAreDefault(properties: Record<string, unknown>): boolean {
  return Object.values(MIC_PIN_DEFAULTS_BY_FQBN).some((pins) => samePins(properties, pins))
}

/** Target-board saved/default pins for retargeting an existing MicInput. */
export function retargetedMicPins(
  properties: Record<string, unknown>,
  nextFqbn: string,
  savedProperties?: Record<string, unknown>,
  profile?: Pick<PhysicalBoardProfile, 'peripheralPins'>,
): MicI2sPins | undefined {
  // Precedence: what the user chose for this board, then the board profile's
  // own pins, then the FQBN table. Their choice wins because a board they have
  // wired differently is a fact about their bench, not a preference to correct.
  const stock = micPinsFromProfile(profile) ?? micPinDefaultsForBoard(nextFqbn)
  if (!stock) return undefined
  const next: MicI2sPins = {
    i2sWs: Number(savedProperties?.i2sWs ?? stock.i2sWs),
    i2sSck: Number(savedProperties?.i2sSck ?? stock.i2sSck),
    i2sSd: Number(savedProperties?.i2sSd ?? stock.i2sSd),
  }
  if (samePins(properties, next)) return undefined
  return next
}
