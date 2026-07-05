import { useMemo } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUploadStore, boardByFqbn } from '../../state/uploadStore'
import { useMusicStore } from '../../state/musicStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { sdCardConnected, readySongCount, buildShowPayload } from '../../utils/showUpload'
import styles from './Upload.module.css'

// Compact upload controls rendered in the MatrixOutput node body: Board picker,
// the selected board·port label, a "Use PSRAM" toggle (only when the selected
// board can have PSRAM), an Upload button with inline status, an Export .ino
// button, and a small button that opens the detailed output console.
export default function MatrixOutputUpload({ nodeId, enabled }: { nodeId: string; enabled: boolean }) {
  const { nodes, edges, updateNodeProperty } = useGraphStore()
  const entries = useMusicStore((s) => s.entries)
  const {
    selectedFqbn, selectedPort, ports, busy, status,
    openBoardPopup, openConsole, runUpload, runShowUpload, exportIno,
  } = useUploadStore()

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
      <button className={styles.boardBtn} onClick={openBoardPopup} title="Choose board & port, manage boards">
        ⚙ Board
      </button>
      <div className={styles.targetLabel} title={target}>{target}</div>

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
        disabled={!enabled || busy}
        onClick={() => runUpload(code, usePsram ? psramChoice?.opt : undefined)}
        title={enabled ? 'Compile & upload to the board' : 'Connect a frame to enable upload'}
      >
        {uploadLabel}
      </button>

      <button
        className={styles.exportBtn}
        disabled={!enabled}
        onClick={() => exportIno(code)}
        title="Download the generated .ino sketch"
      >
        ↓ Export .ino
      </button>

      {sdConnected && (
        <button
          className={styles.exportBtn}
          disabled={busy || readySongs === 0}
          onClick={handleShowUpload}
          title={readySongs === 0 ? 'Analyse songs in the Music Library node first' : 'Flash the provisioner, write songs/shows to SD, then flash the player'}
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
