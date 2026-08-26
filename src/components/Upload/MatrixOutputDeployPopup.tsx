import { useMemo, useState } from 'react'
import { getGroupRegistry, useGraphStore, useRootEdges, useRootNodes } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useUploadStore, boardByFqbn, engineReady } from '../../state/uploadStore'
import { useStreamStore } from '../../state/streamStore'
import { useMusicStore } from '../../state/musicStore'
import { useProjectStore } from '../../state/projectStore'
import { useCapacityStore } from '../../state/capacityStore'
import { bakeBrowserThumbnails } from '../../utils/browserThumbnails'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { generateStreamReceiverSketch, streamLayoutForGraph } from '../../codegen/streamReceiverGenerator'
import { generateWiringDiagnosticSketch } from '../../codegen/wiringDiagnosticGenerator'
import { readySongCount, buildShowPayload, sdShowConnected } from '../../utils/showUpload'
import { findPinConflicts, findMatrixLayoutErrors, findMirroredOutputMismatches, findBoardCompatibilityErrors, findOutputResourceErrors, findHub75ConfigErrors, findHub75TopologyDiagnosticErrors, findFormulaErrors, findShowOutputFormErrors, findShowRequirementErrors } from '../../utils/validateGraph'
import { summarizeCapacity } from '../../utils/capacityFormat'
import { useCodegenGraph } from '../../utils/codegenGraph'
import { useModalFocus } from '../../hooks/useModalFocus'
import {
  buildHardwareValidationProfile,
  suggestedValidationAction,
  type HardwareValidationAction,
} from '../../utils/hardwareValidation'
import CodeViewPopup from './CodeViewPopup'
import HardwareValidationPopup from './HardwareValidationPopup'
import OutputConsole from './OutputConsole'
import styles from './Upload.module.css'
import { controllerSettings } from '../../state/controllerSettings'
import { selectedPhysicalBoardProfile } from '../../build/boardProfiles'

type ReadinessState = 'ready' | 'checking' | 'missing'

const CAPACITY_LEVEL_CLASS = {
  ok: 'capacityOk', warn: 'capacityWarn', error: 'capacityError', pending: 'capacityPending',
} as const

/**
 * The upload tools.
 *
 * `inline` drops the modal shell so the same body can sit in the hardware
 * pane's Upload tab, where these tools now live — uploading is a bench
 * activity, and the bench is drawn right there. The floating dialog remains
 * for the times the pane is collapsed to nothing, which it is allowed to be.
 */
interface MatrixOutputDeployPopupProps {
  inline?: boolean
  leftInset?: number
  rightInset?: number
}

export default function MatrixOutputDeployPopup({
  inline = false,
  leftInset = 0,
  rightInset = 0,
}: MatrixOutputDeployPopupProps = {}) {
  const [readinessOpen, setReadinessOpen] = useState(false)
  const [validationAction, setValidationAction] = useState<HardwareValidationAction | null>(null)
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const entries = useMusicStore((s) => s.entries)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const {
    helper, installedCores, selectedFqbn, selectedPort, ports, busy, status, codeViewOpen,
    refreshHelper, refreshPorts, installCore, activeOutputNodeId,
    openBoardPopup, openCliPopup, openCodeView, closeDeployPopup, openSetupWizard, runUpload, runLastUpload, runShowUpload, exportIno,
    cancelUpload,
    cardReader, setCardReader,
  } = useUploadStore()
  const hasLastSketch = useUploadStore((s) => !!(currentProjectId && s.lastSketchByProject[currentProjectId]))
  const { streaming, fps: streamFps, error: streamError, start: startStreaming, stop: stopStreaming } = useStreamStore()
  const dialogRef = useModalFocus<HTMLDivElement>(closeDeployPopup)

  const outputNode = nodes.find((n) => n.id === activeOutputNodeId && n.data.nodeType === 'MatrixOutput')
    ?? nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const ownProps = ((outputNode?.data.properties ?? {}) as Record<string, unknown>)
  const nodeId = outputNode?.id ?? ''
  const isHub75 = String(ownProps.chipset ?? 'WS2812B') === 'HUB75'
  const hasFrameInput = !!outputNode && edges.some((e) => e.target === nodeId && e.targetHandle === 'frame')
  // A card is ordinary storage hardware until Performance Generator declares
  // that this graph is the offline music-show workflow.
  const hasSdShow = useMemo(() => sdShowConnected(nodes, edges), [nodes, edges])
  const hasMusicPlayer = useMemo(() => hasSdShow && nodes.some((node) => node.data.nodeType === 'PatternMaster'), [hasSdShow, nodes])

  const board = boardByFqbn(selectedFqbn)
  const usingFbuild = helper?.engine === 'fbuild'
  const activeEngineReady = engineReady(helper)
  const psramOptions = board?.psram
  const physicalProfile = selectedPhysicalBoardProfile(nodes)
  const psramSupported = !!psramOptions || !!physicalProfile?.psramMode
  const controller = controllerSettings(nodes)
  const usePsram = psramSupported && controller.usePsram
  const psramChoice = psramOptions?.find((o) => o.id === controller.psramMode) ?? psramOptions?.[0]

  // See CapacityWatcher: keyed on the codegen-relevant graph so a node drag
  // behind this popup doesn't re-run the sketch generator every frame.
  const codegenGraph = useCodegenGraph(nodes, edges)
  function generateCurrentCode() {
    const groups = getGroupRegistry()
    // Baked here rather than inside the generator: baking evaluates patterns,
    // and only this side knows whether the workspace has been trusted.
    const opts = {
      psramAllowed: psramSupported,
      thumbnails: bakeBrowserThumbnails(
        codegenGraph.nodes, codegenGraph.edges, groups,
        useGraphStore.getState().trusted, useGraphStore.getState().graphs,
      ),
    }
    return isPatternShow(codegenGraph.nodes, codegenGraph.edges)
      ? generateShowSketch(codegenGraph.nodes, codegenGraph.edges, groups, opts)
      : generateCpp(codegenGraph.nodes, codegenGraph.edges, groups, opts)
  }
  const code = useMemo(generateCurrentCode, [codegenGraph, psramSupported])

  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const target = `${board?.label ?? 'No board'} · ${portLabel || 'no port'}`
  const portDetected = !!selectedPort && ports.some((p) => p.address === selectedPort)
  const helperReady = !!helper
  const coreReady = !!board && (usingFbuild || installedCores.includes(board.core))
  const uploadReady = helperReady && activeEngineReady && coreReady && portDetected

  const pinConflicts = useMemo(() => findPinConflicts(nodes, edges), [nodes, edges])
  const layoutErrors = useMemo(
    () => findMatrixLayoutErrors(nodes),
    [nodes],
  )
  // Uneven parallel runs are worth saying and never worth blocking — a star
  // with half-length arms is a real build, not a misconfiguration.
  const mirrorNotes = useMemo(() => findMirroredOutputMismatches(nodes, edges), [nodes, edges])
  const outputResourceErrors = useMemo(() => findOutputResourceErrors(nodes), [nodes])
  const boardCompatibilityErrors = useMemo(
    () => findBoardCompatibilityErrors(nodes, selectedFqbn),
    [nodes, selectedFqbn],
  )
  const hub75ConfigErrors = useMemo(() => findHub75ConfigErrors(nodes), [nodes])
  const showOutputFormErrors = useMemo(() => findShowOutputFormErrors(nodes, edges), [nodes, edges])
  const formulaErrors = useMemo(() => findFormulaErrors(nodes), [nodes])
  // A music show has to name every part the player drives: the LED output it
  // sends the show to, the card it reads the song from, and the module that
  // turns that song into sound. Guessing any of them flashes a board that
  // lights nothing, plays nothing, or both.
  const showTargetErrors = useMemo(
    () => findShowRequirementErrors(nodes, edges, selectedFqbn),
    [nodes, edges, selectedFqbn],
  )
  const hub75TopologyErrors = useMemo(
    () => findHub75TopologyDiagnosticErrors(nodes, nodeId),
    [nodes, nodeId],
  )

  // Live controller-capacity meter (see CapacityWatcher.tsx, which drives
  // the actual debounced compile-check) — the measured result is the
  // authority here: only a *confirmed* overflow blocks Upload, so editing is
  // never blocked just because a check hasn't completed yet.
  const {
    status: capacityStatus, result: capacityResult, subject: capacitySubject,
    target: capacityTarget, check: runCapacityCheck,
  } = useCapacityStore()
  const capacitySummary = useMemo(
    () => summarizeCapacity(board, capacityStatus, capacityResult, capacitySubject),
    [board, capacityStatus, capacityResult, capacitySubject],
  )
  const canCheckCapacity = !!capacityTarget?.code && capacityTarget.toolchainReady && capacityStatus !== 'checking'
  // Only a *current* measurement blocks. 'measured' means the reading was taken
  // against the graph and board as they stand; a 'stale' overflow describes a
  // design the user may already have shrunk, and blocking on it would trap them
  // behind a number they have no obligation to refresh.
  const capacityOverflow = capacityStatus === 'measured'
    && capacityResult?.target === (usePsram && psramChoice ? `${selectedFqbn}:${psramChoice.opt}` : selectedFqbn)
    && !capacityResult.ok && capacityResult.overflow

  const blockingErrors = [
    ...pinConflicts,
    ...layoutErrors,
    ...outputResourceErrors,
    ...boardCompatibilityErrors,
    ...hub75ConfigErrors,
    ...showOutputFormErrors,
    ...showTargetErrors,
    ...formulaErrors,
    ...(capacityOverflow ? [`${board?.label ?? 'This board'}: design is too large to fit (live capacity check)`] : []),
  ]
  const canBuild = hasFrameInput && blockingErrors.length === 0
  const canShowUpload = hasSdShow && blockingErrors.length === 0
  const suggestedAction = useMemo(() => suggestedValidationAction(nodes, edges), [nodes, edges])
  const validationProfile = useMemo(() => buildHardwareValidationProfile({
    nodes,
    edges,
    selectedFqbn,
    helper,
    capacityResult,
    action: suggestedAction,
  }), [nodes, edges, selectedFqbn, helper, capacityResult, suggestedAction])

  const readiness = useMemo(() => {
    const helperRow = helper === undefined
      ? { label: 'Helper', state: 'checking' as ReadinessState, detail: 'Checking for the local upload helper…' }
      : !helper
        ? {
            label: 'Helper',
            state: 'missing' as ReadinessState,
            detail: 'Browser uploads need the local helper running on this machine.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : {
            label: 'Helper',
            state: 'ready' as ReadinessState,
            detail: `Online${helper.engine ? ` · ${helper.engine}` : ''}`,
          }

    const engineRow = helper === undefined
      ? { label: 'Engine', state: 'checking' as ReadinessState, detail: 'Waiting for helper status…' }
      : !helper
        ? {
            label: 'Engine',
            state: 'missing' as ReadinessState,
            detail: 'Start the helper first so Studio can discover a usable build engine.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : !activeEngineReady
          ? {
              label: 'Engine',
              state: 'missing' as ReadinessState,
              detail: 'No usable build engine is configured yet.',
              actionLabel: 'Fix engine',
              action: openCliPopup,
            }
          : usingFbuild
            ? { label: 'Engine', state: 'ready' as ReadinessState, detail: `Using fbuild${helper.fbuildVersion ? ` ${helper.fbuildVersion}` : ''}` }
            : { label: 'Engine', state: 'ready' as ReadinessState, detail: `Using arduino-cli${helper.version ? ` ${helper.version}` : ''}` }

    const coreRow = helper === undefined
      ? { label: 'Toolchain', state: 'checking' as ReadinessState, detail: 'Checking board toolchain…' }
      : !helper
        ? {
            label: 'Toolchain',
            state: 'missing' as ReadinessState,
            detail: 'The helper must be online before Studio can verify board toolchains.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : !activeEngineReady
          ? {
              label: 'Toolchain',
              state: 'missing' as ReadinessState,
              detail: 'Choose a working engine before toolchain checks can pass.',
              actionLabel: 'Fix engine',
              action: openCliPopup,
            }
          : usingFbuild
            ? { label: 'Toolchain', state: 'ready' as ReadinessState, detail: `${board?.label ?? 'Selected board'} toolchain downloads on first fbuild compile.` }
            : !board
              ? {
                  label: 'Toolchain',
                  state: 'missing' as ReadinessState,
                  detail: 'Choose a board first.',
                  actionLabel: 'Choose board',
                  action: openBoardPopup,
                }
              : !coreReady
                ? {
                    label: 'Toolchain',
                    state: 'missing' as ReadinessState,
                    detail: `${board.label} needs the ${board.core} core installed.`,
                    actionLabel: 'Install core',
                    action: () => { void installCore(board.core) },
                  }
                : { label: 'Toolchain', state: 'ready' as ReadinessState, detail: `${board.label} core is installed.` }

    const connectionRow = helper === undefined
      ? { label: 'Connection', state: 'checking' as ReadinessState, detail: 'Scanning for serial ports…' }
      : !helper
        ? {
            label: 'Connection',
            state: 'missing' as ReadinessState,
            detail: 'Start the helper before Studio can list ports.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : !selectedPort
          ? {
              label: 'Connection',
              state: 'missing' as ReadinessState,
              detail: 'Pick the board’s USB/serial port.',
              actionLabel: 'Choose port',
              action: openBoardPopup,
            }
          : !portDetected
            ? {
                label: 'Connection',
                state: 'missing' as ReadinessState,
                detail: `${selectedPort} is not currently detected.`,
                actionLabel: 'Refresh ports',
                action: () => { void refreshPorts() },
              }
            : streaming
              ? {
                  label: 'Connection',
                  state: 'ready' as ReadinessState,
                  detail: 'Live Stream owns the port now; Upload will stop it automatically first.',
                }
              : { label: 'Connection', state: 'ready' as ReadinessState, detail: `${portLabel || selectedPort} ready` }

    return [helperRow, engineRow, coreRow, connectionRow]
  }, [
    helper,
    activeEngineReady,
    usingFbuild,
    board,
    coreReady,
    selectedPort,
    portDetected,
    portLabel,
    streaming,
    refreshHelper,
    openCliPopup,
    installCore,
    openBoardPopup,
    refreshPorts,
  ])

  const readinessIssues = readiness.filter((row) => row.state !== 'ready').map((row) => `${row.label}: ${row.detail}`)
  const hasReadinessIssues = readinessIssues.length > 0

  const streamLayout = useMemo(() => streamLayoutForGraph(nodes, nodeId), [nodes, nodeId])
  async function offerValidationAfter(action: HardwareValidationAction, operation: Promise<void> | void) {
    await operation
    if (useUploadStore.getState().status.phase !== 'done') return
    const profile = buildHardwareValidationProfile({
      nodes,
      edges,
      selectedFqbn,
      helper,
      capacityResult,
      action,
    })
    if (profile.gaps.length > 0) setValidationAction(action)
  }

  function handleFlashReceiver() {
    const sketch = generateStreamReceiverSketch(nodes, nodeId)
    if (sketch) runUpload(sketch, usePsram ? psramChoice?.opt : undefined, { cache: false })
  }
  function handleFlashWiringTest() {
    const sketch = generateWiringDiagnosticSketch(nodes, nodeId)
    if (sketch) void offerValidationAfter('wiring-test', runUpload(sketch, undefined, { cache: false }))
  }
  function handleFlashHub75Topology() {
    const sketch = generateWiringDiagnosticSketch(nodes, nodeId, 'hub75-panel-topology')
    if (sketch) void offerValidationAfter('wiring-test', runUpload(sketch, undefined, { cache: false }))
  }
  function handleToggleStream() {
    if (streaming) { stopStreaming(); return }
    if (!selectedPort || !streamLayout) return
    void (async () => {
      await startStreaming(selectedPort, streamLayout)
      if (useStreamStore.getState().streaming) setValidationAction('live-stream')
    })()
  }

  const readySongs = readySongCount(entries)
  const cardReaderTip = cardReader
    ? 'The studio will pause and ask you to move the card to a reader, write the files, then ask for it back before flashing.'
    : 'Songs go to the card over serial — reliable everywhere, but minutes per song.'

  function handleShowUpload() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      const payload = buildShowPayload(nodes, edges, entries, getGroupRegistry(), {
        fqbn: selectedFqbn,
        psramAllowed: !!psramOptions,
        fqbnOpt: usePsram ? psramChoice?.opt : undefined,
      })
      if (payload) await offerValidationAfter('sd-show', runShowUpload(payload))
    })()
  }

  function confirmUploadIfUntrusted(): Promise<boolean> {
    if (useGraphStore.getState().trusted) return Promise.resolve(true)
    return useUiStore.getState().requestConfirm({
      title: 'Upload code from an untrusted source?',
      message: 'This project isn’t trusted yet — it may contain Formula/Code node source from outside this browser. Consider reviewing it (‹/› View Code) before flashing it to real hardware.',
      confirmLabel: 'Upload anyway',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
  }
  function handleUpload() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      // Generate again at the irreversible boundary. The memo above keeps View
      // Code cheap while nodes are dragged, but it can retain a pre-HMR sketch
      // in a local development session. Upload must always compile what the
      // current generator says now; only "Re-upload last sketch" intentionally
      // sends an older cached source unchanged.
      const uploadCode = generateCurrentCode()
      await offerValidationAfter(suggestedAction, runUpload(uploadCode, usePsram ? psramChoice?.opt : undefined))
    })()
  }

  function handleLastUpload() {
    void offerValidationAfter(suggestedAction, runLastUpload())
  }
  function handleExportIno() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      exportIno(generateCurrentCode())
    })()
  }

  const phaseClass =
    status.phase === 'error' ? styles.stError
    : status.phase === 'done' ? styles.stDone
    : status.phase === 'idle' ? ''
    : styles.stBusy

  // One Upload button, whatever shape the graph is.
  //
  // A Performance Generator plus SD Card runs the music-sync player rather
  // than a normal sketch, so uploading provisions the card and flashes that
  // player. A standalone SD Card remains on the normal sketch path.
  const isShowUpload = hasSdShow
  const canUploadNow = isShowUpload
    ? canShowUpload && (readySongs > 0 || hasMusicPlayer)
    : canBuild

  const uploadTitle =
    busy ? status.message
    : isShowUpload
      ? readySongs === 0 && !hasMusicPlayer
        ? 'Add a Music Player pattern collection, or analyse at least one song first'
        : blockingErrors.length > 0 ? blockingErrors.join('\n')
        : readinessIssues.length > 0 ? readinessIssues.join('\n')
        : cardReader
          ? `Write ${readySongs} song${readySongs === 1 ? '' : 's'} to a card in your reader, then flash the player`
          : `Write ${readySongs} song${readySongs === 1 ? '' : 's'} to the SD card over serial, then flash the player`
      : !hasFrameInput ? 'Connect a frame to enable upload'
        : blockingErrors.length > 0 ? blockingErrors.join('\n')
        : readinessIssues.length > 0 ? readinessIssues.join('\n')
        : 'Compile & upload to the board'

  const uploadLabel =
    status.phase === 'idle' ? (isShowUpload ? (hasMusicPlayer ? '♪ Flash Music Player' : `♪ Upload show (${readySongs})`) : '↑ Upload')
    : status.phase === 'done' ? '✓ Done'
    : status.phase === 'error' ? '✗ Error'
    : status.message

  if (!outputNode) return null

  const controls = (
    <div className={styles.deployControls}>
        <div className={styles.popupHeader}>
          <div>
            <div className={styles.wizardKicker}>Upload</div>
            <div className={styles.wizardTitle}>Deploy to hardware</div>
          </div>
          {/* Nothing to close when this *is* the pane — the tab strip is how
              you leave, and an × that dismissed the whole bottom half would be
              a different action wearing the same button. */}
          {!inline && (
            <button className={styles.closeBtn} onClick={closeDeployPopup} title="Close" aria-label="Close upload tools">×</button>
          )}
        </div>

        <div className={styles.targetRow}>
          <div className={styles.targetBig}>{target}</div>
          {/* The guided setup used to hang off the output node's strip, which
              was its only way in. Moving upload here without it would have
              quietly removed the wizard from the app. */}
          <button
            className={styles.setupBtn}
            onClick={() => openSetupWizard(outputNode?.id)}
            title="Open the guided hardware setup wizard"
          >
            ✦ Setup…
          </button>
        </div>
        {hasFrameInput && (
          /* The check compiles the whole design against the board, so it runs
           * only when asked — see capacityStore. This is the deliberate place
           * to ask: you are about to flash, which is exactly when "does it
           * fit" is worth a real build. */
          <button
            type="button"
            className={`${styles.capacityLine} ${styles.capacityButton} ${styles[CAPACITY_LEVEL_CLASS[capacitySummary.level]]}`}
            onClick={runCapacityCheck}
            disabled={!canCheckCapacity}
            title={
              capacityResult && !capacityResult.ok && capacityResult.log
                ? `Controller-capacity check failed:\n${capacityResult.log.slice(-1500)}`
                : 'Compile this design against the selected board to measure flash/SRAM. Nothing is flashed.'
            }
          >
            {capacitySummary.text}
            {canCheckCapacity && (
              <span className={styles.capacityAction}>{capacityStatus === 'measured' ? ' · recheck' : ' · check'}</span>
            )}
          </button>
        )}

        <button
          className={`${styles.wizardButtonBase} ${styles.readinessToggle}`}
          onClick={() => setReadinessOpen((open) => !open)}
          aria-expanded={readinessOpen}
        >
          <span className={styles.readinessTitle}>Upload readiness</span>
          <span className={`${styles.readinessSummary} ${hasReadinessIssues ? styles.missingBadge : styles.readyBadge}`}>
            {hasReadinessIssues ? 'Action needed' : 'Ready to upload'}
          </span>
        </button>

        {readinessOpen && (
          <div className={styles.readinessPanel} aria-label="Upload readiness">
            {readiness.map((row) => (
              <div key={row.label} className={styles.readinessRow}>
                <div className={styles.readinessText}>
                  <div className={styles.readinessLabelRow}>
                    <span className={styles.readinessLabel}>{row.label}</span>
                    <span
                      className={
                        row.state === 'ready' ? `${styles.readinessBadge} ${styles.readyBadge}`
                        : row.state === 'checking' ? `${styles.readinessBadge} ${styles.checkingBadge}`
                        : `${styles.readinessBadge} ${styles.missingBadge}`
                      }
                    >
                      {row.state === 'ready' ? 'Ready' : row.state === 'checking' ? 'Checking' : 'Fix'}
                    </span>
                  </div>
                  <div className={styles.readinessDetail}>{row.detail}</div>
                </div>
                {row.state === 'missing' && row.actionLabel && row.action && (
                  <button
                    className={styles.readinessAction}
                    aria-label={`${row.actionLabel}: ${row.label}`}
                    onClick={row.action}
                    disabled={busy}
                    title={`${row.actionLabel}: ${row.label}`}
                  >
                    {row.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Only on the show path: it changes how the songs reach the card,
            and a normal sketch upload never touches one. Persisted, because it
            describes the user's desk rather than this particular upload. */}
        {isShowUpload && (
          <label className={styles.cardReaderRow} title={cardReaderTip}>
            <input
              type="checkbox"
              checked={cardReader}
              disabled={busy}
              onChange={(e) => setCardReader(e.target.checked)}
            />
            <span>
              Card reader available
              <em> — much faster song transfers</em>
            </span>
          </label>
        )}

        <div className={styles.primaryActionDock}>
          <button
            className={`${styles.wizardButtonBase} ${styles.uploadBtn} ${phaseClass}`}
            disabled={!canUploadNow || !uploadReady || busy}
            aria-busy={busy}
            onClick={isShowUpload ? handleShowUpload : handleUpload}
            title={uploadTitle}
          >
            <span className={busy ? styles.busyText : undefined}>{uploadLabel}</span>
          </button>

          {/* Only while something is running. A board compile is minutes long,
            * and the commonest reason to want out is noticing the wrong board. */}
          {busy && (
            <button
              className={`${styles.wizardButtonBase} ${styles.cancelBuildBtn}`}
              onClick={() => { void cancelUpload() }}
              disabled={status.phase === 'cancelled'}
              title="Stop the running build. Nothing is sent to the board."
            >
              {status.phase === 'cancelled' ? 'Cancelling…' : '✕ Cancel'}
            </button>
          )}
        </div>

        {blockingErrors.length > 0 && (
          <div className={styles.streamError}>
            {blockingErrors.map((c) => <div key={c}>{c}</div>)}
          </div>
        )}

        {mirrorNotes.length > 0 && (
          <div className={styles.streamNote}>
            {mirrorNotes.map((note) => <div key={note}>{note}</div>)}
          </div>
        )}

        <section className={styles.actionGroup} aria-labelledby="firmware-actions-title">
          <div className={styles.actionGroupHeader}>
            <strong id="firmware-actions-title">Firmware</strong>
            <span>Reuse, inspect, or export the generated sketch</span>
          </div>
          <div className={styles.deployActions}>
          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={busy || !hasLastSketch}
            onClick={handleLastUpload}
            title={hasLastSketch ? 'Re-send the most recently uploaded sketch for this project without regenerating it' : 'Upload once to cache a quick re-upload target for this project'}
          >
            ↻ Re-upload last sketch
          </button>

          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!hasFrameInput || blockingErrors.length > 0}
            onClick={handleExportIno}
            title={!hasFrameInput ? 'Connect a frame to enable export' : blockingErrors.length > 0 ? blockingErrors.join('\n') : 'Download the generated .ino sketch'}
          >
            ↓ Export .ino
          </button>

          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!hasFrameInput}
            onClick={openCodeView}
            title={hasFrameInput ? 'View the generated .ino sketch' : 'Connect a frame to view the generated .ino sketch'}
          >
            {'</>'} View Code
          </button>
          </div>
        </section>

        <section className={styles.actionGroup} aria-labelledby="diagnostic-actions-title">
          <div className={styles.actionGroupHeader}>
            <strong id="diagnostic-actions-title">Diagnostics</strong>
            <span>Flash focused tests before trusting the full design</span>
          </div>
          <div className={styles.deployActions}>
          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!uploadReady || blockingErrors.length > 0 || busy}
            onClick={handleFlashWiringTest}
            title={
              blockingErrors.length > 0
                ? blockingErrors.join('\n')
                : readinessIssues.length > 0
                  ? readinessIssues.join('\n')
                  : 'Flash a standalone wiring diagnostic sketch using the current Board controller settings plus this output’s pins, color order, and layout'
            }
          >
            🧪 Flash Wiring Test
          </button>

          {isHub75 && (
            <button
              className={`${styles.wizardButtonBase} ${styles.exportBtn} ${styles.topologyBtn}`}
              disabled={!uploadReady || busy || streaming || blockingErrors.length > 0 || hub75TopologyErrors.length > 0}
              onClick={handleFlashHub75Topology}
              title={
                hub75TopologyErrors.length > 0
                  ? hub75TopologyErrors.join('\n')
                  : blockingErrors.length > 0
                    ? blockingErrors.join('\n')
                  : readinessIssues.length > 0
                    ? readinessIssues.join('\n')
                    : 'Hold a dedicated per-panel HUB75 topology pattern using the current panel grid, serpentine chain, and tile-rotation settings'
              }
            >
              🧭 Flash HUB75 Topology
            </button>
          )}
          </div>

          <div className={styles.validationCard}>
            <div className={styles.validationCardText}>
              <strong>Beta hardware coverage</strong>
              <span>
                {validationProfile.gaps.length > 0
                  ? `${validationProfile.gaps.length} missing test area${validationProfile.gaps.length === 1 ? '' : 's'} detected for this setup.`
                  : 'This setup matches a recorded path; repeat tests are still useful.'}
              </span>
            </div>
            <button className={styles.validationCardButton} onClick={() => setValidationAction(suggestedAction)}>
              Review tests…
            </button>
          </div>
        </section>

        <section className={styles.actionGroup} aria-labelledby="live-actions-title">
          <div className={styles.actionGroupHeader}>
            <strong id="live-actions-title">Live control</strong>
            <span>Prepare the receiver, then stream preview frames</span>
          </div>
          <div className={styles.deployActions}>
          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!canBuild || !uploadReady || busy || streaming}
            onClick={handleFlashReceiver}
            title={readinessIssues.length > 0 ? readinessIssues.join('\n') : 'Flash a tiny generic receiver sketch once — after that, Live Stream pushes preview frames straight to the board without recompiling'}
          >
            ⚡ Flash Stream Receiver
          </button>

          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn} ${streaming ? styles.streamBtnActive : ''}`}
            disabled={!canBuild || busy || !helperReady || !portDetected}
            onClick={handleToggleStream}
            title={
              streaming
                ? 'Stop pushing live preview frames to the board'
                : !helperReady
                  ? 'Start the local helper to enable live streaming'
                  : !portDetected
                    ? 'Choose a detected board port to enable live streaming'
                    : 'Push live preview frames to a board already running the Stream Receiver sketch'
            }
          >
            {streaming ? `⏹ Streaming — ${streamFps} fps` : '📡 Live Stream'}
          </button>
          </div>
        </section>

        {streamError && <div className={styles.streamError}>{streamError}</div>}
        {codeViewOpen && (
          <CodeViewPopup
            code={code}
            onUpload={handleUpload}
            uploadDisabled={!canBuild || !uploadReady || busy}
            uploadTitle={
              busy ? status.message
              : !hasFrameInput ? 'Connect a frame to enable upload'
              : blockingErrors.length > 0 ? blockingErrors.join('\n')
              : readinessIssues.length > 0 ? readinessIssues.join('\n')
              : 'Compile & upload to the board'
            }
            busy={busy}
          />
        )}
        {validationAction && (
          <HardwareValidationPopup
            nodes={nodes}
            edges={edges}
            selectedFqbn={selectedFqbn}
            helper={helper}
            capacityResult={capacityResult}
            initialAction={validationAction}
            onClose={() => setValidationAction(null)}
          />
        )}
    </div>
  )

  const body = (
    <div className={styles.deployWorkbench}>
      {controls}
      <OutputConsole embedded />
    </div>
  )

  if (inline) {
    return (
      <div
        className={styles.inlineDeploy}
        style={{ marginLeft: leftInset, marginRight: rightInset }}
      >
        {body}
      </div>
    )
  }

  return (
    <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeployPopup() }}>
      <div
        ref={dialogRef}
        className={`${styles.popup} ${styles.deployPopup}`}
        role="dialog"
        aria-modal="true"
        aria-label="Upload tools"
        tabIndex={-1}
      >
        {body}
      </div>
    </div>
  )
}
