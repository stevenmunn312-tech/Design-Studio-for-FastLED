import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isHardwareNodeType } from '../../build/hardware'
import { rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { useUiStore, type WorkspaceMode } from '../../state/uiStore'
import { WORKSPACE_TABS } from '../../state/workspaceTabs'
import styles from './WorkspaceTabs.module.css'

/**
 * The four workspaces, each taking the whole canvas.
 *
 * See docs/design/workspace-tabs.md. The order tells the build
 * story in the sequence it is actually done — name the hardware, write the
 * effect, flash it, then take the wiring diagram to the bench, which is the
 * other three's output. A session with anything in it lands on Graph, because
 * that is where the hours go; a blank one lands on Hardware, where choosing a
 * board is the only work available.
 */
/**
 * The count each tab announces on. A part added or removed on the bench
 * changes what Hardware, Build Diagram and Upload show — the bench, the wiring
 * sheet and the sketch — and puts a node on Graph; a node added or removed on
 * the canvas changes Graph alone. Counted on the root graph, where every part
 * lives, so the signal survives a pattern group being open on the canvas.
 */
interface ChangeSignals {
  parts: number
  nodes: number
}

const PART_TABS: readonly WorkspaceMode[] = ['hardware', 'build', 'upload']

function changedTabs(before: ChangeSignals, after: ChangeSignals): WorkspaceMode[] {
  const tabs: WorkspaceMode[] = []
  if (before.nodes !== after.nodes) tabs.push('graph')
  if (before.parts !== after.parts) tabs.push(...PART_TABS)
  return tabs
}

/**
 * Announce the workspaces whose contents just changed under you.
 *
 * Adding a part on the Hardware tab puts a node on the Graph tab and a module
 * on the wiring sheet. With both panes on screen you watched that happen; with
 * one workspace at a time it happens out of sight, so the tabs say so.
 *
 * Deliberately keyed on *an action elsewhere changing this workspace*, not on
 * the workspace changing: a tab that flashed whenever its content moved would
 * flash constantly during ordinary graph editing and teach everyone to ignore
 * it. Hence counts rather than the nodes — adding and removing parts is what
 * happens from another workspace, while editing a node you are looking at is
 * not. Each tab has its own count (see `changedTabs`), so Build Diagram and
 * Upload flash for a new part while a new pattern node flashes Graph alone.
 */
function useChangedElsewhere(active: WorkspaceMode): ReadonlySet<WorkspaceMode> {
  const signals = useGraphStore(useShallow((state): ChangeSignals => {
    const root = rootGraphNodes(state)
    return {
      parts: root.filter((node) => node.data.nodeType !== 'Board' && isHardwareNodeType(node.data.nodeType)).length,
      nodes: state.nodes.length,
    }
  }))
  const [flash, setFlash] = useState<ReadonlySet<WorkspaceMode>>(() => new Set())
  const seen = useRef(signals)

  useEffect(() => {
    // Nothing to announce about the workspace already being looked at.
    const tabs = changedTabs(seen.current, signals).filter((tab) => tab !== active)
    seen.current = signals
    if (tabs.length === 0) return
    setFlash(new Set(tabs))
    const timer = setTimeout(() => setFlash(new Set()), 1800)
    return () => clearTimeout(timer)
  }, [signals, active])

  return flash
}

export default function WorkspaceTabs() {
  const workspaceMode = useUiStore((state) => state.workspaceMode)
  const setWorkspaceMode = useUiStore((state) => state.setWorkspaceMode)
  const flash = useChangedElsewhere(workspaceMode)

  return (
    <div className={styles.bar}>
      <div className={styles.tabs} role="tablist" aria-label="Workspace">
        {WORKSPACE_TABS.map(({ mode, label }) => {
          const active = workspaceMode === mode
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.tab} ${active ? styles.tabActive : ''} ${flash.has(mode) ? styles.tabFlash : ''}`}
              onClick={() => setWorkspaceMode(mode)}
            >
              {label}
              {flash.has(mode) && <span className={styles.srOnly}> — updated</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
