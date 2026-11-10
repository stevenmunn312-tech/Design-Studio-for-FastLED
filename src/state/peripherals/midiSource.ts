import type { StudioNode } from '../graphStore'

/**
 * The MIDI node's firmware sources. Web MIDI is the browser's and never
 * deploys; a DIN jack does, so validation, the board partition and the
 * emitter all ask here which the node is.
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
 * The interface a DIN-mode node reads: Adafruit's MIDI FeatherWing (product
 * 4740), whose H11L1MS optocoupler isolates the cable and drives the board's RX
 * from the wing's own 3V pull-up, so no divider is needed.
 *
 * It is a bench part of its own (`MidiInterface`, hidden on the canvas, no
 * ports), as the DS3231 is for a Clock and a Microphone for Audio: the MIDI
 * node keeps the source choice and the outputs, and the wing carries only
 * which module it is and its RX GPIO. Every DIN-mode MIDI node on a board
 * reads its one jack through one shared reader, on the UART the allocator
 * gives it (build/pins/uartAssignment.ts).
 */
export const MIDI_DIN_PART_ID = 'adafruit-midi-featherwing'
export const MIDI_INTERFACE_NODE_TYPE = 'MidiInterface'

/** The DIN interface on the bench: the provider every DIN-mode MIDI node on the board reads. */
export function midiInterfaceIn<T extends Pick<StudioNode, 'data'>>(nodes: readonly T[]): T | null {
  return nodes.find((node) => node.data.nodeType === MIDI_INTERFACE_NODE_TYPE) ?? null
}

/** The MIDI nodes in `nodes` that read the DIN jack. */
export function dinMidiInputs<T extends Pick<StudioNode, 'data'>>(nodes: readonly T[]): T[] {
  return nodes.filter((node) => node.data.nodeType === 'MidiInput'
    && midiUsesUart(node.data.properties as Record<string, unknown>))
}

/** DIN MIDI's fixed serial speed. */
export const MIDI_BAUD = 31250

/** 0 listens on every channel (omni); 1–16 one channel. */
export function midiChannel(value: unknown): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(16, n)) : 0
}
