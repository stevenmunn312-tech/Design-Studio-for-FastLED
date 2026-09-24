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

/** Whether this DMX node's firmware source is the wired DMX512 receiver. */
export function dmxUsesTransceiver(properties: Record<string, unknown>): boolean {
  return String(properties.inputMode ?? 'Art-Net') === 'DMX512'
}
