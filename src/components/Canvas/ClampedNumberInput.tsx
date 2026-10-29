import { useRef, useState } from 'react'

/**
 * A number field that does not fight the person typing into it.
 *
 * A controlled `type="number"` whose value round-trips through a clamp cannot
 * accept any number whose first digit falls below the minimum: typing `3` into
 * a field with a minimum of 100 is rewritten to `100` before the next
 * keystroke lands, so 3000 is unreachable however carefully it is typed. Hold
 * the partial text here instead of in the store, commit only what is already
 * in range and on the step, and settle once on blur — the clamp still exists,
 * it just stops running mid-word.
 *
 * In-range keystrokes still commit as they are typed, so anything reading the
 * value live (a power estimate, a capacity warning) keeps updating. Each edit
 * reaches `onCommit` once per distinct value: Enter only blurs the field, and
 * the blur skips a value the keystrokes already sent, so a caller that
 * snapshots history on every commit records one step per edit.
 */
export interface ClampedNumberInputProps {
  value: number
  min: number
  max: number
  step?: number
  ariaLabel: string
  id?: string
  className?: string
  disabled?: boolean
  onCommit: (value: number) => void
}

function decimalsOf(n: number): number {
  const text = String(n)
  if (text.includes('e')) return 10
  return (text.split('.')[1] ?? '').length
}

/** The value the field would hold: on the nearest step from the minimum, then
 *  inside the range. Rounded to the step's own precision so `0.1` steps do not
 *  commit `0.30000000000000004`. */
function settleNumber(value: number, min: number, max: number, step?: number): number {
  let next = value
  if (step !== undefined && Number.isFinite(step) && step > 0) {
    const decimals = Math.max(decimalsOf(step), decimalsOf(min))
    next = Number((min + Math.round((value - min) / step) * step).toFixed(decimals))
  }
  return Math.min(max, Math.max(min, next))
}

export default function ClampedNumberInput({
  value, min, max, step, ariaLabel, id, className, disabled, onCommit,
}: ClampedNumberInputProps) {
  // null means "not being edited": show the canonical value from the store.
  const [draft, setDraft] = useState<string | null>(null)
  // Set only while Escape blurs the field: that blur's commit still sees the
  // draft from before Escape cleared it, and would clamp it into the store.
  const abandoning = useRef(false)
  // The value this edit's keystrokes already sent, so the blur that ends the
  // edit does not send it a second time.
  const sent = useRef<number | null>(null)

  function change(raw: string): void {
    setDraft(raw)
    const parsed = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(parsed) && settleNumber(parsed, min, max, step) === parsed) {
      sent.current = parsed
      onCommit(parsed)
    }
  }

  function commit(): void {
    if (draft === null || abandoning.current) return
    const parsed = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(parsed)) {
      const settled = settleNumber(parsed, min, max, step)
      if (settled !== sent.current) onCommit(settled)
    }
    sent.current = null
    setDraft(null)
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      id={id}
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onChange={(event) => change(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          // The blur commits; committing here as well sent every edit twice.
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          // Abandon the partial edit rather than clamping it into the store.
          // That answers this Escape, so the menu or editor around the field
          // stays open; with no edit in progress, Escape closes it as usual.
          if (draft !== null) event.preventDefault()
          setDraft(null)
          sent.current = null
          abandoning.current = true
          event.currentTarget.blur()
          abandoning.current = false
        }
      }}
    />
  )
}
