/**
 * The MIDI node's firmware sources. Web MIDI is the browser's and never
 * deploys; a DIN jack on a UART does, so validation, pin registration and
 * the emitter all ask here which the node is.
 */
export const MIDI_SOURCES = ['Web MIDI', 'DIN (UART)'] as const
export type MidiSource = typeof MIDI_SOURCES[number]

export function midiSource(properties: Record<string, unknown>): MidiSource {
  return properties.midiSource === 'DIN (UART)' ? 'DIN (UART)' : 'Web MIDI'
}

/** Whether this MIDI node reads a DIN jack on the board. */
export function midiUsesUart(properties: Record<string, unknown>): boolean {
  return midiSource(properties) === 'DIN (UART)'
}

/**
 * The interface a DIN-mode node is drawn as: Adafruit's MIDI FeatherWing
 * (product 4740), whose H11L1MS optocoupler isolates the cable and drives the
 * board's RX from the wing's own 3V pull-up, so no divider is needed. Named
 * here rather than as a `PART_OPTIONS` row for the reason the DMX transceiver
 * is: a part option would put the wing on the node in Web MIDI mode too.
 */
export const MIDI_DIN_PART_ID = 'adafruit-midi-featherwing'

/** DIN MIDI's fixed serial speed. */
export const MIDI_BAUD = 31250

/** 0 listens on every channel (omni); 1–16 one channel. */
export function midiChannel(value: unknown): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(16, n)) : 0
}
