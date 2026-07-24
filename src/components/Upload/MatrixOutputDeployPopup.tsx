import { useMemo, useState } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useUploadStore, boardByFqbn, engineReady } from '../../state/uploadStore'
import { useStreamStore } from '../../state/streamStore'
import { useMusicStore } from '../../state/musicStore'
import { useProjectStore } from '../../state/projectStore'
import { useCapacityStore } from '../../state/capacityStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { generateStreamReceiverSketch, streamLayoutForGraph } from '../../codegen/streamReceiverGenerator'
import { generateWiringDiagnosticSketch } from '../../codegen/wiringDiagnosticGenerator'
import { sdCardConnected, readySongCount, buildShowPayload } from '../../utils/showUpload'
import { findPinConflicts, findMatrixLayoutErrors, findBoardCompatibilityErrors, findOutputResourceErrors } from '../../utils/validateGraph'
import { summarizeCapacity } from '../../utils/capacityFormat'
import {
  buildHardwareValidationProfile,
  suggestedValidationAction,
  type HardwareValidationAction,
} from '../../utils/hardwareValidation'
import CodeViewPopup from './CodeViewPopup'
import HardwareValidationPopup from './HardwareValidationPopup'
import styles from './Upload.module.css'

type ReadinessState = 'ready' | 'checking' | 'missing'

const CAPACITY_LEVEL_CLASS = {
  ok: 'capacityOk', warn: 'capacityWarn', error: 'capacityError', pending: 'capacityPending',
} as const

export default function MatrixOutputDeployPopup() {
  const [readinessOpen, setReadinessOpen] = useState(false)
  const [validationAction, setValidationAction] = useState<HardwareValidationAction | null>(null)
  const { nodes, edges } = useGraphStore()
  const entries = useMusicStore((s) => s.entries)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const {
    helper, installedCores, selectedFqbn, selectedPort, ports, busy, status, codeViewOpen,
    refreshHelper, refreshPorts, installCore, activeOutputNodeId,
    openBoardPopup, openCliPopup, openConsole, openCodeView, closeDeployPopup, runUpload, runLastUpload, runShowUpload, exportIno,
  } = useUploadStore()
  const hasLastSketch = useUploadStore((s) => !!(currentProjectId && s.lastSketchByProject[currentProjectId]))
  const { streaming, fps: streamFps, error: streamError, start: startStreaming, stop: stopStreaming } = useStreamStore()

  const outputNode = nodes.find((n) => n.id === activeOutputNodeId && n.data.nodeType === 'MatrixOutput')
    ?? nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const ownProps = ((outputNode?.data.properties ?? {}) as Record<string, unknown>)
  const nodeId = outputNode?.id ?? ''
  const hasFrameInput = !!outputNode && edges.some((e) => e.target === nodeId && e.targetHandle === 'frame')
  const hasSdCardInput = !!outputNode && edges.some((e) => e.target === nodeId && e.targetHandle === 'sdcard')

  const board = boardByFqbn(selectedFqbn)
  const usingFbuild = helper?.engine === 'fbuild'
  const activeEngineReady = engineReady(helper)
  const psramOptions = board?.psram
  const usePsram = !!psramOptions && ownProps.usePsram === true
  const psramChoice = psramOptions?.find((o) => o.id === ownProps.psramMode) ?? psramOptions?.[0]

  const code = useMemo(() => {
    const groups = getGroupRegistry()
    const opts = { psramAllowed: !!psramOptions }
    return isPatternShow(nodes, edges)
      ? generateShowSketch(nodes, edges, groups, opts)
      : generateCpp(nodes, edges, groups, opts)
  }, [nodes, edges, psramOptions])

  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const target = `${board?.label ?? 'No board'} · ${portLabel || 'no port'}`
  const portDetected = !!selectedPort && ports.some((p) => p.address === selectedPort)
  const helperReady = !!helper
  const coreReady = !!board && (usingFbuild || installedCores.includes(board.core))
  const uploadReady = helperReady && activeEngineReady && coreReady && portDetected

  const pinConflicts = useMemo(() => findPinConflicts(nodes), [nodes])
  const layoutErrors = useMemo(() => findMatrixLayoutErrors(nodes), [nodes])
  const outputResourceErrors = useMemo(() => findOutputResourceErrors(nodes), [nodes])
  const boardCompatibilityErrors = useMemo(
    () => findBoardCompatibilityErrors(nodes, selectedFqbn),
    [nodes, selectedFqbn],
  )

  // Live controller-capacity meter (see MatrixOutputUpload.tsx, which drives
  // the actual debounced compile-check) — the measured result is the
  // authority here: only a *confirmed* overflow blocks Upload, so editing is
  // never blocked just because a check hasn't completed yet.
  const { status: capacityStatus, result: capacityResult } = useCapacityStore()
  const capacitySummary = useMemo(() => summarizeCapacity(board, capacityStatus, capacityResult), [board, capacityStatus, capacityResult])
  const capacityOverflow = capacityResult?.target === (usePsram && psramChoice ? `${selectedFqbn}:${psramChoice.opt}` : selectedFqbn)
    && !capacityResult.ok && capacityResult.overflow

  const blockingErrors = [
    ...pinConflicts,
    ...layoutErrors,
    ...outputResourceErrors,
    ...boardCompatibilityErrors,
    ...(capacityOverflow ? [`${board?.label ?? 'This board'}: design is too large to fit (live capacity check)`] : []),
  ]
  const canBuild = hasFrameInput && blockingErrors.length === 0
  const canShowUpload = hasSdCardInput && blockingErrors.length === 0
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

  const streamLayout = useMemo(() => streamLayoutForGraph(nodes), [nodes])
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
    const sketch = generateStreamReceiverSketch(nodes)
    if (sketch) runUpload(sketch, usePsram ? psramChoice?.opt : undefined, { cache: false })
  }
  function handleFlashWiringTest() {
    const sketch = generateWiringDiagnosticSketch(nodes, nodeId)
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

  const sdConnected = useMemo(() => sdCardConnected(nodes, edges), [nodes, edges])
  const readySongs = readySongCount(entries)
  function handleShowUpload() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      const payload = buildShowPayload(nodes, entries, getGroupRegistry())
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
      await offerValidationAfter(suggestedAction, runUpload(code, usePsram ? psramChoice?.opt : undefined))
    })()
  }

  function handleLastUpload() {
    void offerValidationAfter(suggestedAction, runLastUpload())
  }
  function handleExportIno() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      exportIno(code)
    })()
  }

  const phaseClass =
    status.phase === 'error' ? styles.stError
    : status.phase === 'done' ? styles.stDone
    : status.phase === 'idle' ? ''
    : styles.stBusy

  const uploadLabel =
    status.phase === 'idle' ? '↑ Upload'
    : status.phase === 'done' ? '✓ Done'
    : status.phase === 'error' ? '✗ Error'
    : status.message

  if (!outputNode) return null

  return (
    <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeployPopup() }}>
      <div className={`${styles.popup} ${styles.deployPopup}`} role="dialog" aria-label="Upload tools">
        <div className={styles.popupHeader}>
          <div>
            <div className={styles.wizardKicker}>Upload</div>
            <div className={styles.wizardTitle}>Deploy to hardware</div>
          </div>
          <button className={styles.closeBtn} onClick={closeDeployPopup} title="Close">×</button>
        </div>

        <div className={styles.targetBig}>{target}</div>
        {hasFrameInput && (
          <div
            className={`${styles.capacityLine} ${styles[CAPACITY_LEVEL_CLASS[capacitySummary.level]]}`}
            title={
              capacityResult && !capacityResult.ok && capacityResult.log
                ? `Live controller-capacity check failed:\n${capacityResult.log.slice(-1500)}`
                : 'Live controller-capacity check, compiled against the selected board with no port needed'
            }
          >
            {capacitySummary.text}
          </div>
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

        <button
          className={`${styles.wizardButtonBase} ${styles.uploadBtn} ${phaseClass}`}
          disabled={!canBuild || !uploadReady || busy}
          aria-busy={busy}
          onClick={handleUpload}
          title={
            busy ? status.message
            : !hasFrameInput ? 'Connect a frame to enable upload'
            : blockingErrors.length > 0 ? blockingErrors.join('\n')
            : readinessIssues.length > 0 ? readinessIssues.join('\n')
            : 'Compile & upload to the board'
          }
        >
          <span className={busy ? styles.busyText : undefined}>{uploadLabel}</span>
        </button>

        {blockingErrors.length > 0 && (
          <div className={styles.streamError}>
            {blockingErrors.map((c) => <div key={c}>{c}</div>)}
          </div>
        )}

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

          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!uploadReady || blockingErrors.length > 0 || busy}
            onClick={handleFlashWiringTest}
            title={
              blockingErrors.length > 0
                ? blockingErrors.join('\n')
                : readinessIssues.length > 0
                  ? readinessIssues.join('\n')
                  : 'Flash a standalone wiring diagnostic sketch using the current Matrix Output board, pins, color order, brightness, power cap, and layout settings'
            }
          >
            🧪 Flash Wiring Test
          </button>

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

          {sdConnected && (
            <button
              className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
              disabled={!canShowUpload || !uploadReady || busy || readySongs === 0}
              onClick={handleShowUpload}
              title={
                !hasSdCardInput
                  ? 'Connect an SD Card node to Matrix Output to enable SD-show upload'
                  : readinessIssues.length > 0
                    ? readinessIssues.join('\n')
                    : readySongs === 0
                      ? 'Analyse music in the Music Library node first'
                      : 'Flash the provisioner, write music/show files to SD, then flash the player'
              }
            >
              ♪ Upload show to SD ({readySongs})
            </button>
          )}

          <button className={`${styles.wizardButtonBase} ${styles.outputBtn}`} onClick={openConsole} title="Show build and serial output">
            ⌗ Output / Serial
          </button>
        </div>

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
    </div>
  )
}
