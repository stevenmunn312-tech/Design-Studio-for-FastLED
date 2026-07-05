import { useRef } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useGraphStore, useTemporalStore } from '../../state/graphStore'
import type { StudioNode, StudioEdge, WorkspaceExtras } from '../../state/graphStore'
import { runTidy } from '../../utils/tidyGraph'
import styles from './MenuBar.module.css'

export default function MenuBar() {
  const { setStatus, theme, cycleTheme, reducedMotion, toggleReducedMotion, highContrast, toggleHighContrast, openHelp, toggleStageMode } = useUiStore()

  const THEME_ICON: Record<string, string> = { dark: '☾', solarized: '✦', light: '☀' }
  const THEME_LABEL: Record<string, string> = { dark: 'Dark', solarized: 'Solarized', light: 'Light' }
  const nodeCount = useGraphStore((s) => s.nodes.length)
  const edgeCount = useGraphStore((s) => s.edges.length)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { undo, redo, pastStates, futureStates } = useTemporalStore((s) => s)
  const canUndo = pastStates.length > 0
  const canRedo = futureStates.length > 0

  const handleSaveJSON = () => {
    // Export the whole workspace so pattern-group subgraphs travel with the file.
    const { nodes, edges, graphData, graphs, activeGraphId } = useGraphStore.getState()
    const json = JSON.stringify({ nodes, edges, graphData, graphs, activeGraphId }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fastled-studio-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Graph exported', 'success')
  }

  const handleLoadJSON = () => fileInputRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const { nodes, edges, graphData, graphs, activeGraphId } = JSON.parse(ev.target?.result as string) as
          { nodes: StudioNode[]; edges: StudioEdge[] } & WorkspaceExtras
        useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
        useGraphStore.temporal.getState().clear()
        setStatus('Graph loaded', 'success')
      } catch {
        setStatus('Failed to load graph — invalid file', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <header className={styles.menubar}>
      <div className={styles.brand}>
        <span className={styles.logo}>⬡</span>
        <span className={styles.title}>FastLED Studio</span>
      </div>
      <nav className={styles.nav}>
        <button
          className={styles.btn}
          onClick={() => undo()}
          disabled={!canUndo}
          aria-label={`Undo, ${pastStates.length} step${pastStates.length !== 1 ? 's' : ''} available`}
          title={`Undo (Ctrl+Z) — ${pastStates.length} step${pastStates.length !== 1 ? 's' : ''}`}
        >
          ↩ Undo {pastStates.length > 0 ? pastStates.length : ''}
        </button>
        <button
          className={styles.btn}
          onClick={() => redo()}
          disabled={!canRedo}
          aria-label={`Redo, ${futureStates.length} step${futureStates.length !== 1 ? 's' : ''} available`}
          title={`Redo (Ctrl+Y) — ${futureStates.length} step${futureStates.length !== 1 ? 's' : ''}`}
        >
          ↪ Redo {futureStates.length > 0 ? futureStates.length : ''}
        </button>
        <button
          className={styles.btn}
          onClick={() => runTidy()}
          aria-label="Tidy graph layout"
          title="Auto-arrange nodes into tidy columns (select 2+ nodes to tidy just those)"
        >
          ▦ Tidy
        </button>
        <div className={styles.sep} />
        <button className={styles.btn} onClick={handleSaveJSON} aria-label="Export graph as JSON" title="Export graph as JSON (Ctrl+S)">
          ↓ Save
        </button>
        <button className={styles.btn} onClick={handleLoadJSON} aria-label="Import graph from JSON" title="Import graph from JSON">
          ↑ Load
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div className={styles.sep} />
        <button
          className={styles.stageBtn}
          onClick={toggleStageMode}
          aria-label="Enter Stage Mode"
          title="Enter Stage Mode (F10)"
        >
          ◈ Stage
        </button>
        <div className={styles.sep} />
        <button
          className={styles.btn}
          onClick={cycleTheme}
          aria-label={`Theme: ${THEME_LABEL[theme]}. Click to cycle theme`}
          title={`Theme: ${THEME_LABEL[theme]} (click to cycle)`}
        >
          {THEME_ICON[theme]} {THEME_LABEL[theme]}
        </button>
        <button
          className={`${styles.btn} ${reducedMotion ? styles.btnActive : ''}`}
          onClick={toggleReducedMotion}
          aria-label="Toggle reduced motion"
          aria-pressed={reducedMotion}
          title="Toggle reduced motion"
        >
          {reducedMotion ? '⏸' : '▶'} Motion
        </button>
        <button
          className={`${styles.btn} ${highContrast ? styles.btnActive : ''}`}
          onClick={toggleHighContrast}
          aria-label="Toggle high contrast"
          aria-pressed={highContrast}
          title="Toggle high contrast"
        >
          ◑ Contrast
        </button>
        <div className={styles.sep} />
        <button
          className={styles.btn}
          onClick={openHelp}
          aria-label="Open help"
          title="Help (shortcuts, nodes, upload guide) — press ?"
        >
          ? Help
        </button>
      </nav>
      <div className={styles.info}>
        <span>{nodeCount} nodes · {edgeCount} connections</span>
      </div>
    </header>
  )
}
