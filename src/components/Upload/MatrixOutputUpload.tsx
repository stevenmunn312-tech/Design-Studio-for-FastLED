import { useMemo } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useUploadStore, boardByFqbn, engineReady } from '../../state/uploadStore'
import { useStreamStore } from '../../state/streamStore'
import { useMusicStore } from '../../state/musicStore'
import { useProjectStore } from '../../state/projectStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { generateStreamReceiverSketch, streamLayoutForGraph } from '../../codegen/streamReceiverGenerator'
import { generateWiringDiagnosticSketch } from '../../codegen/wiringDiagnosticGenerator'
import { sdCardConnected, readySongCount, buildShowPayload } from '../../utils/showUpload'
import { findPinConflicts, findMatrixLayoutErrors, estimatePowerLoad, estimateFirmwareRam } from '../../utils/validateGraph'
import CodeViewPopup from './CodeViewPopup'
import styles from './Upload.module.css'

// Compact upload controls rendered in the MatrixOutput node body: Board picker,
// the selected board·port label, a "Use PSRAM" toggle (only when the selected
// board can have PSRAM), an Upload button with inline status, an Export .ino
// button, and a small button that opens the detailed output console.

type ReadinessState = 'ready' | 'checking' | 'missing'

export default function MatrixOutputUpload({
  nodeId,
  hasFrameInput,
  hasSdCardInput,
}: {
  nodeId: string
  hasFrameInput: boolean
  hasSdCardInput: boolean
}) {
  const { nodes, edges, updateNodeProperty } = useGraphStore()
  const entries = useMusicStore((s) => s.entries)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const {
    helper, installedCores, selectedFqbn, selectedPort, ports, busy, status, codeViewOpen,
    refreshHelper, refreshPorts, installCore,
    openBoardPopup, openCliPopup, openConsole, openCodeView, runUpload, runLastUpload, runShowUpload, exportIno,
  } = useUploadStore()
  const hasLastSketch = useUploadStore((s) => !!(currentProjectId && s.lastSketchByProject[currentProjectId]))
  const { streaming, fps: streamFps, error: streamError, start: startStreaming, stop: stopStreaming } = useStreamStore()

  const board = boardByFqbn(selectedFqbn)
  const usingFbuild = helper?.engine === 'fbuild'
  const activeEngineReady = engineReady(helper)

  // PSRAM: the board catalogue says whether this MCU *can* have external PSRAM
  // (it can't be probed from the host before flashing — the firmware checks
  // psramFound() at runtime and falls back to internal heap). When on, the
  // generated sketch allocates its render buffers from PSRAM and the build
  // enables the matching FQBN option (OPI vs QSPI is a module-package choice
  // the user picks; the wrong one boot-loops, so it's surfaced, not guessed).
  const ownProps = (nodes.find((n) => n.id === nodeId)?.data.properties ?? {}) as Record<string, unknown>
  const psramOptions = board?.psram
  const usePsram = !!psramOptions && ownProps.usePsram === true
  const psramChoice = psramOptions?.find((o) => o.id === ownProps.psramMode) ?? psramOptions?.[0]

  // A Pattern Master graph generates the multi-pattern show controller; any
  // other graph generates the normal single-pattern sketch.
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
  const permissionReady = helperReady && portDetected
  const uploadReady = helperReady && activeEngineReady && coreReady && portDetected && permissionReady

  // Duplicate GPIO assignments across LED data/clock, mic/SD I2S, and the
  // hardware-input nodes would silently misbehave or fail to boot on real
  // hardware — block compile/upload/export until they're resolved.
  const pinConflicts = useMemo(() => findPinConflicts(nodes), [nodes])
  const layoutErrors = useMemo(() => findMatrixLayoutErrors(nodes), [nodes])
  const blockingErrors = [...pinConflicts, ...layoutErrors]
  const canBuild = hasFrameInput && blockingErrors.length === 0
  const canShowUpload = hasSdCardInput && blockingErrors.length === 0
  const power = useMemo(() => estimatePowerLoad(nodes), [nodes])
  const ram = useMemo(() => estimateFirmwareRam(nodes, edges), [nodes, edges])
  const readiness = useMemo(() => {
    const helperRow = helper === undefined
      ? {
          label: 'Helper',
          state: 'checking' as ReadinessState,
          detail: 'Checking for the local upload helper…',
        }
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
      ? {
          label: 'Engine',
          state: 'checking' as ReadinessState,
          detail: 'Waiting for helper status…',
        }
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
            ? {
                label: 'Engine',
                state: 'ready' as ReadinessState,
                detail: `Using fbuild${helper.fbuildVersion ? ` ${helper.fbuildVersion}` : ''}`,
              }
            : {
                label: 'Engine',
                state: 'ready' as ReadinessState,
                detail: `Using arduino-cli${helper.version ? ` ${helper.version}` : ''}`,
              }

    const coreRow = helper === undefined
      ? {
          label: 'Toolchain',
          state: 'checking' as ReadinessState,
          detail: 'Checking board toolchain…',
        }
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
            ? {
                label: 'Toolchain',
                state: 'ready' as ReadinessState,
                detail: `${board?.label ?? 'Selected board'} toolchain downloads on first fbuild compile.`,
              }
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
                : {
                    label: 'Toolchain',
                    state: 'ready' as ReadinessState,
                    detail: `${board.label} core is installed.`,
                  }

    const portRow = helper === undefined
      ? {
          label: 'Port',
          state: 'checking' as ReadinessState,
          detail: 'Scanning for serial ports…',
        }
      : !helper
        ? {
            label: 'Port',
            state: 'missing' as ReadinessState,
            detail: 'Start the helper before Studio can list ports.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : !selectedPort
          ? {
              label: 'Port',
              state: 'missing' as ReadinessState,
              detail: 'Pick the board’s USB/serial port.',
              actionLabel: 'Choose port',
              action: openBoardPopup,
            }
          : !portDetected
            ? {
                label: 'Port',
                state: 'missing' as ReadinessState,
                detail: `${selectedPort} is not currently detected.`,
                actionLabel: 'Refresh ports',
                action: () => { void refreshPorts() },
              }
            : {
                label: 'Port',
                state: 'ready' as ReadinessState,
                detail: `${portLabel || selectedPort} ready`,
              }

    const permissionsRow = helper === undefined
      ? {
          label: 'Permissions',
          state: 'checking' as ReadinessState,
          detail: 'Checking local upload access…',
        }
      : !helper
        ? {
            label: 'Permissions',
            state: 'missing' as ReadinessState,
            detail: 'The browser needs the helper to reach local serial ports and build tools.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : !selectedPort
          ? {
              label: 'Permissions',
              state: 'missing' as ReadinessState,
              detail: 'Choose a port before the helper can claim upload access.',
              actionLabel: 'Choose port',
              action: openBoardPopup,
            }
          : !portDetected
            ? {
                label: 'Permissions',
                state: 'missing' as ReadinessState,
                detail: 'Reconnect the board or refresh ports so the helper can open it.',
                actionLabel: 'Refresh ports',
                action: () => { void refreshPorts() },
              }
            : streaming
              ? {
                  label: 'Permissions',
                  state: 'ready' as ReadinessState,
                  detail: 'Live Stream owns the port now; Upload will stop it automatically first.',
                }
              : {
                  label: 'Permissions',
                  state: 'ready' as ReadinessState,
                  detail: 'Local upload access is ready.',
                }

    return [helperRow, engineRow, coreRow, portRow, permissionsRow]
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

  // Live streaming: push already-computed preview frames to a once-flashed
  // generic Adalight receiver instead of a compile+flash cycle per tweak.
  const streamLayout = useMemo(() => streamLayoutForGraph(nodes), [nodes])
  function handleFlashReceiver() {
    const sketch = generateStreamReceiverSketch(nodes)
    if (sketch) runUpload(sketch, usePsram ? psramChoice?.opt : undefined, { cache: false })
  }
  function handleFlashWiringTest() {
    const sketch = generateWiringDiagnosticSketch(nodes)
    if (sketch) runUpload(sketch, undefined, { cache: false })
  }
  function handleToggleStream() {
    if (streaming) { stopStreaming(); return }
    if (!selectedPort || !streamLayout) return
    void startStreaming(selectedPort, streamLayout)
  }

  // Music-sync show upload appears only when an SDCard node is wired in.
  const sdConnected = useMemo(() => sdCardConnected(nodes, edges), [nodes, edges])
  const readySongs = readySongCount(entries)
  function handleShowUpload() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      const payload = buildShowPayload(nodes, entries, getGroupRegistry())
      if (payload) runShowUpload(payload)
    })()
  }

  // Uploading/exporting the graph's own generated sketch embeds any
  // CustomFormula/Code node source verbatim — if this project isn't trusted
  // yet (content from outside this browser), warn before sending it to real
  // hardware. Lighter than the render-blocking trust gate: it's a one-off
  // confirm, not a grant of trust, since export/upload is already an
  // explicit, reviewable user action (todo.md's P0 trust item).
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
      runUpload(code, usePsram ? psramChoice?.opt : undefined)
    })()
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

  return (
    <div className={`nodrag ${styles.nodeBox}`}>
      <div className={styles.nodeHeader}>
        <span className={styles.nodeKicker}>Hardware bay</span>
        <span className={styles.nodeMeta}>{sdConnected ? 'Matrix + SD pipeline' : 'Matrix pipeline'}</span>
      </div>
      <div className={styles.targetRow}>
        <span className={styles.targetChip}>{board?.label ?? 'No board selected'}</span>
        <span className={styles.targetChip}>{portLabel || 'No port'}</span>
      </div>
      <button className={styles.boardBtn} onClick={openBoardPopup} title="Choose board & port, manage boards">
        ⚙ Board
      </button>
      <div className={styles.targetLabel} title={target}>{target}</div>
      <div className={styles.readinessPanel} aria-label="Upload readiness">
        <div className={styles.readinessHeader}>
          <span className={styles.readinessTitle}>Upload readiness</span>
          <span className={`${styles.readinessSummary} ${uploadReady ? styles.readyBadge : styles.missingBadge}`}>
            {uploadReady ? 'Ready to upload' : 'Action needed'}
          </span>
        </div>
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

      {power && power.ledCount > 0 && (
        <div
          className={`${styles.powerRow} ${power.exceedsConfigured ? styles.powerWarn : ''}`}
          title="Worst-case draw assumes every LED at full white (~60 mA/LED, the typical WS2812-class figure) — real draw is usually well under this."
        >
          {power.ledCount} LEDs · worst case ~{(power.worstCaseMa / 1000).toFixed(1)} A
          {power.configuredMa != null
            ? ` · cap ${(power.configuredMa / 1000).toFixed(1)} A${power.exceedsConfigured ? ' ⚠ may exceed cap' : ''}`
            : ` · recommended PSU ≥ ${(power.recommendedMa / 1000).toFixed(1)} A`}
        </div>
      )}

      {ram && ram.ledCount > 0 && (
        <div
          className={styles.powerRow}
          title="Internal RAM = the physical LED array plus any render buffers not offloaded to PSRAM, plus fixed simulation-node state (heat maps, particle pools, etc.) which always stays internal. Rough estimate — actual usage also depends on the rest of the sketch."
        >
          ~{(ram.internalBytes / 1024).toFixed(1)} KB internal
          {ram.psramBytes > 0 ? ` · ~${(ram.psramBytes / 1024).toFixed(1)} KB PSRAM` : ''}
        </div>
      )}

      {psramOptions && (
        <div className={styles.psramRow}>
          <label className={styles.psramCheck} title="Put the render buffers in external PSRAM — frees internal RAM for designs too big to link. Needs a module with PSRAM (falls back to internal heap without one).">
            <input
              type="checkbox"
              checked={usePsram}
              onChange={(e) => updateNodeProperty(nodeId, 'usePsram', e.target.checked)}
            />
            Use PSRAM
          </label>
          {usePsram && psramOptions.length > 1 && (
            <select
              className={`nodrag ${styles.psramSelect}`}
              value={psramChoice?.id}
              onChange={(e) => updateNodeProperty(nodeId, 'psramMode', e.target.value)}
              title="PSRAM interface — set by the module package (picking the wrong one makes the board boot-loop)"
            >
              {psramOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <button
        className={`${styles.uploadBtn} ${phaseClass}`}
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

      <button
        className={styles.exportBtn}
        disabled={busy || !hasLastSketch}
        onClick={runLastUpload}
        title={hasLastSketch ? 'Re-send the most recently uploaded sketch for this project without regenerating it' : 'Upload once to cache a quick re-upload target for this project'}
      >
        ↻ Re-upload last sketch
      </button>

      <button
        className={styles.exportBtn}
        disabled={!hasFrameInput || blockingErrors.length > 0}
        onClick={handleExportIno}
        title={!hasFrameInput ? 'Connect a frame to enable export' : blockingErrors.length > 0 ? blockingErrors.join('\n') : 'Download the generated .ino sketch'}
      >
        ↓ Export .ino
      </button>

      <button
        className={styles.exportBtn}
        disabled={!hasFrameInput}
        onClick={openCodeView}
        title={hasFrameInput ? 'View the generated .ino sketch' : 'Connect a frame to view the generated .ino sketch'}
      >
        {'</>'} View Code
      </button>

      {codeViewOpen && <CodeViewPopup code={code} />}

      <button
        className={styles.exportBtn}
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
        className={styles.exportBtn}
        disabled={!canBuild || !uploadReady || busy || streaming}
        onClick={handleFlashReceiver}
        title={readinessIssues.length > 0 ? readinessIssues.join('\n') : 'Flash a tiny generic receiver sketch once — after that, Live Stream pushes preview frames straight to the board without recompiling'}
      >
        ⚡ Flash Stream Receiver
      </button>

      <button
        className={`${styles.exportBtn} ${streaming ? styles.streamBtnActive : ''}`}
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
      {streamError && <div className={styles.streamError}>{streamError}</div>}

      {sdConnected && (
        <button
          className={styles.exportBtn}
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

      <button className={styles.outputBtn} onClick={openConsole} title="Show build and serial output">
        ⌗ Output / Serial
      </button>
    </div>
  )
}
