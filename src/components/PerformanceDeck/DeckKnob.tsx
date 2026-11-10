import { pinRangeScale, type PinnedControl } from '../../state/player/performanceDeck'
import EditableRange from '../EditableRange/EditableRange'
import styles from './PerformanceDeck.module.css'

interface DeckKnobProps {
  pin: PinnedControl
  value: unknown
  onChange: (value: unknown) => void
  onLearnMidi: () => void
  onUnpin: () => void
  learning: boolean
}

/** A single pinned control, rendered large for at-arm's-length live use.
 *  Numeric fader/knob pins use a native range input (bigger hit target than
 *  the node's own inline slider); toggle/select pins get a big button /
 *  dropdown respectively. Arrow-key nudge works via the native input's own
 *  step behavior once focused. */
export default function DeckKnob({ pin, value, onChange, onLearnMidi, onUnpin, learning }: DeckKnobProps) {
  const min = pin.min ?? 0
  const max = pin.max ?? 1
  const step = pin.step ?? (max - min > 10 ? 1 : 0.01)

  return (
    <div className={styles.knob}>
      <div className={styles.knobHeader}>
        <span className={styles.knobLabel} title={pin.label}>{pin.label}</span>
        <button type="button" className={styles.knobUnpin} onClick={onUnpin} aria-label={`Unpin ${pin.label}`} title="Unpin">
          ×
        </button>
      </div>

      {pin.kind === 'toggle' ? (
        <button
          type="button"
          className={`${styles.knobToggle} ${value ? styles.knobToggleOn : ''}`}
          onClick={() => onChange(!value)}
          aria-pressed={Boolean(value)}
        >
          {value ? 'On' : 'Off'}
        </button>
      ) : pin.kind === 'select' && pin.options ? (
        <select
          className={`nodrag ${styles.knobSelect}`}
          value={String(value ?? pin.options[0])}
          onChange={(e) => onChange(e.target.value)}
        >
          {pin.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <EditableRange
          className={`nodrag ${styles.knobRange}`}
          wrapClassName={styles.knobControl}
          valueClassName={styles.knobValue}
          renderValue={(v) => v.toFixed(2)}
          min={min}
          max={max}
          step={step}
          scale={pinRangeScale(pin)}
          value={typeof value === 'number' ? value : min}
          onChange={onChange}
          ariaLabel={pin.label}
        />
      )}

      <button
        type="button"
        className={`${styles.knobLearn} ${learning ? styles.knobLearnActive : ''}`}
        onClick={onLearnMidi}
      >
        {learning ? 'Listening…' : 'Learn MIDI'}
      </button>
    </div>
  )
}
