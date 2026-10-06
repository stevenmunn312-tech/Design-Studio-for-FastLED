import type { PhysicalBoardProfile } from './boardProfiles'
import { BOARD_GPIO_BY_FQBN, type BoardGpio } from './boardGpio'

/**
 * The GPIO table pin advice reads for the selected board.
 *
 * A custom board's table already combines its exposed slots, the module's
 * reviewed constraints and the chip's capabilities, so it replaces the target
 * table outright — even when it is empty.
 */
export function boardPinTable(profile: PhysicalBoardProfile | undefined, fqbn: string): BoardGpio | undefined {
  return profile?.custom ? profile.custom.gpio : BOARD_GPIO_BY_FQBN[fqbn]
}

/**
 * Whether the profile states its pin pool exhaustively.
 *
 * A stock profile with an empty safe list keeps its historical meaning —
 * unknown exposure, so callers fall back to the chip table. A custom board's
 * pool is always explicit: an empty one means no pin, never every pin.
 */
export function boardHasExplicitPinPool(profile: PhysicalBoardProfile | undefined): boolean {
  return !!profile?.custom || !!profile?.pinSafety?.safeGeneralPurpose.length
}

/**
 * Whether a preferred starting assignment (a peripheral's default bus or the
 * chip's I2S/SD defaults) can be used on this board as it stands.
 *
 * Stock defaults were reviewed against their own boards. On a custom board a
 * default is only a suggestion until every pin is one of its enabled GPIOs;
 * otherwise the caller allocates from the pool or reports the missing pads.
 */
export function boardOffersPins(
  profile: PhysicalBoardProfile | undefined,
  /** Pin property values, such as `{ sdaPin, sclPin }`. */
  pins: object,
): boolean {
  const table = profile?.custom?.gpio
  if (!table) return true
  return Object.values(pins).every((pin) => table.recommended.some((note) => note.pin === pin))
}
