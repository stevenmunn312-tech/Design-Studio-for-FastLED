import type { SerialPort } from '../utils/backendClient'
import type { SerialRoute } from './controllerSettings'

export type InferredSerialRoute = Exclude<SerialRoute, 'auto'> | null

const ESPRESSIF_USB_VID = 0x303a
const UART_BRIDGE_VIDS = new Set([
  0x0403, // FTDI
  0x067b, // Prolific
  0x10c4, // Silicon Labs CP210x
  0x1a86, // WCH CH34x/CH91xx
])

/** Identify which physical USB path owns a serial port without opening it.
 *  VID is the strongest signal; the text fallback covers drivers that omit it.
 *  Unknown devices deliberately stay unknown so a custom USB descriptor is
 *  never mistaken for a UART bridge. */
export function inferSerialRoute(port: SerialPort | undefined): InferredSerialRoute {
  if (!port) return null
  if (port.vid === ESPRESSIF_USB_VID) return 'native'
  if (typeof port.vid === 'number' && UART_BRIDGE_VIDS.has(port.vid)) return 'uart'

  const identity = [
    port.label, port.manufacturer, port.product, port.interface, port.hwid,
  ].filter(Boolean).join(' ').toLowerCase()
  if (/espressif|usb[ -]jtag|usb serial\/jtag/.test(identity)) return 'native'
  if (/cp210|ch340|ch341|ch343|ch910|ftdi|ft232|prolific|usb.?to.?uart|usb.?serial bridge/.test(identity)) {
    return 'uart'
  }
  return null
}

export function resolveUsbCdcOnBoot(route: SerialRoute, port: SerialPort | undefined): boolean {
  if (route === 'native') return true
  if (route === 'uart') return false
  return inferSerialRoute(port) === 'native'
}

export function serialRouteSummary(route: SerialRoute, port: SerialPort | undefined): string {
  if (route === 'native') return 'Native USB (manual)'
  if (route === 'uart') return 'UART bridge (manual)'
  const inferred = inferSerialRoute(port)
  if (inferred === 'native') return 'Auto · native USB detected'
  if (inferred === 'uart') return 'Auto · UART bridge detected'
  return 'Auto · unknown port, using UART bridge'
}
