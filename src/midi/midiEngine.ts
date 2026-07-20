// Thin singleton wrapper around the Web MIDI API. Listens to every connected
// input device and keeps the latest note-on velocity / CC value per number,
// the same "always-on global listener, nodes just read a snapshot" shape as
// AudioEngine. Preview-only — there is no embedded-hardware equivalent, so
// this never feeds codegen.

export interface MidiSnapshot {
  supported: boolean
  active: boolean
  noteVelocity: Map<number, number>  // 0–1, keyed by MIDI note number
  ccValues: Map<number, number>      // 0–1, keyed by MIDI CC number
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
  private active = false
  private started = false

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
    if (this.started) return
    this.started = true
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (!nav?.requestMIDIAccess) return
    nav.requestMIDIAccess()
      .then((access) => {
        const attach = (input: MIDIInput) => {
          input.onmidimessage = (e) => this.handleMessage(e.data)
        }
        access.inputs.forEach(attach)
        access.onstatechange = () => access.inputs.forEach(attach)
        this.active = true
        this.emit()
      })
      .catch(() => { /* denied or unsupported — nodes stay at their idle default */ })
  }

  /** Public so it can be driven directly in tests (and by the
   *  `input.onmidimessage` assignment above) — not part of the steady-state
   *  subscribe() API, which stays the snapshot shape. */
  handleMessage(data: Uint8Array | null) {
    if (!data || data.length < 2) return
    const type = data[0] & 0xf0
    const channel = data[0] & 0x0f
    const d1 = data[1]
    const d2 = data.length > 2 ? data[2] : 0
    if (type === 0x90 && d2 > 0) {
      this.noteVelocity.set(d1, d2 / 127)
      this.emitRaw({ kind: 'note', channel, number: d1, value: d2 / 127 })
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      this.noteVelocity.set(d1, 0)
      // Note-off intentionally not emitted as a raw learn-capture event.
    } else if (type === 0xb0) {
      this.ccValues.set(d1, d2 / 127)
      this.emitRaw({ kind: 'cc', channel, number: d1, value: d2 / 127 })
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
    }
  }
}
