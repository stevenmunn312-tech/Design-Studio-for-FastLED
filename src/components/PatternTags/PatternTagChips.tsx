import { PATTERN_FORM_TAGS, patternFormTags, type PatternFormTag } from '../../state/patternTags'
import styles from './PatternTagChips.module.css'

interface Props {
  /** The author's current claim. Empty is a real answer — "works anywhere". */
  value: PatternFormTag[]
  onChange: (next: PatternFormTag[]) => void
  /** Names the pattern (or the selection) this row is editing, for screen readers. */
  name: string
  disabled?: boolean
  compact?: boolean
}

/**
 * "Best displayed on" — a multi-select, never a single choice, because most
 * patterns that suit one output suit two. Leaving all three off is the common
 * and correct answer, so the row says what that means instead of looking unset.
 */
export default function PatternTagChips({ value, onChange, name, disabled, compact }: Props) {
  const selected = patternFormTags(value)
  const toggle = (tag: PatternFormTag) => {
    onChange(selected.includes(tag) ? selected.filter((entry) => entry !== tag) : [...selected, tag])
  }
  return (
    <div className={`${styles.chips} ${compact ? styles.compact : ''}`} role="group" aria-label={`Best displayed on, for ${name}`}>
      {PATTERN_FORM_TAGS.map((tag) => {
        const on = selected.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            className={`${styles.chip} ${on ? styles.on : ''}`}
            aria-pressed={on}
            disabled={disabled}
            title={tag.hint}
            onClick={(event) => {
              event.stopPropagation()
              toggle(tag.id)
            }}
          >
            {tag.label}
          </button>
        )
      })}
      {!compact && (
        <span className={styles.note}>
          {selected.length === 0 ? 'Untagged — shown for every output' : 'Shown first for these; still shown for the rest'}
        </span>
      )}
    </div>
  )
}
