import { useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useProjectStore } from '../../state/projectStore'
import { captureWorkspace } from '../../state/workspacePersistence'
import { workspaceTrustHolds, type WorkspaceTrustHolds } from '../../state/patternTrust'
import styles from './TrustBanner.module.css'

/**
 * Persistent banner shown while the active workspace is untrusted (loaded
 * from a share link, an imported Graph JSON, or someone else's project file —
 * see the load paths that force `trusted: false` in graphStore.ts/App.tsx/
 * MenuBar.tsx) *and* the workspace actually holds something the trust flag
 * blocks. It is the "why is nothing happening" explanation for whenever the
 * one-shot confirm dialog got dismissed instead of confirmed, or never fired
 * at all (a dragged-in pattern just goes untrusted quietly, by design).
 *
 * The content check matters. Until 2026-08-14 this rendered for *any*
 * untrusted workspace, so a shared `Plasma → LED output` graph — the
 * ordinary case for a shared pattern — warned at length about Formula and
 * Code logic it did not contain. A security affordance that usually
 * describes a block that isn't happening is one people learn to dismiss on
 * sight, which costs exactly the attention it needs on the graphs that do
 * carry executable content. The workspace stays untrusted either way: this
 * only decides whether to *say* so, and export/upload still confirms
 * separately (MatrixOutputDeployPopup's confirmUploadIfUntrusted), so a
 * silent banner never widens what untrusted content is allowed to do.
 */
/** Name only what this workspace has actually held back, so the banner never
 *  cites Formula/Code logic that isn't there — or omits the Art-Net listener
 *  when that is the only thing waiting. */
function describeHolds(holds: WorkspaceTrustHolds): string {
  if (holds.formulaOrCode && holds.artnet) {
    return 'Formula and Code node preview logic won’t run, and no Art-Net listener will open, until you trust it.'
  }
  if (holds.artnet) return 'No Art-Net listener will open until you trust it.'
  return 'Formula and Code node preview logic won’t run until you trust it.'
}

export default function TrustBanner() {
  const trusted = useGraphStore((s) => s.trusted)
  const nodes = useGraphStore((s) => s.nodes)
  const graphData = useGraphStore((s) => s.graphData)
  const holds = useMemo(() => workspaceTrustHolds(nodes, graphData), [nodes, graphData])

  if (trusted) return null
  if (!holds.formulaOrCode && !holds.artnet) return null

  const handleTrust = () => {
    useGraphStore.getState().setTrusted(true)
    useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
  }

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.icon} aria-hidden="true">⚠</span>
      <span className={styles.message}>
        This graph isn&rsquo;t trusted yet — it came from outside this browser (a share link, an imported file, or someone else&rsquo;s project). {describeHolds(holds)}
      </span>
      <button type="button" className={styles.trustButton} onClick={handleTrust}>
        Trust and run
      </button>
    </div>
  )
}
