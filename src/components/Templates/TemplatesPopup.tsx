import { useUiStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { STARTER_TEMPLATES } from '../../state/starterTemplates'
import styles from './TemplatesPopup.module.css'

// A starting-point gallery for the blank-canvas problem: new users otherwise
// face an empty graph and ~90 node types with no sense of how they compose.
export default function TemplatesPopup() {
  const closeTemplates = useUiStore((s) => s.closeTemplates)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const setStatus = useUiStore((s) => s.setStatus)

  const load = async (id: string) => {
    const template = STARTER_TEMPLATES.find((t) => t.id === id)
    if (!template) return
    if (useGraphStore.getState().nodes.length > 0) {
      const ok = await requestConfirm({
        title: 'Replace current graph?',
        message: 'Loading a template replaces your current workspace. Any unsaved work will be lost. Continue?',
        confirmLabel: 'Load template',
        cancelLabel: 'Cancel',
        tone: 'danger',
      })
      if (!ok) return
    }
    const { nodes, edges } = template.build()
    useGraphStore.getState().loadGraph(nodes, edges)
    useGraphStore.temporal.getState().clear()
    setStatus(`Loaded "${template.name}" template`, 'success')
    closeTemplates()
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeTemplates() }}>
      <div className={styles.popup} role="dialog" aria-label="Starter templates">
        <div className={styles.header}>
          <span>Starter Templates</span>
          <button className={styles.closeBtn} onClick={closeTemplates} title="Close">×</button>
        </div>
        <div className={styles.hint}>
          A handful of pre-wired graphs to start from instead of a blank canvas.
        </div>
        <div className={styles.list}>
          {STARTER_TEMPLATES.map((t) => (
            <div key={t.id} className={styles.row}>
              <div className={styles.rowInfo}>
                <span className={styles.rowName}>{t.name}</span>
                <span className={styles.rowDesc}>{t.description}</span>
                {t.completionSteps && t.completionSteps.length > 0 && (
                  <ol className={styles.steps}>
                    {t.completionSteps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                )}
              </div>
              <button className={styles.loadBtn} onClick={() => { void load(t.id) }}>Load</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
