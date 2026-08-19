import { useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { SECTION_TYPES } from '../../codegen/performanceGenerator'
import { useCapacityStore } from '../../state/capacityStore'
import { capacityDelta, formatCapacityDelta } from '../../utils/capacityFormat'
import { shouldConsumeWheel } from './wheelBehavior'
import PatternCollectionPicker from '../PatternCollection/PatternCollectionPicker'
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
  const [pickerOpen, setPickerOpen] = useState(false)
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

  // Last live-capacity-meter delta (driven by CapacityWatcher), so adding or
  // removing a pattern here shows what it cost without opening the upload panel.
  const { result: capacityResult, previousResult: capacityPrevious } = useCapacityStore()
  const deltaText = (() => {
    const delta = capacityDelta(capacityPrevious, capacityResult)
    return delta ? formatCapacityDelta(delta) : null
  })()

  function handleListWheel(e: React.WheelEvent<HTMLUListElement>) {
    if (shouldConsumeWheel(e.currentTarget, e.deltaY)) e.stopPropagation()
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      {patternIds.length === 0 ? (
        <div className={styles.empty}>Choose saved patterns or connect a Group node</div>
      ) : (
        <ul className={styles.list} onWheelCapture={handleListWheel}>
          {patternIds.map((id) => {
            const tags = patternSections[id] ?? EMPTY
            const patternName = graphs[id]?.name ?? id
            return (
              <li key={id} className={styles.row}>
                <div className={styles.head}>
                  <span className={styles.name}>{patternName}</span>
                  <button
                    className={styles.remove}
                    title="Remove from collection"
                    aria-label={`Remove ${patternName} from collection`}
                    onClick={() => removeFromCollection(nodeId, id)}
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.sections} title="Sections this pattern plays in (none = any)">
                  <button
                    className={`${styles.chip} ${tags.length === SECTION_TYPES.length ? styles.chipOn : ''}`}
                    title="All sections"
                    aria-label={`${patternName}: all sections`}
                    aria-pressed={tags.length === SECTION_TYPES.length}
                    onClick={() => setPatternSections(nodeId, id, tags.length === SECTION_TYPES.length ? [] : [...SECTION_TYPES])}
                  >
                    all
                  </button>
                  {SECTION_TYPES.map((sec) => (
                    <button
                      key={sec}
                      className={`${styles.chip} ${tags.includes(sec) ? styles.chipOn : ''}`}
                      title={sec}
                      aria-label={`${patternName}: ${sec} section`}
                      aria-pressed={tags.includes(sec)}
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
      <button type="button" className={styles.addPatterns} onClick={() => setPickerOpen(true)}>
        <span aria-hidden="true">＋</span>
        Add patterns…
      </button>
      <div className={styles.count}>{patternIds.length} pattern{patternIds.length === 1 ? '' : 's'}</div>
      {deltaText && (
        <div className={styles.delta} title="Change in measured controller capacity since the last live check on this board">
          since last check: {deltaText}
        </div>
      )}
      {pickerOpen && (
        <PatternCollectionPicker collectionNodeId={nodeId} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}
