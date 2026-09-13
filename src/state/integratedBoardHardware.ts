/**
 * Hardware that is part of a controller board rather than wired to it.
 *
 * A CYD's panel is not a module someone chose and connected — it is soldered
 * to the same PCB as the ESP32, on pins nobody picked and nobody can change.
 * Studio's usual answer for a display is to allocate free GPIO from the board's
 * pool, and on a board like this every one of those allocations is wrong: the
 * bench notes for the ESP32-2432S028R record that every pin had to be
 * overridden by hand before anything lit up. So selecting the board materialises
 * its own fitted hardware, and the pin walk treats those pins as already spoken
 * for — both halves of "internal connections survive board selection".
 */

import { NO_PIN } from './boardGpio'

export interface IntegratedTouchDisplay {
  /** The exact board profile this hardware is fitted to. */
  boardProfileId: string
  /** Properties the materialised `TransportDisplay` panel carries, pins included. */
  panelProperties: Record<string, unknown>
}

/** Marks a panel as a board's own fitted hardware rather than a wired module. */
export const INTEGRATED_BOARD_PROFILE_KEY = 'integratedBoardProfileId'

/**
 * ESP32-2432S028R (CYD), USB connector at the bottom.
 *
 * LCD and touch wiring were measured on the repository's bench unit and are
 * recorded in the support matrix. The panel reset is tied to the board's own
 * EN line, so it is `NO_PIN` rather than a GPIO nobody drives; MISO is part of
 * the board's fixed bus even though the write-only driver never reads it.
 * GPIO36 and GPIO39 are input-only pads on a classic ESP32, which is exactly
 * what the touch IRQ and touch MISO need.
 */
export const CYD_TOUCH_DISPLAY: IntegratedTouchDisplay = {
  boardProfileId: 'esp32-2432s028r',
  panelProperties: {
    partId: 'st7789v-xpt2046-touch-240x320',
    sckPin: 14,
    mosiPin: 13,
    misoPin: 12,
    csPin: 15,
    dcPin: 2,
    resetPin: NO_PIN,
    backlightPin: 21,
    touchCsPin: 33,
    touchIrqPin: 36,
    touchSckPin: 25,
    touchMosiPin: 32,
    touchMisoPin: 39,
  },
}

const INTEGRATED_TOUCH_DISPLAYS = new Map(
  [CYD_TOUCH_DISPLAY].map((display) => [display.boardProfileId, display]),
)

export function integratedTouchDisplayForBoard(profileId: string): IntegratedTouchDisplay | null {
  return INTEGRATED_TOUCH_DISPLAYS.get(profileId) ?? null
}

/** The pin properties an integrated display fixes, in no particular order. */
function integratedPinKeys(display: IntegratedTouchDisplay): string[] {
  return Object.entries(display.panelProperties)
    .filter(([, value]) => typeof value === 'number')
    .map(([key]) => key)
}

/**
 * Recognise a panel already wired to this board's fixed pinout.
 *
 * Two cases, one rule: a panel someone overrode by hand before Studio modelled
 * the board (the bench workflow the support matrix describes), and a panel this
 * code placed in an earlier session. Adopting the first is what stops board
 * selection from adding a second copy of hardware that is already there.
 */
export function matchesIntegratedTouchDisplay(
  properties: Record<string, unknown>,
  display: IntegratedTouchDisplay,
): boolean {
  return String(properties.partId ?? '') === String(display.panelProperties.partId)
    && integratedPinKeys(display).every((key) => properties[key] === display.panelProperties[key])
}

/**
 * The pins this node is soldered to on `boardProfileId`, or null if it is not
 * that board's own hardware.
 *
 * Asked by the retarget pass, which has no other way to tell a fitted panel
 * from a breakout: fixed pins must be claimed so the pool routes every other
 * part around them, and never moved, because there is nowhere to move them to.
 * The marker is checked first and the wiring second, so a project saved before
 * the marker existed is still recognised.
 */
export function integratedPinsFor(
  nodeType: string,
  properties: Record<string, unknown>,
  boardProfileId: string,
): Record<string, number> | null {
  if (nodeType !== 'TransportDisplay') return null
  const display = integratedTouchDisplayForBoard(boardProfileId)
  if (!display) return null
  const marked = properties[INTEGRATED_BOARD_PROFILE_KEY] === boardProfileId
  if (!marked && !matchesIntegratedTouchDisplay(properties, display)) return null
  return Object.fromEntries(
    integratedPinKeys(display).map((key) => [key, display.panelProperties[key] as number]),
  )
}
