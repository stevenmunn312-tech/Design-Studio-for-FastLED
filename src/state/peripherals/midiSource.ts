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

/** DIN MIDI's fixed serial speed. */
export const MIDI_BAUD = 31250

/** 0 listens on every channel (omni); 1–16 one channel. */
export function midiChannel(value: unknown): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(16, n)) : 0
}
