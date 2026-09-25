// Pure display helper for the upload port, kept apart from the components the
// way capacityFormat.ts is, so every surface that names the port says the same
// thing and the wording is testable without mounting React.
//
// A port being *selected* and a board being *connected* on it are two facts.
// The selection is remembered per project and survives the board being
// unplugged; whether that address is present is only known from the helper's
// last port scan. Saying "COM6" alone for both let a remembered, absent port
// read as a ready one.
import type { BackendHealth, SerialPort } from './backendClient'

/**
 * - `checking` — the helper is still being probed, or no port scan has
 *   finished yet, so presence is not known.
 * - `offline` — the helper is unreachable; nothing can list ports.
 * - `none` — no port is selected.
 * - `disconnected` — a port is selected but the last scan did not find it.
 * - `connected` — the selected port was present in the last scan.
 */
export type PortState = 'checking' | 'offline' | 'none' | 'disconnected' | 'connected'

export interface PortStatus {
  state: PortState
  /** The selected address, or '' when none is. */
  address: string
  /** Short form for chips and headings: `COM6 · connected`,
   *  `COM6 selected · disconnected`, `No port selected`. */
  text: string
  /** One sentence for a readiness row or a tooltip. */
  detail: string
}

export interface PortStatusInput {
  helper: BackendHealth | null | undefined
  selectedPort: string
  ports: SerialPort[]
  /** False until the first port scan after the helper came up has returned;
   *  an empty list before then means "not asked yet", not "nothing there". */
  portsScanned: boolean
}

export function describePort({ helper, selectedPort, ports, portsScanned }: PortStatusInput): PortStatus {
  const address = selectedPort
  // A helper that answers but reports not-ok never scans ports either, so it is
  // as unable to answer as an absent one; treating it as "checking" would wait
  // on a scan that is never coming.
  if (helper === null || helper?.ok === false) {
    return address
      ? { state: 'offline', address, text: `${address} selected · helper offline`, detail: `${address} is selected, but the helper is not running, so Studio cannot tell whether a board is connected to it.` }
      : { state: 'offline', address, text: 'No port · helper offline', detail: 'Start the helper before Studio can list ports.' }
  }
  if (helper === undefined || !portsScanned) {
    return address
      ? { state: 'checking', address, text: `${address} selected · checking`, detail: `Scanning for serial ports to see whether ${address} is connected…` }
      : { state: 'checking', address, text: 'Checking ports', detail: 'Scanning for serial ports…' }
  }
  if (!address) {
    return ports.length
      ? { state: 'none', address, text: 'No port selected', detail: 'Pick the board’s USB/serial port.' }
      : { state: 'none', address, text: 'No port selected', detail: 'No board is connected. Plug the board in over USB, then refresh ports.' }
  }
  const present = ports.find((port) => port.address === address)
  if (!present) {
    return {
      state: 'disconnected',
      address,
      text: `${address} selected · disconnected`,
      detail: `${address} is selected but no board is connected to it. Plug the board in, then refresh ports.`,
    }
  }
  const name = present.label || address
  return { state: 'connected', address, text: `${name} · connected`, detail: `${name} is connected.` }
}
