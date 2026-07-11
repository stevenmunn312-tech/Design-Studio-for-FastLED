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

type Listener = (snapshot: MidiSnapshot) => void

export class MidiEngine {
  private static _instance: MidiEngine | null = null
  static get instance(): MidiEngine {
    if (!this._instance) this._instance = new MidiEngine()
    return this._instance
  }

  private listeners = new Set<Listener>()
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

  private handleMessage(data: Uint8Array | null) {
    if (!data || data.length < 2) return
    const type = data[0] & 0xf0
    const d1 = data[1]
    const d2 = data.length > 2 ? data[2] : 0
    if (type === 0x90 && d2 > 0) {
      this.noteVelocity.set(d1, d2 / 127)
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      this.noteVelocity.set(d1, 0)
    } else if (type === 0xb0) {
      this.ccValues.set(d1, d2 / 127)
    } else {
      return
    }
    this.emit()
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
