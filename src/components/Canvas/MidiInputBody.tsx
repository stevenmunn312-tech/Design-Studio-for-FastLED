import { useMidiStore } from '../../state/midiStore'
import styles from './MidiInputBody.module.css'

// Live status readout for the MidiInput node — device connection state plus
// the current velocity/CC values for the note/cc numbers this node is
// listening to, mirroring FFTAnalyzerBody's LIVE/SILENT status pill.

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
        <span>note {note}</span>
        <span>{velocity.toFixed(2)}</span>
      </div>
      <div className={styles.readout}>
        <span>cc {cc}</span>
        <span>{ccValue.toFixed(2)}</span>
      </div>
    </div>
  )
}
