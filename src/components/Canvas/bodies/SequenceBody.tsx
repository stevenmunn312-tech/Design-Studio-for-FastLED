import { useState } from 'react'
import { useGraphStore, useNodeProperties } from '../../../state/graphStore'
import { asPatternSteps, sequenceToShow, showToSequence, type PatternStep } from '../../../state/patterns/patternSequence'
import ShowLaneEditor from '../ShowLaneEditor'
import styles from './PerformanceGeneratorBody.module.css'

const BLANK: PatternStep = { hold: 4, transition: 'crossfade', transitionSec: 1 }

/** Sequence order on a Pattern Slideshow or Music Player, edited on the lane axis. */
export default function SequenceBody({ nodeId }: { nodeId: string }) {
  const properties = useNodeProperties(nodeId)
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const [open, setOpen] = useState(false)
  if (properties.order !== 'Sequence') return null
  const steps = asPatternSteps(properties.sequence)
  const countBeats = properties.beatTransitions === true
  const show = sequenceToShow(steps, 500, countBeats)

  function save(next: PatternStep[]) {
    updateNodeProperties(nodeId, { sequence: next })
  }

  return (
    <div className={`nodrag ${styles.editRow}`}>
      <button type="button" className={styles.tab} onClick={() => save([...steps, BLANK])}>
        Add step
      </button>
      <button type="button" className={styles.tab} onClick={() => setOpen(true)}>
        Edit sequence
      </button>
      {open && (
        <ShowLaneEditor
          show={show}
          title="Sequence"
          sections={[]}
          beats={[]}
          locks={[]}
          onClose={() => setOpen(false)}
          onCommit={(next) => save(showToSequence(next, steps, 500, countBeats))}
        />
      )}
    </div>
  )
}
