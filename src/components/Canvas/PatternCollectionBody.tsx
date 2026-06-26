import { useGraphStore } from '../../state/graphStore'
import styles from './PatternCollectionBody.module.css'

// Body of the PatternCollection node: the list of absorbed pattern groups (by
// name), each removable. Patterns are added by wiring a Group node's frame
// output into the node's input and confirming (see NodeGraphCanvas.handleConnect).

const EMPTY: string[] = []

export default function PatternCollectionBody({ nodeId }: { nodeId: string }) {
  const patternIds = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { patternIds?: string[] } | undefined)?.patternIds) ?? EMPTY,
  )
  const graphs = useGraphStore((s) => s.graphs)
  const removeFromCollection = useGraphStore((s) => s.removeFromCollection)

  return (
    <div className={`nodrag nowheel ${styles.wrap}`}>
      {patternIds.length === 0 ? (
        <div className={styles.empty}>Connect a Group node to add a pattern</div>
      ) : (
        <ul className={styles.list}>
          {patternIds.map((id) => (
            <li key={id} className={styles.row}>
              <span className={styles.name}>{graphs[id]?.name ?? id}</span>
              <button
                className={styles.remove}
                title="Remove from collection"
                onClick={() => removeFromCollection(nodeId, id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.count}>{patternIds.length} pattern{patternIds.length === 1 ? '' : 's'}</div>
    </div>
  )
}
