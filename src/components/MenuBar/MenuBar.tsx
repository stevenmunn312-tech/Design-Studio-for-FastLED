import { useRef } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useGraphStore, useTemporalStore } from '../../state/graphStore'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import styles from './MenuBar.module.css'

export default function MenuBar() {
  const { toggleSidebar, toggleInspector, setStatus, theme, cycleTheme, reducedMotion, toggleReducedMotion, highContrast, toggleHighContrast, setShowUploadPanel } = useUiStore()

  const THEME_ICON: Record<string, string> = { dark: '☾', solarized: '✦', light: '☀' }
  const THEME_LABEL: Record<string, string> = { dark: 'Dark', solarized: 'Solarized', light: 'Light' }
  const nodeCount = useGraphStore((s) => s.nodes.length)
  const edgeCount = useGraphStore((s) => s.edges.length)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { undo, redo, pastStates, futureStates } = useTemporalStore((s) => s)
  const canUndo = pastStates.length > 0
  const canRedo = futureStates.length > 0

  const handleSaveJSON = () => {
    const { nodes, edges } = useGraphStore.getState()
    const json = JSON.stringify({ nodes, edges }, null, 2)
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
        const { nodes, edges } = JSON.parse(ev.target?.result as string) as {
          nodes: StudioNode[]
          edges: StudioEdge[]
        }
        useGraphStore.getState().loadGraph(nodes, edges)
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
        <button className={styles.btn} onClick={toggleSidebar}>
          Nodes
        </button>
        <button className={styles.btn} onClick={toggleInspector}>
          Inspector
        </button>
        <div className={styles.sep} />
        <button
          className={styles.btn}
          onClick={() => undo()}
          disabled={!canUndo}
          title={`Undo (Ctrl+Z) — ${pastStates.length} step${pastStates.length !== 1 ? 's' : ''}`}
        >
          ↩ {pastStates.length > 0 ? pastStates.length : ''}
        </button>
        <button
          className={styles.btn}
          onClick={() => redo()}
          disabled={!canRedo}
          title={`Redo (Ctrl+Y) — ${futureStates.length} step${futureStates.length !== 1 ? 's' : ''}`}
        >
          ↪ {futureStates.length > 0 ? futureStates.length : ''}
        </button>
        <div className={styles.sep} />
        <button className={styles.btn} onClick={handleSaveJSON} title="Export graph as JSON (Ctrl+S)">
          ↓ Save
        </button>
        <button className={styles.btn} onClick={handleLoadJSON} title="Import graph from JSON">
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
        <button className={styles.btnAccent} onClick={() => setShowUploadPanel(true)}>
          ↑ Upload
        </button>
        <div className={styles.sep} />
        <button
          className={styles.btn}
          onClick={cycleTheme}
          title={`Theme: ${THEME_LABEL[theme]} (click to cycle)`}
        >
          {THEME_ICON[theme]} {THEME_LABEL[theme]}
        </button>
        <button
          className={`${styles.btn} ${reducedMotion ? styles.btnActive : ''}`}
          onClick={toggleReducedMotion}
          title="Toggle reduced motion"
        >
          {reducedMotion ? '⏸' : '▶'}
        </button>
        <button
          className={`${styles.btn} ${highContrast ? styles.btnActive : ''}`}
          onClick={toggleHighContrast}
          title="Toggle high contrast"
        >
          ◑
        </button>
      </nav>
      <div className={styles.info}>
        <span>{nodeCount} nodes · {edgeCount} connections</span>
      </div>
    </header>
  )
}
