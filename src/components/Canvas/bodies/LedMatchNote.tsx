import { useGraphStore } from '../../../state/graphStore'
import { matchedLedProperties } from '../../../state/output/ledOutputMatch'
import styles from './LedMatchNote.module.css'

/**
 * Says so when a node set to Match LED output has no output to match and is
 * reading its own fields instead (a standalone pattern, or no output of a
 * fitting form). Draws nothing while it matches or while the node is Custom.
 * It reads the graph the node sits in, the one the preview evaluates.
 */
export default function LedMatchNote({ nodeId }: { nodeId: string }) {
  const hint = useGraphStore((s) => {
    const node = s.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return null
    return matchedLedProperties(
      String(node.data.nodeType), nodeId, node.data.properties as Record<string, unknown>, s.nodes, s.edges,
    ).hint
  })
  if (!hint) return null
  return <div className={styles.note} role="status">{hint}</div>
}
