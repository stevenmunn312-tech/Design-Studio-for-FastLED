/**
 * Hand-authored pin safety for boards the asset manifests do not describe.
 *
 * Every other board's `pinSafety` is imported from its Blender asset's
 * `pinSafetySummary` (see `scripts/assets/import-board-assets.py`). A board package
 * that carries no such summary arrives with no safety data at all, and a
 * profile with none is not merely undecorated: `safeGeneralPurpose` is the
 * allowlist `assignPartPins` draws candidates from, so with the field absent
 * the allocator falls back to the chip-level GPIO table and offers pins the
 * board never brings out — on the CYD, GPIO1, which is its USB-serial TX.
 *
 * This is the same shape as `boardI2cDefaults.ts`: a fact about a physical
 * board that lives in the app because the manifests cannot see it. It wins
 * over imported data for the same reason a hand-authored profile does — it has
 * been checked against a board, and the import has not.
 */

import type { BoardPinSafety } from './boardCapabilities'
import { CLASSIC_ESP32_RAM_BUDGET_BYTES } from '../ramBudgets'
import { NO_PIN } from './boardGpio'
import { CYD_SD_PINS, integratedTouchDisplayForBoard } from './integratedBoardHardware'

export interface AuthoredBoardPinSafety {
  pinSafety: BoardPinSafety
  /** Prose shown beside the pin list. Displayed, never parsed for pin numbers. */
  safetyNotes?: string[]
  /**
   * Graph-allocation ceiling, for an imported profile that has been measured.
   *
   * An imported board normally carries no budget and falls back to the
   * advisory warning, because guessing a limit is worse than asking the
   * compiler. This field is for the case that is no longer a guess: a board
   * someone has actually put on a bench.
   */
  internalRamBudgetBytes?: number
}

/** `touchMisoPin` → `touch miso`, so a derived reason reads as a sentence. */
function pinPropertyLabel(key: string): string {
  return key.replace(/Pin$/, '').replace(/([A-Z])/g, ' $1').toLowerCase().trim()
}

/**
 * The pins a board's own fitted hardware occupies, derived from the one place
 * that wiring is stated rather than restated here.
 *
 * `integratedBoardHardware.ts` is already the authority — `selectBoardProfile`
 * materialises the panel from it and `pinRetarget` claims those pins from it —
 * so a bench rerun that corrects a pin there corrects this table with it. A
 * line the board ties off-GPIO carries `NO_PIN` and is skipped: nothing is
 * reserved, because no GPIO is involved.
 */
function fittedHardwarePins(boardProfileId: string): Record<number, string> {
  const display = integratedTouchDisplayForBoard(boardProfileId)
  if (!display) return {}
  const reserved: Record<number, string> = {}
  for (const [key, value] of Object.entries(display.panelProperties)) {
    if (typeof value !== 'number' || value === NO_PIN) continue
    reserved[value] = `Wired to this board's own touch display (${pinPropertyLabel(key)}).`
  }
  return reserved
}

/**
 * ESP32-2432S028R ("CYD").
 *
 * The imported pin map is the authority for what this board brings out, and it
 * brings out four GPIO pads — 35, 22, 21 and 27 — beside TX, RX and the power
 * rails. Two of those four are spoken for: GPIO21 drives the fitted panel's
 * backlight, and GPIO35 is input-only on a classic ESP32, so a part told to
 * drive it would sit there doing nothing. That leaves GPIO22 and GPIO27 as the
 * pool, which is small because the board is small — it is a screen with a
 * controller behind it, not a devkit.
 *
 * Deliberately not recorded here: this board's onboard microSD slot, RGB LED,
 * light sensor and speaker amplifier. Their pins are well documented for the
 * family but have not been measured on the bench unit, and the allowlist
 * already keeps them out of the allocator's reach — an unmeasured pin is
 * better left `unknown` than described wrongly.
 */
const CYD_PROFILE_ID = 'esp32-2432s028r'

const CYD_PIN_SAFETY: AuthoredBoardPinSafety = {
  /*
   * Measured on this board, 2026-09-22, rather than inherited or guessed.
   *
   * Its classic-ESP32 siblings declare the same 96 KiB; the CYD had no budget
   * at all, which meant the one board in the catalogue with a screen soldered
   * to it was the one nothing checked. It was held that way deliberately while
   * HW-25 was measured — a refusal before the compile is a refusal before the
   * measurement — and the measurement is now in:
   * [the bench](../../docs/development/testing/display-budget-bench.md) has a
   * 14-widget custom screen running here on 106,368 bytes of static RAM with
   * 238,564 free, flat.
   */
  internalRamBudgetBytes: CLASSIC_ESP32_RAM_BUDGET_BYTES,
  pinSafety: {
    safeGeneralPurpose: [22, 27],
    useWithCaution: {
      35: 'Input-only pad on a classic ESP32. Readable — a button or an analog sensor is fine — but nothing the sketch has to drive.',
    },
    boardReservedOrNotExposed: {
      ...fittedHardwarePins(CYD_PROFILE_ID),
      // Measured 2026-09-22, not copied — see `CYD_SD_PINS`. Derived from that
      // one map so a bench correction there carries through to the advice.
      ...Object.fromEntries(Object.entries(CYD_SD_PINS).map(([key, pin]) => [
        pin,
        `Wired to this board's own microSD slot (${pinPropertyLabel(key.replace(/^sd/, ''))}).`,
      ])),
      1: 'UART0 TX, wired to the onboard USB-serial bridge that uploads and the serial console use.',
      3: 'UART0 RX, wired to the onboard USB-serial bridge that uploads and the serial console use.',
    },
  },
  safetyNotes: [
    'This board brings out four GPIO pads — GPIO35, GPIO22, GPIO21 and GPIO27 — on its JST connectors. Every other GPIO is either soldered to the board’s own hardware or not brought out at all.',
    'GPIO21 is the fitted panel’s backlight, so the board’s default I2C bus is GPIO27/GPIO22 rather than the classic ESP32 GPIO21/GPIO22.',
    'The onboard microSD slot is GPIO5/GPIO18/GPIO19/GPIO23, measured on a bench unit. It is the second SPI host, so the card and the fitted panel never share a bus.',
    'The RGB LED, light sensor and speaker amplifier have not been confirmed on a bench unit, so their pins carry no advice here. The amplifier is analog, and the internal-DAC path it would need does not work on this core, so its pins would not help.',
  ],
}

const MINI1_FLASH = 'Connected to flash inside the ESP32-MINI-1.'
const NOT_BROUGHT_OUT = 'Not brought out on this board.'
const TIED_TO_GROUND = 'Tied to ground on this board.'
const shifted = (name: string) =>
  `${name} is a unidirectional 5 V output through a 74LVC2G34. It cannot be an input.`

/**
 * Adafruit Sparkle Motion, PID 6100.
 *
 * The schematic is the pin authority. SIG1-SIG4 are buffered outputs, STEMMA
 * QT is GPIO14/GPIO13, and GPIO9/GPIO10 are real pads on the ESP32-MINI-1
 * even though a WROOM module uses those numbers for flash. The microphone,
 * IR receiver, NeoPixel, red LED and boot button are soldered down.
 */
const SPARKLE_MOTION_PIN_SAFETY: AuthoredBoardPinSafety = {
  pinSafety: {
    safeGeneralPurpose: [18, 27, 13, 14, 9, 10],
    useWithCaution: {
      21: shifted('SIG1'),
      22: shifted('SIG2'),
      19: shifted('SIG3'),
      23: shifted('SIG4'),
    },
    boardReservedOrNotExposed: {
      0: 'Onboard BOOT button and the auto-reset circuit. Not a header pad.',
      1: 'UART0 TX to the CH343 USB-serial bridge. The back pad is a debug console.',
      2: 'Onboard NeoPixel. Not a header pad.',
      3: 'UART0 RX to the CH343 USB-serial bridge. The back pad is a debug console.',
      4: 'Onboard red LED. Not a header pad.',
      5: NOT_BROUGHT_OUT,
      6: MINI1_FLASH,
      7: MINI1_FLASH,
      8: MINI1_FLASH,
      11: MINI1_FLASH,
      12: NOT_BROUGHT_OUT,
      15: NOT_BROUGHT_OUT,
      16: 'Not brought out of the ESP32-MINI-1.',
      17: 'Not brought out of the ESP32-MINI-1.',
      25: 'Onboard ICS-43434 microphone DATA. Not a header pad.',
      26: 'Onboard ICS-43434 microphone BCLK. Not a header pad.',
      32: 'Onboard IR receiver. Not a header pad.',
      33: 'Onboard ICS-43434 microphone WS. Not a header pad.',
      34: TIED_TO_GROUND,
      35: TIED_TO_GROUND,
      36: TIED_TO_GROUND,
      37: TIED_TO_GROUND,
      38: TIED_TO_GROUND,
      39: TIED_TO_GROUND,
    },
  },
  safetyNotes: [
    'SIG1 to SIG4 (GPIO21, GPIO22, GPIO19, GPIO23) are 5 V outputs only. The + terminals pass the 5-24 V input through the fuse; they are not a regulated 5 V rail.',
    'STEMMA QT is SDA GPIO14 and SCL GPIO13. The HUSB238 USB-PD chip uses address 0x08 on that bus.',
    'GPIO9 and GPIO10 are Serial1 on this ESP32-MINI-1. A generic ESP32 table calls them flash pins because that is true of a WROOM module.',
    'The ICS-43434 microphone is DATA GPIO25, BCLK GPIO26 and WS GPIO33. The IR receiver is GPIO32, the NeoPixel is GPIO2, the red LED is GPIO4, and the boot button is GPIO0. WLED\'s audio usermod calls this microphone SPH0654.',
  ],
}

/**
 * Adafruit Sparkle Motion Mini, PID 6160.
 *
 * USB-C is the only supply. GPIO32 and GPIO33 are the buffered LED pads.
 * GPIO9, GPIO10 and GPIO23 belong to the onboard microphone and are not pads.
 */
const SPARKLE_MOTION_MINI_PIN_SAFETY: AuthoredBoardPinSafety = {
  pinSafety: {
    safeGeneralPurpose: [25, 26, 27, 14, 13, 19, 22],
    useWithCaution: {
      32: shifted('SIG1'),
      33: shifted('SIG2'),
    },
    boardReservedOrNotExposed: {
      0: 'Onboard BOOT button and the auto-reset circuit. Not a header pad.',
      1: 'UART0 TX to the CH343 USB-serial bridge.',
      2: NOT_BROUGHT_OUT,
      3: 'UART0 RX to the CH343 USB-serial bridge.',
      4: NOT_BROUGHT_OUT,
      5: 'Tied to 3.3 V on this board.',
      6: MINI1_FLASH,
      7: MINI1_FLASH,
      8: MINI1_FLASH,
      9: 'Onboard ICS-43434 microphone DATA. Not a header pad.',
      10: 'Onboard ICS-43434 microphone WS. Not a header pad.',
      11: MINI1_FLASH,
      12: 'Onboard red LED, active high. GPIO12 is also a boot strap, so it is not a header pad.',
      15: NOT_BROUGHT_OUT,
      16: 'Not brought out of the ESP32-MINI-1.',
      17: 'Not brought out of the ESP32-MINI-1.',
      18: 'Onboard NeoPixel. Not a header pad.',
      21: NOT_BROUGHT_OUT,
      23: 'Onboard ICS-43434 microphone BCLK. Not a header pad.',
      34: TIED_TO_GROUND,
      35: TIED_TO_GROUND,
      36: TIED_TO_GROUND,
      37: TIED_TO_GROUND,
      38: TIED_TO_GROUND,
      39: TIED_TO_GROUND,
    },
  },
  safetyNotes: [
    'GPIO32 and GPIO33 are the 5 V LED pads. The 5 V pad is fused USB power for those LEDs; the board itself is powered from USB-C.',
    'STEMMA QT is SDA GPIO19 and SCL GPIO22.',
    'The ICS-43434 microphone is DATA GPIO9, WS GPIO10 and BCLK GPIO23. The NeoPixel is GPIO18, the red LED is GPIO12, and the boot button is GPIO0. WLED\'s audio usermod calls this microphone SPH0654.',
  ],
}

export const BOARD_PIN_SAFETY_OVERRIDES: Readonly<Record<string, AuthoredBoardPinSafety>> = {
  [CYD_PROFILE_ID]: CYD_PIN_SAFETY,
  'adafruit-sparkle-motion': SPARKLE_MOTION_PIN_SAFETY,
  'adafruit-sparkle-motion-mini': SPARKLE_MOTION_MINI_PIN_SAFETY,
}

export function boardPinSafetyOverride(
  profileId: string | undefined,
): AuthoredBoardPinSafety | undefined {
  return profileId ? BOARD_PIN_SAFETY_OVERRIDES[profileId] : undefined
}
