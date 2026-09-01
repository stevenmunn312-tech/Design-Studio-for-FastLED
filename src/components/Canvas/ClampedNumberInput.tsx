import { useState } from 'react'

/**
 * A number field that does not fight the person typing into it.
 *
 * A controlled `type="number"` whose value round-trips through a clamp cannot
 * accept any number whose first digit falls below the minimum: typing `3` into
 * a field with a minimum of 100 is rewritten to `100` before the next
 * keystroke lands, so 3000 is unreachable however carefully it is typed. Hold
 * the partial text here instead of in the store, commit only what is already
 * in range, and clamp once on blur — the clamp still exists, it just stops
 * running mid-word.
 *
 * In-range keystrokes still commit as they are typed, so anything reading the
 * value live (a power estimate, a capacity warning) keeps updating.
 */
export interface ClampedNumberInputProps {
  value: number
  min: number
  max: number
  step?: number
  ariaLabel: string
  className?: string
  onCommit: (value: number) => void
}

export default function ClampedNumberInput({
  value, min, max, step, ariaLabel, className, onCommit,
}: ClampedNumberInputProps) {
  // null means "not being edited": show the canonical value from the store.
  const [draft, setDraft] = useState<string | null>(null)

  function change(raw: string): void {
    setDraft(raw)
    const parsed = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      onCommit(parsed)
    }
  }

  function commit(): void {
    if (draft === null) return
    const parsed = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(parsed)) {
      onCommit(Math.min(max, Math.max(min, parsed)))
    }
    setDraft(null)
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      className={className}
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onChange={(event) => change(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          // Abandon the partial edit rather than clamping it into the store.
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
    />
  )
}
