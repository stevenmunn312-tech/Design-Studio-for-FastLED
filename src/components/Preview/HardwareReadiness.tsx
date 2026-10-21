import { useMemo } from 'react'
import { useGroupRegistry } from '../../hooks/useGroupRegistry'
import { useGraphStore, useRootEdges, useRootNodes } from '../../state/graphStore'
import { boardByFqbn, useUploadStore } from '../../state/upload/uploadStore'
import { useCapacityStore } from '../../state/upload/capacityStore'
import { useUiStore } from '../../state/uiStore'
import { formatElapsed, summarizeCapacity } from '../../utils/capacityFormat'
import { useElapsedSeconds } from '../../hooks/useElapsedSeconds'
import {
  estimatePowerLoad,
  estimateFirmwareRam,
  findPinConflicts,
  findExactBoardPinIssues,
} from '../../utils/validateGraph'
import { estimateWireTime } from '../../utils/wireTime'
import styles from './HardwareReadiness.module.css'

/**
 * Will this actually run on that board?
 *
 * The graph canvas answers what the patch does and the hardware view answers
 * what is on the bench, but nothing answered whether the two survive contact —
 * and the figures that do answer it were computed continuously and then shown
 * only inside a node body, which the hardware refactor hid from the library.
 *
 * Four readouts (power, capacity, pins, frame rate), deliberately a strip rather than a panel: the preview is why
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
  const displayDocuments = useGraphStore((state) => state.displayDocuments)
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  const openConsole = useUploadStore((s) => s.openConsole)
  const setHardwarePaneTab = useUiStore((s) => s.setHardwarePaneTab)

  const capacityStatus = useCapacityStore((s) => s.status)
  const capacityResult = useCapacityStore((s) => s.result)
  const capacitySubject = useCapacityStore((s) => s.subject)
  const capacityTarget = useCapacityStore((s) => s.target)
  const runCapacityCheck = useCapacityStore((s) => s.check)
  const checkStartedAt = useCapacityStore((s) => s.checkStartedAt)
  const checkElapsedSeconds = useElapsedSeconds(checkStartedAt, capacityStatus === 'checking')

  const power = useMemo(() => estimatePowerLoad(nodes), [nodes])
  const groups = useGroupRegistry()
  const ram = useMemo(() => estimateFirmwareRam(nodes, edges, displayDocuments, groups), [nodes, edges, displayDocuments, groups])
  const wire = useMemo(() => estimateWireTime(nodes, edges), [nodes, edges])
  const pinTrouble = useMemo(() => {
    const conflicts = findPinConflicts(nodes, edges, selectedFqbn)
    const exact = findExactBoardPinIssues(nodes)
    return { errors: conflicts.length + exact.errors.length, warnings: exact.warnings.length }
  }, [nodes, edges, selectedFqbn])

  const board = boardByFqbn(selectedFqbn)
  const capacity = summarizeCapacity(board, capacityStatus, capacityResult, capacitySubject, capacityTarget?.preparationError)
  const capacityFailed = capacity.level === 'error'
  const capacityLevel = capacity.tone === 'error' ? 'bad' : capacity.tone
  // A check compiles the design for real, so it only ever runs from a press —
  // and there is only something to press when there is something to build.
  const canCheck = !!capacityTarget?.generate && capacityTarget.toolchainReady && capacityStatus !== 'checking'

  // Nothing to be ready for until something drives LEDs.
  if (!power) return null

  const amps = power.worstCaseMa / 1000
  const capped = power.configuredMa !== null
  // A cap is the answer to a large fixture, not a problem with it.
  const powerLevel = 'ok'
  const internalKb = ram ? Math.round(ram.internalBytes / 1024) : null
  const wireMs = wire ? wire.estimatedMicros / 1000 : null

  const pinLevel = pinTrouble.errors > 0 ? 'bad' : pinTrouble.warnings > 0 ? 'warn' : 'ok'
  const pinText = pinTrouble.errors > 0
    ? `${pinTrouble.errors} pin ${pinTrouble.errors === 1 ? 'problem' : 'problems'}`
    : pinTrouble.warnings > 0
      ? `${pinTrouble.warnings} pin ${pinTrouble.warnings === 1 ? 'caution' : 'cautions'}`
      : 'pins ok'

  const elapsedText = formatElapsed(checkElapsedSeconds)

  return (
    <div className={`${styles.strip} ${compact ? styles.compact : ''}`} aria-label="Hardware readiness">
      <span className={styles.item} data-level={powerLevel} title={
        capped
          ? `Up to ${amps.toFixed(2)} A if all ${power.ledCount} LEDs showed full white. Your ${(power.configuredMa! / 1000).toFixed(2)} A cap keeps it within your supply: FastLED dims only the brightest scenes.`
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
          aria-label={`Capacity check: compiling, ${elapsedText} elapsed`}
        >
          <em className={styles.label}>{capacity.label}</em>
          <i className={styles.spinner} aria-hidden="true" />
          <strong>compiling · {elapsedText}</strong>
        </span>
      ) : capacityFailed ? (
        <button
          type="button"
          className={`${styles.item} ${styles.itemButton}`}
          data-level="bad"
          onClick={() => {
            if (capacityStatus !== 'preparation-failed') openConsole()
            setHardwarePaneTab('upload')
          }}
          title={`${capacity.text}\n\n${capacityStatus === 'preparation-failed' ? 'Click to review display preparation in the Upload tab.' : 'Click to show the upload output.'}${capacityResult?.log ? `\n\n${capacityResult.log.slice(-1500)}` : ''}`}
        >
          <em className={styles.label}>{capacity.label}</em>
          <strong>{capacity.detail}</strong>
          <span className={styles.note}>{capacityStatus === 'preparation-failed' ? 'review' : 'see output'}</span>
        </button>
      ) : canCheck ? (
        <button
          type="button"
          className={`${styles.item} ${styles.itemButton}`}
          data-level={capacityLevel}
          onClick={runCapacityCheck}
          title={`${capacity.text}\n\nClick to compile this design against the selected board and measure it. Nothing is flashed.`}
        >
          <em className={styles.label}>{capacity.label}</em>
          <strong>{capacity.detail}</strong>
          {/* The press is the point of this chip, so its verb stays visible —
            * and bright — even in the status bar, which hides other notes. */}
          <span className={styles.action}>{capacityStatus === 'measured' ? 'recheck' : 'check'}</span>
        </button>
      ) : (
        <span className={styles.item} data-level={capacityLevel} title={capacity.text}>
          <em className={styles.label}>{capacity.label}</em>
          <strong>{capacity.detail}</strong>
        </span>
      )}

      <span className={styles.item} data-level={pinLevel} title="Pin conflicts, and pins the chosen board cannot reach">
        <em className={styles.label}>Pins</em>
        <strong>{pinText}</strong>
        {internalKb !== null && <span className={styles.note}>{internalKb} KB RAM</span>}
      </span>

      {/* The frame rate the wire allows on this board. Advice colour, never
        * red: a wire-bound graph still runs, just slower than the Board asks,
        * and Graph Health offers the fix. */}
      {wire && wireMs !== null && (
        <span className={styles.item} data-level={wire.wireBound ? 'warn' : 'ok'} aria-label={`Frame rate: ${wire.reachableFps} fps`} title={
          `Sending ${wire.ledCount} LEDs on ${wire.controllerCount} ${wire.controllerCount === 1 ? 'output' : 'outputs'} takes about ${wireMs.toFixed(1)} ms on the ${wire.facts.chip}`
          + ` (${wire.concurrency <= 1 || wire.controllerCount === 1 ? 'one at a time' : `${Math.min(wire.concurrency, wire.controllerCount)} at once`}${wire.networkActive && wire.rmt ? ', with the network up' : ''}).`
          + (wire.wireBound
            ? ` That allows about ${wire.reachableFps} fps of the Board's ${wire.frameRate}; Graph Health offers the fix.`
            : ` The Board's ${wire.frameRate} fps fits; rendering and audio work come on top.`)
        }>
          <em className={styles.label}>Frame</em>
          <strong>{wire.reachableFps} fps</strong>
          <span className={styles.note}>{wire.wireBound ? 'wire-bound' : `${wireMs.toFixed(1)} ms wire`}</span>
        </span>
      )}
    </div>
  )
}
