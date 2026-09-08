import { useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore, type WorkspaceMode } from '../../state/uiStore'
import styles from './WorkspaceTabs.module.css'

/**
 * The four workspaces, each taking the whole canvas.
 *
 * See docs/development/design/workspace-tabs.md. The order tells the build
 * story — choose parts, see them wired, program them, flash them — while the
 * store lands a session on Graph, because that is where the hours go.
 */
const TABS: { mode: WorkspaceMode; label: string }[] = [
  { mode: 'hardware', label: 'Hardware' },
  { mode: 'build', label: 'Build Diagram' },
  { mode: 'graph', label: 'Graph' },
  { mode: 'upload', label: 'Upload' },
]

/**
 * Announce a workspace whose contents just changed under you.
 *
 * Adding a part on the Hardware tab puts a node on the Graph tab. With both
 * panes on screen you watched that happen; with one workspace at a time it
 * happens out of sight, so the tab says so.
 *
 * Deliberately keyed on *an action elsewhere changing this workspace*, not on
 * the workspace changing: a tab that flashed whenever its content moved would
 * flash constantly during ordinary graph editing and teach everyone to ignore
 * it. Hence the node count rather than the nodes — adding and removing parts is
 * what happens from another workspace, while editing a node you are looking at
 * is not.
 */
function useChangedElsewhere(active: WorkspaceMode): WorkspaceMode | null {
  const nodeCount = useGraphStore((state) => state.nodes.length)
  const [flash, setFlash] = useState<WorkspaceMode | null>(null)
  const seen = useRef(nodeCount)

  useEffect(() => {
    const changed = seen.current !== nodeCount
    seen.current = nodeCount
    // Nothing to announce about the workspace already being looked at.
    if (!changed || active === 'graph') return
    setFlash('graph')
    const timer = setTimeout(() => setFlash(null), 1800)
    return () => clearTimeout(timer)
  }, [nodeCount, active])

  return flash
}

export default function WorkspaceTabs() {
  const workspaceMode = useUiStore((state) => state.workspaceMode)
  const setWorkspaceMode = useUiStore((state) => state.setWorkspaceMode)
  const flash = useChangedElsewhere(workspaceMode)

  return (
    <div className={styles.tabs} role="tablist" aria-label="Workspace">
      {TABS.map(({ mode, label }) => {
        const active = workspaceMode === mode
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.tab} ${active ? styles.tabActive : ''} ${flash === mode ? styles.tabFlash : ''}`}
            onClick={() => setWorkspaceMode(mode)}
          >
            {label}
            {flash === mode && <span className={styles.srOnly}> — updated</span>}
          </button>
        )
      })}
    </div>
  )
}
