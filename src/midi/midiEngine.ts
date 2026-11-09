// Thin singleton wrapper around the Web MIDI API. Listens to every connected
// input device and keeps the latest note-on velocity / CC value per number,
// the same "always-on global listener, nodes just read a snapshot" shape as
// AudioEngine. Preview-only — there is no embedded-hardware equivalent, so
// this never feeds codegen.

export interface MidiSnapshot {
  supported: boolean
  active: boolean
  noteVelocity: Map<number, number>  // 0–1, keyed by MIDI note number, the latest on any channel
  ccValues: Map<number, number>      // 0–1, keyed by MIDI CC number, the latest on any channel
  /** The same per channel, keyed by `midiChannelKey(channel 1–16, number)`. */
  channelNoteVelocity: Map<number, number>
  channelCcValues: Map<number, number>
}

/** Key into the per-channel maps: a channel numbered 1–16, as the MIDI node
 *  counts them, and a note or controller number. */
export function midiChannelKey(channel: number, number: number): number {
  return channel * 128 + number
}

/**
 * What a MIDI node reads for its note and controller. Channel 0 is omni, the
 * latest message on any channel, and 1–16 only that channel's, the sketch's
 * filter (`_ch != channel`), so two nodes on different channels behave in
 * the preview as they will on the board.
 */
export function midiReading(
  snapshot: Pick<MidiSnapshot, 'noteVelocity' | 'ccValues' | 'channelNoteVelocity' | 'channelCcValues'>,
  channel: number,
  note: number,
  cc: number,
): { velocity: number; cc: number } {
  if (channel === 0) {
    return { velocity: snapshot.noteVelocity.get(note) ?? 0, cc: snapshot.ccValues.get(cc) ?? 0 }
  }
  return {
    velocity: snapshot.channelNoteVelocity.get(midiChannelKey(channel, note)) ?? 0,
    cc: snapshot.channelCcValues.get(midiChannelKey(channel, cc)) ?? 0,
  }
}

/** One raw MIDI event, exposed for one-shot "learn" capture (Performance
 *  Control Deck's MIDI-learn) — not part of the steady-state snapshot above,
 *  which stays note/cc-number-keyed for the existing MidiInput node. Note-off
 *  is not exposed here (matches noteVelocity's existing zero-on-release
 *  semantics — there's nothing to "learn" from a key release). */
export interface MidiRawEvent {
  kind: 'cc' | 'note'
  channel: number // 0-15
  number: number  // CC number or note number, 0-127
  value: number   // 0-1 normalized (velocity or CC value)
}

type Listener = (snapshot: MidiSnapshot) => void
type RawListener = (event: MidiRawEvent) => void

export class MidiEngine {
  private static _instance: MidiEngine | null = null
  static get instance(): MidiEngine {
    if (!this._instance) this._instance = new MidiEngine()
    return this._instance
  }

  private listeners = new Set<Listener>()
  private rawListeners = new Set<RawListener>()
  private noteVelocity = new Map<number, number>()
  private ccValues = new Map<number, number>()
  private channelNoteVelocity = new Map<number, number>()
  private channelCcValues = new Map<number, number>()
  private active = false
  // True once Web MIDI access was granted and the inputs are attached. A
  // request that is still pending is tracked separately so two subscribers
  // in the same tick share one permission prompt, while a denied request
  // leaves both clear and the next subscriber asks again.
  private started = false
  private starting = false

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    this.ensureStarted()
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  /** Subscribe to individual raw CC/note-on events (not accumulated state) —
   *  for MIDI-learn capture, which needs "the next single message," not "the
   *  current value of everything." */
  subscribeRaw(fn: RawListener): () => void {
    this.rawListeners.add(fn)
    this.ensureStarted()
    return () => this.rawListeners.delete(fn)
  }

  private ensureStarted() {
    if (this.started || this.starting) return
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (!nav?.requestMIDIAccess) return
    this.starting = true
    nav.requestMIDIAccess()
      .then((access) => {
        this.started = true
        const attach = (input: MIDIInput) => {
          input.onmidimessage = (e) => this.handleMessage(e.data)
        }
        access.inputs.forEach(attach)
        access.onstatechange = (event) => {
          access.inputs.forEach(attach)
          // A device unplugged mid-note never sends its note-off, so every
          // note it was holding would stay at its velocity until the device
          // came back and released it.
          if (event.port?.state === 'disconnected') this.releaseHeldNotes()
        }
        this.active = true
        this.emit()
      })
      .catch(() => { /* denied or unsupported — nodes stay at their idle default */ })
      .finally(() => { this.starting = false })
  }

  private releaseHeldNotes() {
    let released = false
    for (const map of [this.noteVelocity, this.channelNoteVelocity]) {
      for (const [key, velocity] of map) {
        if (velocity === 0) continue
        map.set(key, 0)
        released = true
      }
    }
    if (released) this.emit()
  }

  /** Public so it can be driven directly in tests (and by the
   *  `input.onmidimessage` assignment above) — not part of the steady-state
   *  subscribe() API, which stays the snapshot shape. */
  handleMessage(data: Uint8Array | null) {
    this.apply(data, true)
  }

  /**
   * A message from the MIDI node's own note pad and CC slider, the stand-in
   * for a controller while designing. It reaches every node as a device's
   * would, but never a MIDI-learn capture, which is listening for hardware.
   */
  play(data: Uint8Array) {
    this.apply(data, false)
  }

  private apply(data: Uint8Array | null, raw: boolean) {
    if (!data || data.length < 2) return
    const type = data[0] & 0xf0
    const channel = data[0] & 0x0f
    const d1 = data[1]
    const d2 = data.length > 2 ? data[2] : 0
    const key = midiChannelKey(channel + 1, d1)
    if (type === 0x90 && d2 > 0) {
      this.noteVelocity.set(d1, d2 / 127)
      this.channelNoteVelocity.set(key, d2 / 127)
      if (raw) this.emitRaw({ kind: 'note', channel, number: d1, value: d2 / 127 })
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      this.noteVelocity.set(d1, 0)
      this.channelNoteVelocity.set(key, 0)
      // Note-off intentionally not emitted as a raw learn-capture event.
    } else if (type === 0xb0) {
      this.ccValues.set(d1, d2 / 127)
      this.channelCcValues.set(key, d2 / 127)
      if (raw) this.emitRaw({ kind: 'cc', channel, number: d1, value: d2 / 127 })
    } else {
      return
    }
    this.emit()
  }

  private emitRaw(event: MidiRawEvent) {
    this.rawListeners.forEach((fn) => fn(event))
  }

  private emit() {
    const snapshot = this.snapshot()
    this.listeners.forEach((fn) => fn(snapshot))
  }

  private snapshot(): MidiSnapshot {
    return {
      supported: typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess,
      active: this.active,
      noteVelocity: new Map(this.noteVelocity),
      ccValues: new Map(this.ccValues),
      channelNoteVelocity: new Map(this.channelNoteVelocity),
      channelCcValues: new Map(this.channelCcValues),
    }
  }
}
