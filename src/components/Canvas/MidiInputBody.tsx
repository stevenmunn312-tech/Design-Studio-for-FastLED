import { useMidiStore } from '../../state/midiStore'
import styles from './MidiInputBody.module.css'

// Live status readout for the MidiInput node — device connection state plus
// the current velocity/CC values for the note/cc numbers this node is
// listening to, mirroring FFTAnalyzerBody's LIVE/SILENT status pill.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Scientific pitch notation, MIDI note 60 = C4 (the common DAW/General MIDI
// convention) — lets a non-musician tell what key a raw note number means.
function midiNoteName(note: number): string {
  const n = Math.round(note)
  if (!Number.isFinite(n) || n < 0 || n > 127) return '—'
  const octave = Math.floor(n / 12) - 1
  return `${NOTE_NAMES[n % 12]}${octave}`
}

export default function MidiInputBody({ note, cc }: { note: number; cc: number }) {
  const supported = useMidiStore((s) => s.supported)
  const active = useMidiStore((s) => s.active)
  const velocity = useMidiStore((s) => s.noteVelocity.get(note) ?? 0)
  const ccValue = useMidiStore((s) => s.ccValues.get(cc) ?? 0)

  const label = !supported ? 'UNSUPPORTED' : active ? 'MIDI CONNECTED' : 'NO DEVICE'

  return (
    <div className={styles.body}>
      <div className={styles.status} data-active={active}>
        <span />{label}
      </div>
      <div className={styles.readout}>
        <span>note {note} → {midiNoteName(note)}</span>
        <span>{velocity.toFixed(2)}</span>
      </div>
      <div className={styles.readout}>
        <span>cc {cc}</span>
        <span>{ccValue.toFixed(2)}</span>
      </div>
    </div>
  )
}
