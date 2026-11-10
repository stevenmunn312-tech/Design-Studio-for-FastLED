import { useRef } from 'react'
import { useMidiStore } from '../../../state/midiStore'
import { MidiEngine, midiReading } from '../../../midi/midiEngine'
import styles from './MidiInputBody.module.css'
import BenchPartAction from './BenchPartAction'

// Live status readout for the MidiInput node — device connection state plus
// the current velocity/CC values for the note/cc numbers this node is
// listening to, mirroring FFTAnalyzerBody's LIVE/SILENT status pill.
//
// Below it, a note pad and a CC slider stand in for a controller while
// designing, as the sensor nodes' widgets stand in for their parts. They send
// real MIDI messages through MidiEngine, on this node's channel (channel 1 when
// it listens to all), so every MIDI node hears them as it would a device.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Velocity the pad plays at: a firm press, short of the maximum. */
const PAD_VELOCITY = 100

// Scientific pitch notation, MIDI note 60 = C4 (the common DAW/General MIDI
// convention) — lets a non-musician tell what key a raw note number means.
function midiNoteName(note: number): string {
  const n = Math.round(note)
  if (!Number.isFinite(n) || n < 0 || n > 127) return '—'
  const octave = Math.floor(n / 12) - 1
  return `${NOTE_NAMES[n % 12]}${octave}`
}

function midiByte(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)))
}

export default function MidiInputBody({ nodeId, note, cc, channel, din }: {
  nodeId: string
  note: number
  cc: number
  channel: number
  /** Set to DIN: the sketch reads the bench's MIDI interface, which may be missing. */
  din: boolean
}) {
  const supported = useMidiStore((s) => s.supported)
  const active = useMidiStore((s) => s.active)
  // Two numbers rather than one reading object, so the selectors stay stable.
  const velocity = useMidiStore((s) => midiReading(s, channel, note, cc).velocity)
  const ccValue = useMidiStore((s) => midiReading(s, channel, note, cc).cc)
  const reading = { velocity, cc: ccValue }
  const padDown = useRef(false)

  const label = !supported ? 'UNSUPPORTED' : active ? 'MIDI CONNECTED' : 'NO DEVICE'
  const status = Math.max(0, Math.min(15, channel - 1))
  const send = (bytes: number[]) => MidiEngine.instance.play(new Uint8Array(bytes))
  const release = () => {
    if (!padDown.current) return
    padDown.current = false
    send([0x80 | status, midiByte(note), 0])
  }

  return (
    <div className={styles.body}>
      <div className={styles.status} data-active={active}>
        <span />{label}
      </div>
      <div className={styles.readout}>
        <span>note {note} → {midiNoteName(note)}</span>
        <span>{reading.velocity.toFixed(2)}</span>
      </div>
      <div className={styles.readout}>
        <span>cc {cc}</span>
        <span>{reading.cc.toFixed(2)}</span>
      </div>
      <div className={styles.standIn}>
        <button
          type="button"
          className={`nodrag ${styles.pad} ${reading.velocity > 0 ? styles.padDown : ''}`}
          aria-label={`Play note ${note}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            padDown.current = true
            send([0x90 | status, midiByte(note), PAD_VELOCITY])
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
        >
          {reading.velocity > 0 ? 'PLAYING' : 'play note'}
        </button>
        <input
          className={`nodrag ${styles.ccSlider}`}
          type="range"
          min={0}
          max={127}
          step={1}
          aria-label={`CC ${cc} value`}
          value={Math.round(reading.cc * 127)}
          onChange={(event) => send([0xb0 | status, midiByte(cc), midiByte(Number(event.target.value))])}
        />
      </div>
      {din && <BenchPartAction nodeId={nodeId} nodeType="MidiInterface" />}
    </div>
  )
}
