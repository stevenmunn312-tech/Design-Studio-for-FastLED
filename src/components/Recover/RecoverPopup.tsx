import { useState } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { loadSnapshots } from '../../state/snapshotHistory'
import styles from './RecoverPopup.module.css'

function relativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`
  const diffDay = Math.round(diffHour / 24)
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
}

// A safety net alongside the 100-step undo stack: undo history is cleared on
// every load/reload, so a rolling set of whole-workspace snapshots (taken
// periodically in App.tsx) gives a way back after an accidental wipe or a
// bad import that undo can no longer reach.
export default function RecoverPopup() {
  const closeRecover = useUiStore((s) => s.closeRecover)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const setStatus = useUiStore((s) => s.setStatus)
  const [snapshots] = useState(() => loadSnapshots())

  const restore = async (id: string) => {
    const snap = snapshots.find((s) => s.id === id)
    if (!snap) return
    const ok = await requestConfirm({
      title: 'Restore recovery snapshot?',
      message: `Restore the recovery snapshot from ${relativeTime(snap.timestamp)}? Your current project workspace will be replaced (this can be undone with Ctrl+Z).`,
      confirmLabel: 'Restore snapshot',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!ok) return
    const { nodes, edges, graphData, graphs, activeGraphId } = snap.workspace
    useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
    setStatus(`Restored recovery snapshot from ${relativeTime(snap.timestamp)}`, 'success')
    closeRecover()
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeRecover() }}>
      <div className={styles.popup} role="dialog" aria-label="Recovery snapshots">
        <div className={styles.header}>
          <span>Recovery Snapshots</span>
          <button className={styles.closeBtn} onClick={closeRecover} title="Close">×</button>
        </div>
        <div className={styles.hint}>
          Rolling recovery snapshots taken periodically while you work — a fallback for when undo
          history has already been cleared (for example after a reload or a bad Graph JSON import).
        </div>
        {snapshots.length === 0 ? (
          <div className={styles.empty}>No recovery snapshots yet — they&apos;re taken automatically every couple of minutes while you have nodes on the canvas.</div>
        ) : (
          <div className={styles.list}>
            {snapshots.map((snap) => (
              <div key={snap.id} className={styles.row}>
                <div className={styles.rowInfo}>
                  <span className={styles.rowTime}>{relativeTime(snap.timestamp)}</span>
                  <span className={styles.rowMeta}>{snap.nodeCount} node{snap.nodeCount === 1 ? '' : 's'}</span>
                </div>
                <button className={styles.restoreBtn} onClick={() => { void restore(snap.id) }}>Restore</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
