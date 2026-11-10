import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { stopWheelWhileFocused } from '../Canvas/wheelBehavior'
import {
  effectiveRangeScale, logTravelPosition, logTravelValue, RANGE_TRAVEL_STEPS, type RangeScale,
} from '../../state/rangeScale'
import { validRangeValue } from './validRangeValue'
import styles from './EditableRange.module.css'

/**
 * A range slider that can also be typed into.
 *
 * Double-click the slider (or press Enter while it has focus) and it becomes
 * a text field holding the current value; Enter commits, Escape abandons, and
 * leaving the field (Tab, a click elsewhere) commits what is there if it is
 * valid. A value is valid when it is inside [min, max] and on the slider's own
 * step, so the keyboard cannot set what the drag could not. An invalid entry
 * stays in the field, marked, until it is fixed or abandoned.
 *
 * Escape inside the editor answers that Escape (`preventDefault`), so the
 * popup or node around it stays open; see `useEscapeLayer`.
 *
 * `renderValue` draws the readout beside the slider; double-clicking the
 * readout opens the editor too.
 *
 * `scale="log"` travels a range that spans decades logarithmically
 * (state/rangeScale.ts). The input then runs over `RANGE_TRAVEL_STEPS`
 * positions and announces the value as its `aria-valuetext`; what it reports,
 * and what the editor takes, is still the value on the step.
 */
export interface EditableRangeProps {
  value: number
  min: number
  max: number
  step: number
  ariaLabel: string
  onChange: (value: number) => void
  /** How the slider travels the range; linear unless the range spans decades. */
  scale?: RangeScale
  disabled?: boolean
  /** Class for the slider itself (the caller's layout and accent). */
  className?: string
  /** Class for the wrapper that holds the slider or editor and the readout. */
  wrapClassName?: string
  /** Class for the readout `renderValue` fills. */
  valueClassName?: string
  renderValue?: (value: number) => ReactNode
  style?: CSSProperties
  title?: string
}

export default function EditableRange({
  value, min, max, step, ariaLabel, onChange, scale, disabled = false,
  className, wrapClassName, valueClassName, renderValue, style, title,
}: EditableRangeProps) {
  const log = effectiveRangeScale(scale, min, max) === 'log'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const editorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) editorRef.current?.select()
  }, [editing])

  const beginEditing = () => {
    if (disabled) return
    setDraft(String(value))
    setInvalid(false)
    setEditing(true)
  }

  const commit = () => {
    if (!validRangeValue(draft, min, max, step)) {
      setInvalid(true)
      return false
    }
    onChange(Number(draft))
    setEditing(false)
    setInvalid(false)
    return true
  }

  const readout = renderValue && (
    <span className={valueClassName} onDoubleClick={beginEditing}>{renderValue(value)}</span>
  )
  // With neither a readout nor a wrapper class the control is the bare input,
  // so a grid or flex row that counts its children keeps its layout.
  const Wrap = renderValue || wrapClassName ? 'span' : Fragment
  const wrapProps = Wrap === 'span' ? { className: wrapClassName } : {}

  if (editing) {
    return (
      <Wrap {...wrapProps}>
        <input
          ref={editorRef}
          className={`nodrag ${styles.editor}${invalid ? ` ${styles.invalid}` : ''}`}
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          aria-invalid={invalid}
          title={invalid ? `Enter a value from ${min} to ${max} in steps of ${step}` : title}
          value={draft}
          onWheelCapture={stopWheelWhileFocused}
          onChange={(event) => {
            setDraft(event.target.value)
            setInvalid(false)
          }}
          onBlur={() => {
            if (!commit()) setEditing(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') {
              // The editor answers this Escape; the layer beneath stays open.
              event.preventDefault()
              setEditing(false)
              setInvalid(false)
            }
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        />
        {readout}
      </Wrap>
    )
  }

  return (
    <Wrap {...wrapProps}>
      <input
        className={className}
        type="range"
        min={log ? 0 : min}
        max={log ? RANGE_TRAVEL_STEPS : max}
        step={log ? 1 : step}
        disabled={disabled}
        value={log ? logTravelPosition(value, min, max) : value}
        aria-label={ariaLabel}
        aria-valuetext={log ? String(value) : undefined}
        title={title}
        style={style}
        onChange={(event) => onChange(log
          ? logTravelValue(Number(event.target.value), value, min, max, step)
          : Number(event.target.value))}
        onDoubleClick={(event) => {
          event.stopPropagation()
          beginEditing()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          beginEditing()
        }}
      />
      {readout}
    </Wrap>
  )
}
