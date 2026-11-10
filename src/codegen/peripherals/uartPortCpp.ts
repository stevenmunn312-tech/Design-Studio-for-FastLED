import type { UartPort } from '../../build/pins/uartAssignment'

/**
 * A declaration that opens the allocated UART (build/pins/uartAssignment.ts).
 *
 * The generator is not told which ESP32 it builds for, so where the classic
 * ESP32/S3 and the one-UART chips would open different ports the sketch picks
 * with the chip's own macro, exactly as the DFPlayer driver does. One line
 * when both agree.
 */
export function uartPortDeclarationCpp(
  ports: { twoUart: UartPort; oneUart: UartPort },
  declare: (port: UartPort) => string,
): string[] {
  if (ports.twoUart === ports.oneUart) return [declare(ports.twoUart)]
  return [
    '#if defined(CONFIG_IDF_TARGET_ESP32) || defined(CONFIG_IDF_TARGET_ESP32S3)',
    declare(ports.twoUart),
    '#else',
    declare(ports.oneUart),
    '#endif',
  ]
}
