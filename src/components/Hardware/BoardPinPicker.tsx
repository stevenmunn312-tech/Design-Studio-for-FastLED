import { useMemo, useState } from 'react'
import { rootGraphNodes, useGraphStore } from '../../state/graphStore'
import {
  gpioRequirementForProperty,
  isGpioPinProperty,
  isPropertyEnabled,
  propertyLabel,
} from '../../state/nodeLibrary'
import { pinDisplayLabel, pinSupports, pinWarningForCapability } from '../../state/boardGpio'
import { boardGpioInfo, useUploadStore } from '../../state/uploadStore'
import styles from './BoardPinPicker.module.css'

interface Props {
  nodeId: string
  nodeType: string
  propertyKey: string
  properties: Record<string, unknown>
  value: number
  min?: number
  max?: number
  disabled?: boolean
  ariaLabel?: string
  onChange: (value: number) => void
}

/**
 * The one GPIO editor used by the hardware workbench.
 *
 * A physical assignment is useful only in the context of the selected board,
 * so the control names known-good pins, explains cautions, and still leaves an
 * escape hatch for custom boards and deliberate advanced wiring.
 */
export default function BoardPinPicker({
  nodeId,
  nodeType,
  propertyKey,
  properties,
  value,
  min = 0,
  max = 255,
  disabled = false,
  ariaLabel,
  onChange,
}: Props) {
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const gpio = boardGpioInfo(selectedFqbn)
  const nodes = useGraphStore(rootGraphNodes)
  const [customOpen, setCustomOpen] = useState(false)
  const label = propertyLabel(nodeType, propertyKey)
  const requirement = gpioRequirementForProperty(nodeType, propertyKey, properties)

  const compatible = useMemo(() => {
    if (!gpio) return []
    if (!requirement) return gpio.recommended
    return gpio.recommended.filter((pin) =>
      pinSupports(pin, requirement.capability)
      && (!requirement.pullup || pinSupports(pin, 'pullup')),
    )
  }, [gpio, requirement])

  const selected = gpio?.recommended.find((pin) => pin.pin === value)
    ?? gpio?.caution.find((pin) => pin.pin === value)
  const isRecommended = compatible.some((pin) => pin.pin === value)
  const knownPins = [...(gpio?.recommended ?? []), ...(gpio?.caution ?? [])]
  const boardMax = Math.min(max, Math.max(min, gpio?.maxPin ?? 0, ...knownPins.map((pin) => pin.pin)))

  const conflicts = [...new Set(nodes.flatMap((node) => {
    if (node.id === nodeId) return []
    const otherProps = node.data.properties as Record<string, unknown>
    return Object.entries(otherProps)
      .filter(([key, otherValue]) =>
        isGpioPinProperty(node.data.nodeType, key)
        && isPropertyEnabled(node.data.nodeType, key, otherProps)
        && Number(otherValue) === value,
      )
      .map(() => node.data.label)
  }))]

  const note = !gpio
    ? 'Custom board: enter the GPIO number from its pinout.'
    : !selected
      ? `GPIO ${value} is not listed for this board.`
      : pinWarningForCapability(selected, requirement?.capability) ?? selected.note

  if (!gpio || compatible.length === 0 || customOpen || !isRecommended) {
    return (
      <div className={styles.field}>
        <div className={styles.customRow}>
          <input
            className={styles.input}
            type="number"
            min={min}
            max={boardMax || max}
            step={1}
            disabled={disabled}
            value={value}
            aria-label={ariaLabel ?? label}
            onChange={(event) => {
              const next = Math.round(Number(event.target.value))
              if (Number.isFinite(next)) onChange(Math.max(min, Math.min(boardMax || max, next)))
            }}
          />
          {gpio && compatible.length > 0 && (
            <button
              type="button"
              className={styles.knownButton}
              disabled={disabled}
              onClick={() => setCustomOpen(false)}
            >
              Known pins
            </button>
          )}
        </div>
        {(note || conflicts.length > 0) && (
          <span className={conflicts.length > 0 ? styles.warning : styles.note}>
            {conflicts.length > 0 ? `Also assigned to ${conflicts.join(', ')}.` : note}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={styles.field}>
      <select
        className={styles.select}
        disabled={disabled}
        value={String(value)}
        aria-label={ariaLabel ?? label}
        onChange={(event) => {
          if (event.target.value === '__custom__') {
            setCustomOpen(true)
            return
          }
          onChange(Number(event.target.value))
        }}
      >
        {compatible.map((pin) => (
          <option key={pin.pin} value={pin.pin}>
            {`${pinDisplayLabel(pin)}${pinWarningForCapability(pin, requirement?.capability) || pin.note ? ` — ${pinWarningForCapability(pin, requirement?.capability) ?? pin.note}` : ''}`}
          </option>
        ))}
        <option value="__custom__">Other GPIO…</option>
      </select>
      {conflicts.length > 0 && (
        <span className={styles.warning}>
          {`Also assigned to ${conflicts.join(', ')}.`}
        </span>
      )}
    </div>
  )
}
