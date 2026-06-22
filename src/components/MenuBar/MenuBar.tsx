import { useUiStore } from '../../state/uiStore'
import { useGraphStore, useTemporalStore } from '../../state/graphStore'
import styles from './MenuBar.module.css'

export default function MenuBar() {
  const { toggleSidebar, toggleInspector, setStatus } = useUiStore()
  const nodeCount = useGraphStore((s) => s.nodes.length)
  const edgeCount = useGraphStore((s) => s.edges.length)

  const { undo, redo, pastStates, futureStates } = useTemporalStore((s) => s)
  const canUndo = pastStates.length > 0
  const canRedo = futureStates.length > 0

  const handleExport = () => {
    setStatus('Generating firmware… (not yet implemented)', 'info')
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
        <button className={styles.btnAccent} onClick={handleExport}>
          ↑ Upload
        </button>
      </nav>
      <div className={styles.info}>
        <span>{nodeCount} nodes · {edgeCount} connections</span>
      </div>
    </header>
  )
}
