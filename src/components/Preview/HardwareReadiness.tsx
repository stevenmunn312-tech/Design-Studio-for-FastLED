import { useMemo } from 'react'
import { useRootEdges, useRootNodes } from '../../state/graphStore'
import { boardByFqbn, useUploadStore } from '../../state/uploadStore'
import { useCapacityStore } from '../../state/capacityStore'
import { summarizeCapacity } from '../../utils/capacityFormat'
import {
  estimatePowerLoad,
  estimateFirmwareRam,
  findPinConflicts,
  findExactBoardPinIssues,
} from '../../utils/validateGraph'
import styles from './HardwareReadiness.module.css'

/**
 * Will this actually run on that board?
 *
 * The graph canvas answers what the patch does and the hardware view answers
 * what is on the bench, but nothing answered whether the two survive contact —
 * and the figures that do answer it were computed continuously and then shown
 * only inside a node body, which the hardware refactor hid from the library.
 *
 * Three readouts, deliberately a strip rather than a panel: the preview is why
 * this side of the workbench exists, and a dashboard here would compete with it.
 * Each one is quiet until it matters and states a number rather than a verdict,
 * because "1.9 A" tells you which supply to reach for and "power: warning" does
 * not.
 */
export default function HardwareReadiness() {
  // Power, RAM and pin conflicts are all questions about the project's
  // hardware, which lives in the root graph.
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)

  const capacityStatus = useCapacityStore((s) => s.status)
  const capacityResult = useCapacityStore((s) => s.result)
  const capacitySubject = useCapacityStore((s) => s.subject)

  const power = useMemo(() => estimatePowerLoad(nodes), [nodes])
  const ram = useMemo(() => estimateFirmwareRam(nodes, edges), [nodes, edges])
  const pinTrouble = useMemo(() => {
    const conflicts = findPinConflicts(nodes, edges)
    const exact = findExactBoardPinIssues(nodes)
    return { errors: conflicts.length + exact.errors.length, warnings: exact.warnings.length }
  }, [nodes, edges])

  const board = boardByFqbn(selectedFqbn)
  const capacity = summarizeCapacity(board, capacityStatus, capacityResult, capacitySubject)

  // Nothing to be ready for until something drives LEDs.
  if (!power) return null

  const amps = power.worstCaseMa / 1000
  const capped = power.configuredMa !== null
  const powerLevel = power.exceedsConfigured ? 'warn' : 'ok'
  const internalKb = ram ? Math.round(ram.internalBytes / 1024) : null

  const pinLevel = pinTrouble.errors > 0 ? 'bad' : pinTrouble.warnings > 0 ? 'warn' : 'ok'
  const pinText = pinTrouble.errors > 0
    ? `${pinTrouble.errors} pin ${pinTrouble.errors === 1 ? 'problem' : 'problems'}`
    : pinTrouble.warnings > 0
      ? `${pinTrouble.warnings} pin ${pinTrouble.warnings === 1 ? 'caution' : 'cautions'}`
      : 'pins ok'

  return (
    <div className={styles.strip} aria-label="Hardware readiness">
      <span className={styles.item} data-level={powerLevel} title={
        capped
          ? `Worst case ${amps.toFixed(2)} A across ${power.ledCount} LEDs, capped at ${(power.configuredMa! / 1000).toFixed(2)} A`
          : `Worst case ${amps.toFixed(2)} A if every one of ${power.ledCount} LEDs showed white at once. A supply of about ${(power.recommendedMa / 1000).toFixed(1)} A covers it.`
      }>
        <em className={styles.label}>Power</em>
        <strong>{amps < 10 ? amps.toFixed(2) : amps.toFixed(1)} A</strong>
        {capped && <span className={styles.note}>capped</span>}
      </span>

      <span className={styles.item} data-level={capacity.level === 'error' ? 'bad' : capacity.level === 'warn' ? 'warn' : 'ok'} title={capacity.text}>
        <em className={styles.label}>Fits</em>
        <strong>{capacity.text.replace(/^.*?·\s*/, '')}</strong>
      </span>

      <span className={styles.item} data-level={pinLevel} title="Pin conflicts, and pins the chosen board cannot reach">
        <em className={styles.label}>Pins</em>
        <strong>{pinText}</strong>
        {internalKb !== null && <span className={styles.note}>{internalKb} KB RAM</span>}
      </span>
    </div>
  )
}
