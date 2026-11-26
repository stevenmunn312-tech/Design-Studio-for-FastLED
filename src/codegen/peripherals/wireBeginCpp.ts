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

/**
 * Set the Board's I2C speed after each bus start in a finished sketch.
 *
 * A text pass, like `withLoopPacing`: `Wire.begin` is written by the normal
 * sketch, the control graph, the RTC and each generator's display setup, and
 * the speed belongs to none of them. `hz` is null at the cores' own 100 kHz
 * default, where the sketch is left as it was.
 */
export function withI2cClock(source: string, hz: number | null): string {
  if (hz === null) return source
  const lines = source.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const begin = /^(\s*)Wire\.begin\([^)]*\);/.exec(lines[i])
    if (begin && !lines[i + 1]?.includes('Wire.setClock(')) {
      lines.splice(i + 1, 0, `${begin[1]}Wire.setClock(${hz});  // I2C speed, set on the Board`)
    }
  }
  return lines.join('\n')
}
