import { useUiStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import styles from './MenuBar.module.css'

export default function MenuBar() {
  const { toggleSidebar, toggleInspector, setStatus } = useUiStore()
  const nodeCount = useGraphStore((s) => s.nodes.length)
  const edgeCount = useGraphStore((s) => s.edges.length)

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
