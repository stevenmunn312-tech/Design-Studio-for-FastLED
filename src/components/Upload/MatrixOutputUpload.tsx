import { useMemo } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUploadStore, boardByFqbn } from '../../state/uploadStore'
import { useStreamStore } from '../../state/streamStore'
import { useMusicStore } from '../../state/musicStore'
import { useProjectStore } from '../../state/projectStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { generateStreamReceiverSketch, streamLayoutForGraph } from '../../codegen/streamReceiverGenerator'
import { sdCardConnected, readySongCount, buildShowPayload } from '../../utils/showUpload'
import { findPinConflicts, findMatrixLayoutErrors, estimatePowerLoad, estimateFirmwareRam } from '../../utils/validateGraph'
import CodeViewPopup from './CodeViewPopup'
import styles from './Upload.module.css'

// Compact upload controls rendered in the MatrixOutput node body: Board picker,
// the selected board·port label, a "Use PSRAM" toggle (only when the selected
// board can have PSRAM), an Upload button with inline status, an Export .ino
// button, and a small button that opens the detailed output console.
export default function MatrixOutputUpload({ nodeId, enabled }: { nodeId: string; enabled: boolean }) {
  const { nodes, edges, updateNodeProperty } = useGraphStore()
  const entries = useMusicStore((s) => s.entries)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const {
    selectedFqbn, selectedPort, ports, busy, status, codeViewOpen,
    openBoardPopup, openConsole, openCodeView, runUpload, runLastUpload, runShowUpload, exportIno,
  } = useUploadStore()
  const hasLastSketch = useUploadStore((s) => !!(currentProjectId && s.lastSketchByProject[currentProjectId]))
  const { streaming, fps: streamFps, error: streamError, start: startStreaming, stop: stopStreaming } = useStreamStore()

  const board = boardByFqbn(selectedFqbn)

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

  // Duplicate GPIO assignments across LED data/clock, mic/SD I2S, and the
  // hardware-input nodes would silently misbehave or fail to boot on real
  // hardware — block compile/upload/export until they're resolved.
  const pinConflicts = useMemo(() => findPinConflicts(nodes), [nodes])
  const layoutErrors = useMemo(() => findMatrixLayoutErrors(nodes), [nodes])
  const blockingErrors = [...pinConflicts, ...layoutErrors]
  const canBuild = enabled && blockingErrors.length === 0
  const power = useMemo(() => estimatePowerLoad(nodes), [nodes])
  const ram = useMemo(() => estimateFirmwareRam(nodes, edges), [nodes, edges])

  // Live streaming: push already-computed preview frames to a once-flashed
  // generic Adalight receiver instead of a compile+flash cycle per tweak.
  const streamLayout = useMemo(() => streamLayoutForGraph(nodes), [nodes])
  function handleFlashReceiver() {
    const sketch = generateStreamReceiverSketch(nodes)
    if (sketch) runUpload(sketch, usePsram ? psramChoice?.opt : undefined, { cache: false })
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
    const payload = buildShowPayload(nodes, entries, getGroupRegistry())
    if (payload) runShowUpload(payload)
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
        disabled={!canBuild || busy}
        aria-busy={busy}
        onClick={() => runUpload(code, usePsram ? psramChoice?.opt : undefined)}
        title={
          busy ? status.message
          : !enabled ? 'Connect a frame to enable upload'
          : blockingErrors.length > 0 ? blockingErrors.join('\n')
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
        disabled={!enabled || blockingErrors.length > 0}
        onClick={() => exportIno(code)}
        title={!enabled ? 'Connect a frame to enable export' : blockingErrors.length > 0 ? blockingErrors.join('\n') : 'Download the generated .ino sketch'}
      >
        ↓ Export .ino
      </button>

      <button
        className={styles.exportBtn}
        disabled={!enabled}
        onClick={openCodeView}
        title="View the generated .ino sketch"
      >
        {'</>'} View Code
      </button>

      {codeViewOpen && <CodeViewPopup code={code} />}

      <button
        className={styles.exportBtn}
        disabled={!canBuild || busy || streaming}
        onClick={handleFlashReceiver}
        title="Flash a tiny generic receiver sketch once — after that, Live Stream pushes preview frames straight to the board without recompiling"
      >
        ⚡ Flash Stream Receiver
      </button>

      <button
        className={`${styles.exportBtn} ${streaming ? styles.streamBtnActive : ''}`}
        disabled={!canBuild || busy || !selectedPort}
        onClick={handleToggleStream}
        title={streaming ? 'Stop pushing live preview frames to the board' : 'Push live preview frames to a board already running the Stream Receiver sketch'}
      >
        {streaming ? `⏹ Streaming — ${streamFps} fps` : '📡 Live Stream'}
      </button>
      {streamError && <div className={styles.streamError}>{streamError}</div>}

      {sdConnected && (
        <button
          className={styles.exportBtn}
          disabled={!canBuild || busy || readySongs === 0}
          onClick={handleShowUpload}
          title={readySongs === 0 ? 'Analyse music in the Music Library node first' : 'Flash the provisioner, write music/show files to SD, then flash the player'}
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
