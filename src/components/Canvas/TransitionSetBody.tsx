import { useGraphStore } from '../../state/graphStore'
import { PROPERTY_META } from '../../state/nodeLibrary'
import styles from './TransitionSetBody.module.css'

// Body of the TransitionSet node: a pool of extra transition styles (chips
// from the same 16-style catalogue as the Transition node), toggled on/off.
// Wiring this node's output into a Performance Generator's `transitions` input
// lets generateShow mix these in alongside its rule-based crossfade/wipe/dissolve picks.

const ALL_TRANSITIONS = (PROPERTY_META.transitionType as { options: readonly string[] }).options
const EMPTY: string[] = []

export default function TransitionSetBody({ nodeId }: { nodeId: string }) {
  const pool = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { transitions?: string[] } | undefined)?.transitions) ?? EMPTY,
  )
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)

  const toggle = (tt: string) => {
    const next = pool.includes(tt) ? pool.filter((x) => x !== tt) : [...pool, tt]
    updateNodeProperty(nodeId, 'transitions', next)
  }

  const allOn = pool.length === ALL_TRANSITIONS.length
  const toggleAll = () => updateNodeProperty(nodeId, 'transitions', allOn ? [] : [...ALL_TRANSITIONS])

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <div className={styles.label}>Extra transitions ({pool.length})</div>
      <div className={styles.grid}>
        <button
          className={`${styles.chip} ${allOn ? styles.on : ''}`}
          onClick={toggleAll}
          title={allOn ? 'Clear the pool' : 'Add every style to the pool'}
        >
          all
        </button>
        {ALL_TRANSITIONS.map((tt) => (
          <button
            key={tt}
            className={`${styles.chip} ${pool.includes(tt) ? styles.on : ''}`}
            onClick={() => toggle(tt)}
            title={pool.includes(tt) ? 'In the pool — click to remove' : 'Click to add to the pool'}
          >
            {tt}
          </button>
        ))}
      </div>
    </div>
  )
}
