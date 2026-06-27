import { useMemo } from 'react'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUploadStore, boardByFqbn } from '../../state/uploadStore'
import { useMusicStore } from '../../state/musicStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { sdCardConnected, readySongCount, buildShowPayload } from '../../utils/showUpload'
import styles from './Upload.module.css'

// Compact upload controls rendered in the MatrixOutput node body: Board picker,
// the selected board·port label, an Upload button with inline status, an
// Export .ino button, and a small button that opens the detailed output console.
export default function MatrixOutputUpload({ enabled }: { enabled: boolean }) {
  const { nodes, edges } = useGraphStore()
  const entries = useMusicStore((s) => s.entries)
  const {
    selectedFqbn, selectedPort, ports, busy, status,
    openBoardPopup, openConsole, runUpload, runShowUpload, exportIno,
  } = useUploadStore()

  // A Pattern Master graph generates the multi-pattern show controller; any
  // other graph generates the normal single-pattern sketch.
  const code = useMemo(() => {
    const groups = getGroupRegistry()
    return isPatternShow(nodes) ? generateShowSketch(nodes, edges, groups) : generateCpp(nodes, edges, groups)
  }, [nodes, edges])

  const board = boardByFqbn(selectedFqbn)
  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const target = `${board?.label ?? 'No board'} · ${portLabel || 'no port'}`

  // Music-sync show upload appears only when an SDCard node is wired in.
  const sdConnected = useMemo(() => sdCardConnected(nodes, edges), [nodes, edges])
  const readySongs = readySongCount(entries)
  function handleShowUpload() {
    const payload = buildShowPayload(nodes, entries)
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

      <button
        className={`${styles.uploadBtn} ${phaseClass}`}
        disabled={!enabled || busy}
        onClick={() => runUpload(code)}
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

      <button className={styles.outputBtn} onClick={openConsole} title="Show detailed output">
        ⌗ Output
      </button>
    </div>
  )
}
