import { useGraphStore } from '../../state/graphStore'
import { useProjectStore } from '../../state/projectStore'
import { captureWorkspace } from '../../state/workspacePersistence'
import styles from './TrustBanner.module.css'

/**
 * Persistent banner shown whenever the active workspace is untrusted (loaded
 * from a share link, an imported Graph JSON, or someone else's project file —
 * see the load paths that force `trusted: false` in graphStore.ts/App.tsx/
 * MenuBar.tsx). CustomFormula/FieldFormula/Code nodes render a blank/blocked
 * output while untrusted (graphEvaluator.ts's `trusted` gate), so this is the
 * "why is nothing happening" explanation for whenever a one-shot confirm
 * dialog got dismissed instead of confirmed, or never fired at all (a
 * dragged-in pattern just goes untrusted quietly, by design — see todo.md).
 */
export default function TrustBanner() {
  const trusted = useGraphStore((s) => s.trusted)
  if (trusted) return null

  const handleTrust = () => {
    useGraphStore.getState().setTrusted(true)
    useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
  }

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.icon} aria-hidden="true">⚠</span>
      <span className={styles.message}>
        This graph isn&rsquo;t trusted yet — it came from outside this browser (a share link, an imported file, or someone else&rsquo;s project). Formula and Code node preview logic won&rsquo;t run until you trust it.
      </span>
      <button type="button" className={styles.trustButton} onClick={handleTrust}>
        Trust and run
      </button>
    </div>
  )
}
