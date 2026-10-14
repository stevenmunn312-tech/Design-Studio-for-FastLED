// The RS-485 transceiver a DMX512 input is wired through.
//
// `DMXInput` is a graph node with two firmware sources, and only one of them is
// hardware: Art-Net arrives over Wi-Fi and needs no part, while DMX512 arrives
// on an XLR cable and needs a transceiver between the cable and the UART. So
// the transceiver is named here rather than as a `PART_OPTIONS` row — a part
// option would put the module's picture on the node in Art-Net mode too, where
// nothing is wired.
//
// One module today, the common "C25B" MAX485 board. A second (a 3.3 V MAX3485
// board, say) becomes a choice here, not a second copy of the rule below.

export const DMX_TRANSCEIVER_PART_ID = 'max485-rs485-module'

/** The DMX node's firmware sources: two network protocols and the wire. */
export const DMX_INPUT_MODES = ['Art-Net', 'sACN', 'DMX512'] as const
export type DmxInputMode = typeof DMX_INPUT_MODES[number]

export function dmxInputMode(properties: Record<string, unknown>): DmxInputMode {
  const mode = String(properties.inputMode ?? 'Art-Net')
  return (DMX_INPUT_MODES as readonly string[]).includes(mode) ? mode as DmxInputMode : 'Art-Net'
}

/** Whether this DMX node's firmware source is the wired DMX512 receiver. */
export function dmxUsesTransceiver(properties: Record<string, unknown>): boolean {
  return dmxInputMode(properties) === 'DMX512'
}

/** Whether this DMX node receives over the network (Art-Net or sACN): the
 *  modes that need Wi-Fi or Ethernet in firmware and a UDP listener in the
 *  preview helper, so both are held until the workspace is trusted. */
export function dmxUsesNetwork(properties: Record<string, unknown>): boolean {
  return !dmxUsesTransceiver(properties)
}

/** The protocol a network-mode node listens for, or null for the wire. */
export function dmxNetworkProtocol(properties: Record<string, unknown>): 'Art-Net' | 'sACN' | null {
  const mode = dmxInputMode(properties)
  return mode === 'DMX512' ? null : mode
}

/** Each protocol's registered UDP port; the preview port property defaults to it. */
export const DMX_PROTOCOL_PORTS = { 'Art-Net': 6454, sACN: 5568 } as const

/** The UDP port a network-mode node listens on, in the helper and the
 *  sketch: the user's `previewPort`, except that the other protocol's
 *  registered port (the library default, or a value left behind by a switch)
 *  reads as this protocol's own, so changing the mode changes the port. */
export function dmxListenPort(properties: Record<string, unknown>): number {
  const protocol = dmxNetworkProtocol(properties) ?? 'Art-Net'
  const own = DMX_PROTOCOL_PORTS[protocol]
  const raw = Math.round(Number(properties.previewPort))
  if (!Number.isFinite(raw) || raw < 1 || raw > 65535) return own
  const other = protocol === 'sACN' ? DMX_PROTOCOL_PORTS['Art-Net'] : DMX_PROTOCOL_PORTS.sACN
  return raw === other ? own : raw
}

/** The E1.31 multicast group for a universe: 239.255.<hi>.<lo>. */
export function sacnMulticastGroup(universe: number): [number, number, number, number] {
  const u = Math.max(1, Math.min(63999, Math.round(universe)))
  return [239, 255, (u >> 8) & 0xff, u & 0xff]
}
