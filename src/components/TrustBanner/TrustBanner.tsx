import { useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { trustCurrentProject, WORKSPACE_CODE_QUESTION_ID } from '../../utils/trustPrompt'
import { workspaceTrustHolds, type WorkspaceTrustHolds } from '../../state/patterns/patternTrust'
import styles from './TrustBanner.module.css'

/**
 * Persistent banner shown while the active workspace is untrusted (loaded
 * from a share link, an imported Graph JSON, or someone else's project file —
 * see the load paths that force `trusted: false` in graphStore.ts/App.tsx/
 * MenuBar.tsx) *and* the workspace actually holds something the trust flag
 * blocks. This is the workspace's single permission decision; load paths
 * show no modal, and Upload points here while executable content is held.
 *
 * The content check matters. Until 2026-08-14 this rendered for *any*
 * untrusted workspace, so a shared `Plasma → LED output` graph — the
 * ordinary case for a shared pattern — warned at length about Formula and
 * Code logic it did not contain. A security affordance that usually
 * describes a block that isn't happening is one people learn to dismiss on
 * sight, which costs exactly the attention it needs on the graphs that do
 * carry executable content. The graph store restores trust automatically
 * when no unknown executable content remains.
 */
/** Name only what this workspace has actually held back, so the banner never
 *  cites Formula/Code logic that isn't there — or omits the Art-Net listener
 *  when that is the only thing waiting. */
function describeHolds(holds: WorkspaceTrustHolds): string {
  if (holds.formulaOrCode && holds.artnet) {
    return 'Its Formula and Code nodes will run, and its network listener will open, once you say so.'
  }
  if (holds.artnet) return 'Its network listener will open once you say so.'
  return 'Its Formula and Code nodes will run once you say so.'
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
        <strong>Run code from this file?</strong> Part of this project was made on another computer, so Studio hasn&rsquo;t run it here yet. {describeHolds(holds)} Studio remembers your answer, on this computer, for every project.
      </span>
      <button id={WORKSPACE_CODE_QUESTION_ID} type="button" className={styles.trustButton} onClick={trustCurrentProject}>
        Run it
      </button>
    </div>
  )
}
