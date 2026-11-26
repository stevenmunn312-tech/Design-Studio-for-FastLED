/**
 * The sketch's one `Wire.begin`, for the generators that have no I2C pin plan
 * of their own (the control graph, and a show's or screen sketch's displays).
 *
 * Only the ESP cores take the SDA and SCL pins as arguments. AVR, megaAVR,
 * Renesas, RP2040 and Teensy have no such overload, so the call does not
 * compile; on the Adafruit SAMD core `begin(uint8_t, bool)` matches instead
 * and starts the board as an I2C peripheral at the SDA pin's number. Those
 * boards have one fixed bus, started with no arguments.
 */
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'

export const WIRE_BEGIN_DEFAULT_CPP = '  Wire.begin();  // I2C parts on the board\'s default SDA/SCL pins'

/** Whether the selected board's `Wire.begin` accepts pins. No Board node keeps the pins, as the ESP default. */
export function boardTakesWirePins(nodes: Parameters<typeof selectedPhysicalBoardProfile>[0]): boolean {
  const board = selectedPhysicalBoardProfile(nodes)
  return !board || board.targetFamilies.some((family) => family === 'esp8266' || family.startsWith('esp32'))
}

export function wireBeginCpp(
  nodes: Parameters<typeof selectedPhysicalBoardProfile>[0], sdaPin: number, sclPin: number, note: string,
): string {
  return boardTakesWirePins(nodes) ? `  Wire.begin(${sdaPin}, ${sclPin});  // ${note}` : WIRE_BEGIN_DEFAULT_CPP
}
