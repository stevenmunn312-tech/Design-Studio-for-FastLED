import { useMemo, useState } from 'react'
import { rootGraphEdges, rootGraphNodes, useGraphStore } from '../../state/graphStore'
import {
  gpioRequirementForProperty,
  pinPropertyMayBeUnwired,
  propertyLabel,
} from '../../state/nodeLibrary'
import { NO_PIN, pinDisplayLabel, pinSupports, pinWarningForCapability } from '../../build/boards/boardGpio'
import { boardGpioInfo, useUploadStore } from '../../state/upload/uploadStore'
import { boardPinTable } from '../../build/boards/boardPinPolicy'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'
import { lanePinIndex } from '../../state/output/dataLanes'
import { boardIdOf, boardPartition, primaryBoardId } from '../../build/boardPartition'
import { pinAssignmentBlockers } from '../../build/pins/pinAvailability'
import styles from './BoardPinPicker.module.css'

interface Props {
  nodeId: string
  nodeType: string
  propertyKey: string
  /** Nested assignments retain their full collector key (for example buttons.id.pin). */
  pinUseKey?: string
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
  pinUseKey = propertyKey,
  properties,
  value,
  min = 0,
  max = 255,
  disabled = false,
  ariaLabel,
  onChange,
}: Props) {
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const rootNodes = useGraphStore(rootGraphNodes)
  const rootEdges = useGraphStore(rootGraphEdges)
  const { nodes, edges } = useMemo(() => {
    const owner = rootNodes.find((node) => node.id === nodeId)
    const boardId = owner ? boardIdOf(owner, primaryBoardId(rootNodes)) : primaryBoardId(rootNodes)
    return boardPartition(rootNodes, rootEdges, boardId)
  }, [rootNodes, rootEdges, nodeId])
  const blockers = useMemo(() =>
    pinAssignmentBlockers(nodes, edges, nodeId, nodeType, pinUseKey, selectedFqbn),
  [nodes, edges, nodeId, nodeType, pinUseKey, selectedFqbn])
  // A custom board's own exposed pins replace the chip table outright.
  const board = useMemo(() => selectedPhysicalBoardProfile(nodes), [nodes])
  const gpio = board ? boardPinTable(board, selectedFqbn) : boardGpioInfo(selectedFqbn)
  const [customOpen, setCustomOpen] = useState(false)
  const label = propertyLabel(nodeType, propertyKey, properties)
  // A lane pin carries the same signal as the output's data pin.
  const requirement = gpioRequirementForProperty(nodeType, lanePinIndex(propertyKey) !== null ? 'dataPin' : propertyKey, properties)

  const compatible = useMemo(() => {
    if (!gpio) return []
    if (!requirement) return gpio.recommended
    return gpio.recommended.filter((pin) =>
      pinSupports(pin, requirement.capability)
      && (!requirement.pullup || pinSupports(pin, 'pullup')),
    )
  }, [gpio, requirement])

  const mayUnwire = pinPropertyMayBeUnwired(nodeType, propertyKey)
  const unwired = mayUnwire && value === NO_PIN
  const selected = gpio?.recommended.find((pin) => pin.pin === value)
    ?? gpio?.caution.find((pin) => pin.pin === value)
  const isRecommended = unwired || compatible.some((pin) => pin.pin === value)
  const knownPins = [...(gpio?.recommended ?? []), ...(gpio?.caution ?? [])]
  const boardMax = Math.min(max, Math.max(min, gpio?.maxPin ?? 0, ...knownPins.map((pin) => pin.pin)))

  const conflicts = unwired ? [] : blockers.get(value) ?? []

  const note = mayUnwire && value === NO_PIN
    ? (gpio ? 'This line is not driven.' : 'This line is not driven until a pin number is entered.')
    : !gpio
      ? 'Custom board: enter the GPIO number from its pinout.'
      : !selected
        ? `GPIO ${value} is not listed for this board.`
        : pinWarningForCapability(selected, requirement?.capability) ?? selected.note

  if (!gpio || customOpen || (!unwired && (compatible.length === 0 || !isRecommended))) {
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
          const next = Number(event.target.value)
          if (!blockers.has(next)) onChange(next)
        }}
      >
        {mayUnwire && <option value={NO_PIN}>No GPIO</option>}
        {compatible.map((pin) => {
          const occupiedBy = blockers.get(pin.pin)
          const detail = occupiedBy
            ? `Pin used by ${occupiedBy.join(', ')}`
            : pinWarningForCapability(pin, requirement?.capability) ?? pin.note
          return (
            <option key={pin.pin} value={pin.pin} disabled={!!occupiedBy}>
              {`${pinDisplayLabel(pin)}${detail ? ` — ${detail}` : ''}`}
            </option>
          )
        })}
        <option value="__custom__">Other GPIO…</option>
      </select>
      {unwired && conflicts.length === 0 && (
        <span className={styles.note}>This line is not driven.</span>
      )}
      {conflicts.length > 0 && (
        <span className={styles.warning}>
          {`Also assigned to ${conflicts.join(', ')}.`}
        </span>
      )}
    </div>
  )
}
