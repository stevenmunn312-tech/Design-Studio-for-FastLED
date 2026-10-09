import { boardPinVerdict, type PhysicalBoardProfile } from './boardProfiles'
import { BOARD_GPIO_BY_FQBN, type BoardGpio, type GpioCapability } from './boardGpio'

const DIGITAL_IO: readonly GpioCapability[] = ['digitalInput', 'digitalOutput', 'pullup']

/**
 * The GPIO table pin advice reads for the selected board.
 *
 * A custom board's table already combines its exposed slots, the module's
 * reviewed constraints and the chip's capabilities, so it replaces the target
 * table outright — even when it is empty.
 *
 * A stock profile can also expose a pad the generic module table calls
 * unavailable. ESP32-MINI-1 brings GPIO9 and GPIO10 out to a header, while
 * the classic ESP32 table marks GPIO6-11 as flash because that is true of a
 * WROOM module, and both boards share `esp32:esp32:esp32`. A pin this profile
 * exposes and does not reserve is a real pad, so the picker and the chip
 * check treat it as ordinary digital GPIO.
 */
export function boardPinTable(profile: PhysicalBoardProfile | undefined, fqbn: string): BoardGpio | undefined {
  if (profile?.custom) return profile.custom.gpio
  const table = BOARD_GPIO_BY_FQBN[fqbn]
  if (!table || !profile?.pins?.length) return table
  const rescued = profile.pins.filter((pin) => {
    if (pin.gpio === undefined || pin.availability === 'unavailable') return false
    if (!table.caution.some((note) => note.pin === pin.gpio)) return false
    const standing = boardPinVerdict(profile, pin.gpio).standing
    return standing === 'safe' || standing === 'caution'
  })
  if (rescued.length === 0) return table
  const rescuedGpios = new Set(rescued.map((pin) => pin.gpio))
  return {
    recommended: [
      ...table.recommended,
      ...rescued.map((pin) => ({
        pin: pin.gpio as number,
        label: pin.label,
        note: pin.note,
        capabilities: DIGITAL_IO,
      })),
    ].sort((left, right) => left.pin - right.pin),
    caution: table.caution.filter((note) => !rescuedGpios.has(note.pin)),
    maxPin: table.maxPin,
  }
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
