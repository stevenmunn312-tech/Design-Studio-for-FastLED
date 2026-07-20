import { describe, expect, it } from 'vitest'
import { MidiEngine, type MidiRawEvent } from '../midiEngine'

function bytes(status: number, d1: number, d2?: number): Uint8Array {
  return d2 === undefined ? new Uint8Array([status, d1]) : new Uint8Array([status, d1, d2])
}

describe('MidiEngine raw event parsing', () => {
  it('parses a note-on with channel, number, and normalized velocity', () => {
    const engine = MidiEngine.instance
    const events: MidiRawEvent[] = []
    const unsub = engine.subscribeRaw((e) => events.push(e))
    try {
      // 0x93 = note-on, channel 3 (0-indexed)
      engine.handleMessage(bytes(0x93, 60, 127))
      expect(events).toEqual([{ kind: 'note', channel: 3, number: 60, value: 1 }])
    } finally {
      unsub()
    }
  })

  it('parses a CC message with channel and normalized value', () => {
    const engine = MidiEngine.instance
    const events: MidiRawEvent[] = []
    const unsub = engine.subscribeRaw((e) => events.push(e))
    try {
      // 0xB5 = control change, channel 5
      engine.handleMessage(bytes(0xb5, 74, 64))
      expect(events).toEqual([{ kind: 'cc', channel: 5, number: 74, value: 64 / 127 }])
    } finally {
      unsub()
    }
  })

  it('does not emit a raw event for note-off (velocity-zero release)', () => {
    const engine = MidiEngine.instance
    const events: MidiRawEvent[] = []
    const unsub = engine.subscribeRaw((e) => events.push(e))
    try {
      engine.handleMessage(bytes(0x80, 60, 0)) // note-off
      engine.handleMessage(bytes(0x90, 60, 0)) // note-on with velocity 0 == release
      expect(events).toHaveLength(0)
    } finally {
      unsub()
    }
  })

  it('ignores malformed or unrecognized messages without throwing', () => {
    const engine = MidiEngine.instance
    expect(() => engine.handleMessage(null)).not.toThrow()
    expect(() => engine.handleMessage(new Uint8Array([0x90]))).not.toThrow()
    expect(() => engine.handleMessage(bytes(0xa0, 1, 2))).not.toThrow() // aftertouch, unhandled type
  })

  it('stops delivering events after unsubscribing', () => {
    const engine = MidiEngine.instance
    const events: MidiRawEvent[] = []
    const unsub = engine.subscribeRaw((e) => events.push(e))
    unsub()
    engine.handleMessage(bytes(0xb0, 1, 1))
    expect(events).toHaveLength(0)
  })
})
