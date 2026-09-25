import { useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { trustCurrentProject } from '../../utils/trustPrompt'
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
    return 'Its Formula and Code nodes will run, and its Art-Net listener will open, once you trust it.'
  }
  if (holds.artnet) return 'Its Art-Net listener will open once you trust it.'
  return 'Its Formula and Code nodes will run once you trust it.'
}

export default function TrustBanner() {
  const trusted = useGraphStore((s) => s.trusted)
  const nodes = useGraphStore((s) => s.nodes)
  const graphData = useGraphStore((s) => s.graphData)
  const holds = useMemo(() => workspaceTrustHolds(nodes, graphData), [nodes, graphData])

  if (trusted) return null
  if (!holds.formulaOrCode && !holds.artnet) return null

  return (
    <div className={styles.banner} role="status">
      <span className={styles.message}>
        Part of this project was made on another computer, so Studio hasn&rsquo;t run it here yet. {describeHolds(holds)} Studio remembers what you trust, on this computer, for every project.
      </span>
      <button type="button" className={styles.trustButton} onClick={trustCurrentProject}>
        Trust it
      </button>
    </div>
  )
}
