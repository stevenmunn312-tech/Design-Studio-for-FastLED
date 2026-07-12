import { useGraphStore } from '../../state/graphStore'
import { SECTION_TYPES } from '../../codegen/performanceGenerator'
import styles from './PatternCollectionBody.module.css'

// Body of the PatternCollection node: the list of absorbed pattern groups (by
// name), each removable, with per-pattern song-section chips. Patterns are
// added by wiring a Group node's frame output into the node's input and
// confirming (see NodeGraphCanvas.handleConnect). The section chips drive the
// Performance Generator's section-aware pattern selection — a pattern with no
// chip lit is eligible in any section; lighting chips restricts it to those.

const EMPTY: string[] = []
const EMPTY_MAP: Record<string, string[]> = {}

// 3-letter chip labels for the seven section types (full name on hover).
const SECTION_ABBR: Record<string, string> = {
  intro: 'int', verse: 'vrs', buildup: 'bld', drop: 'drp', chorus: 'chr', bridge: 'brg', outro: 'out',
}

export default function PatternCollectionBody({ nodeId }: { nodeId: string }) {
  const patternIds = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { patternIds?: string[] } | undefined)?.patternIds) ?? EMPTY,
  )
  const patternSections = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { patternSections?: Record<string, string[]> } | undefined)?.patternSections) ?? EMPTY_MAP,
  )
  const graphs = useGraphStore((s) => s.graphs)
  const removeFromCollection = useGraphStore((s) => s.removeFromCollection)
  const togglePatternSection = useGraphStore((s) => s.togglePatternSection)
  const setPatternSections = useGraphStore((s) => s.setPatternSections)

  return (
    <div className={`nodrag ${styles.wrap}`}>
      {patternIds.length === 0 ? (
        <div className={styles.empty}>Connect a Group node to add a pattern</div>
      ) : (
        <ul className={styles.list}>
          {patternIds.map((id) => {
            const tags = patternSections[id] ?? EMPTY
            return (
              <li key={id} className={styles.row}>
                <div className={styles.head}>
                  <span className={styles.name}>{graphs[id]?.name ?? id}</span>
                  <button
                    className={styles.remove}
                    title="Remove from collection"
                    onClick={() => removeFromCollection(nodeId, id)}
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.sections} title="Sections this pattern plays in (none = any)">
                  <button
                    className={`${styles.chip} ${tags.length === SECTION_TYPES.length ? styles.chipOn : ''}`}
                    title="All sections"
                    onClick={() => setPatternSections(nodeId, id, tags.length === SECTION_TYPES.length ? [] : [...SECTION_TYPES])}
                  >
                    all
                  </button>
                  {SECTION_TYPES.map((sec) => (
                    <button
                      key={sec}
                      className={`${styles.chip} ${tags.includes(sec) ? styles.chipOn : ''}`}
                      title={sec}
                      onClick={() => togglePatternSection(nodeId, id, sec)}
                    >
                      {SECTION_ABBR[sec]}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className={styles.count}>{patternIds.length} pattern{patternIds.length === 1 ? '' : 's'}</div>
    </div>
  )
}
