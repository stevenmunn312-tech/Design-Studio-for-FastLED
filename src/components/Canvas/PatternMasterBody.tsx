import { useGraphStore } from '../../state/graphStore'
import { PROPERTY_META } from '../../state/nodeLibrary'
import styles from './PatternMasterBody.module.css'

// Body of the Pattern Master node: the pool of transition styles the random show
// draws from (a toggleable chip per style). Timing (minTime/maxTime/transitionSec)
// is edited via the regular inline sliders above; this only handles the pool.

const ALL_TRANSITIONS = (PROPERTY_META.transitionType as { options: readonly string[] }).options
const EMPTY: string[] = []

export default function PatternMasterBody({ nodeId }: { nodeId: string }) {
  const pool = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { transitions?: string[] } | undefined)?.transitions) ?? EMPTY,
  )
  // A wired TransitionSet overrides this on-node pool, so dim the grid and say so
  // rather than let the user toggle chips that no longer take effect.
  const wired = useGraphStore(
    (s) => s.edges.some((e) => e.target === nodeId && e.targetHandle === 'transitions'),
  )
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)

  const toggle = (tt: string) => {
    if (wired) return
    const next = pool.includes(tt) ? pool.filter((x) => x !== tt) : [...pool, tt]
    updateNodeProperty(nodeId, 'transitions', next)
  }

  return (
    <div className={`nodrag nowheel ${styles.wrap}`}>
      <div className={styles.label}>
        {wired ? 'Transitions — from wired node' : `Transitions (${pool.length})`}
      </div>
      <div className={styles.grid} style={wired ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
        {ALL_TRANSITIONS.map((tt) => (
          <button
            key={tt}
            className={`${styles.chip} ${pool.includes(tt) ? styles.on : ''}`}
            onClick={() => toggle(tt)}
            title={pool.includes(tt) ? 'In the random pool — click to remove' : 'Click to add to the random pool'}
          >
            {tt}
          </button>
        ))}
      </div>
    </div>
  )
}
