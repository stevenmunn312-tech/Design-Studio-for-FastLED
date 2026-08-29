import { useEffect, useMemo, useState } from 'react'
import { useRootEdges, useRootNodes } from '../../state/graphStore'
import { boardByFqbn, useUploadStore } from '../../state/uploadStore'
import { useCapacityStore } from '../../state/capacityStore'
import { useUiStore } from '../../state/uiStore'
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
interface HardwareReadinessProps {
  compact?: boolean
}

export default function HardwareReadiness({ compact = false }: HardwareReadinessProps) {
  // Power, RAM and pin conflicts are all questions about the project's
  // hardware, which lives in the root graph.
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  const openConsole = useUploadStore((s) => s.openConsole)
  const setHardwarePaneTab = useUiStore((s) => s.setHardwarePaneTab)

  const capacityStatus = useCapacityStore((s) => s.status)
  const capacityResult = useCapacityStore((s) => s.result)
  const capacitySubject = useCapacityStore((s) => s.subject)
  const capacityTarget = useCapacityStore((s) => s.target)
  const runCapacityCheck = useCapacityStore((s) => s.check)
  const [checkElapsedSeconds, setCheckElapsedSeconds] = useState(0)

  useEffect(() => {
    if (capacityStatus !== 'checking') {
      setCheckElapsedSeconds(0)
      return
    }
    const startedAt = Date.now()
    setCheckElapsedSeconds(0)
    const timer = window.setInterval(() => {
      setCheckElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [capacityStatus])

  const power = useMemo(() => estimatePowerLoad(nodes), [nodes])
  const ram = useMemo(() => estimateFirmwareRam(nodes, edges), [nodes, edges])
  const pinTrouble = useMemo(() => {
    const conflicts = findPinConflicts(nodes, edges)
    const exact = findExactBoardPinIssues(nodes)
    return { errors: conflicts.length + exact.errors.length, warnings: exact.warnings.length }
  }, [nodes, edges])

  const board = boardByFqbn(selectedFqbn)
  const capacity = summarizeCapacity(board, capacityStatus, capacityResult, capacitySubject)
  const capacityFailed = capacity.level === 'error'
  // A check compiles the design for real, so it only ever runs from a press —
  // and there is only something to press when there is something to build.
  const canCheck = !!capacityTarget?.code && capacityTarget.toolchainReady && capacityStatus !== 'checking'

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

  const elapsedText = checkElapsedSeconds < 60
    ? `${checkElapsedSeconds}s`
    : `${Math.floor(checkElapsedSeconds / 60)}m ${checkElapsedSeconds % 60}s`

  return (
    <div className={`${styles.strip} ${compact ? styles.compact : ''}`} aria-label="Hardware readiness">
      <span className={styles.item} data-level={powerLevel} title={
        capped
          ? `Worst case ${amps.toFixed(2)} A across ${power.ledCount} LEDs, capped at ${(power.configuredMa! / 1000).toFixed(2)} A`
          : `Worst case ${amps.toFixed(2)} A if every one of ${power.ledCount} LEDs showed white at once. Use at least a ${(power.requiredSupplyMa / 1000).toFixed(1)} A continuous supply.`
      }>
        <em className={styles.label}>Power</em>
        <strong>{amps < 10 ? amps.toFixed(2) : amps.toFixed(1)} A</strong>
        {capped && <span className={styles.note}>capped</span>}
      </span>

      {/* The chip's click always leads to the next useful thing, which differs
        * by state. After a failed check that is the compiler output: the text
        * says "see helper log", and this chip is the furthest point in the
        * workbench from it, so make it the way there (OutputConsole appends
        * the failure to the Output tab). Otherwise it is the check itself —
        * which compiles the design for real and so never runs on its own; see
        * capacityStore. */}
      {capacityStatus === 'checking' ? (
        <span
          className={`${styles.item} ${styles.checking}`}
          data-level="ok"
          title="Compiling this design without flashing it. A first toolchain build can take several minutes; later checks reuse the build cache."
          aria-label={`Fits: compiling capacity, ${elapsedText} elapsed`}
        >
          <em className={styles.label}>Fits</em>
          <i className={styles.spinner} aria-hidden="true" />
          <strong>compiling · {elapsedText}</strong>
        </span>
      ) : capacityFailed ? (
        <button
          type="button"
          className={`${styles.item} ${styles.itemButton}`}
          data-level="bad"
          onClick={() => {
            openConsole()
            setHardwarePaneTab('upload')
          }}
          title={`${capacity.text}\n\nClick to show the upload output.${capacityResult?.log ? `\n\n${capacityResult.log.slice(-1500)}` : ''}`}
        >
          <em className={styles.label}>Fits</em>
          <strong>{capacity.text.replace(/^.*?·\s*/, '')}</strong>
          <span className={styles.note}>see output</span>
        </button>
      ) : canCheck ? (
        <button
          type="button"
          className={`${styles.item} ${styles.itemButton}`}
          data-level={capacity.level === 'warn' ? 'warn' : 'ok'}
          onClick={runCapacityCheck}
          title={`${capacity.text}\n\nClick to compile this design against the selected board and measure it. Nothing is flashed.`}
        >
          <em className={styles.label}>Fits</em>
          <strong>{capacity.text.replace(/^.*?·\s*/, '')}</strong>
          <span className={styles.note}>{capacityStatus === 'measured' ? 'recheck' : 'check'}</span>
        </button>
      ) : (
        <span className={styles.item} data-level={capacity.level === 'warn' ? 'warn' : 'ok'} title={capacity.text}>
          <em className={styles.label}>Fits</em>
          <strong>{capacity.text.replace(/^.*?·\s*/, '')}</strong>
        </span>
      )}

      <span className={styles.item} data-level={pinLevel} title="Pin conflicts, and pins the chosen board cannot reach">
        <em className={styles.label}>Pins</em>
        <strong>{pinText}</strong>
        {internalKb !== null && <span className={styles.note}>{internalKb} KB RAM</span>}
      </span>
    </div>
  )
}
