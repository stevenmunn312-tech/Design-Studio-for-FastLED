import { useGraphStore } from '../../state/graphStore'
import { usePreviewStore } from '../../state/previewStore'
import { partById } from '../../state/partCatalogue'
import {
  SEGMENT_GLYPHS, blankSegmentFrame, segmentControllerFor, segmentFrameText, type SegmentFrame,
} from '../../state/segmentDisplay'
import styles from './AuxDisplayNodeBodies.module.css'

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const

function isSegmentFrame(value: unknown): value is SegmentFrame {
  if (!value || typeof value !== 'object') return false
  const frame = value as Partial<SegmentFrame>
  return typeof frame.digits === 'string' && typeof frame.colon === 'boolean'
    && typeof frame.decimalAt === 'number' && typeof frame.lit === 'boolean'
}

export default function SegmentDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const partId = useGraphStore((state) => String(
    state.nodes.find((node) => node.id === nodeId)?.data.properties.partId ?? '',
  ))
  const controller = segmentControllerFor(partById(partId)?.display?.controller)
  const live = usePreviewStore((state) => state.outputs.get(nodeId)?.segment)
  const frame = isSegmentFrame(live) ? live : blankSegmentFrame(controller.digits)

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.segmentScreen} ${frame.lit ? '' : styles.segmentDark}`}
        role="img"
        aria-label={`Segment display preview: ${segmentFrameText(frame) || 'off'}`}
      >
        {Array.from(frame.digits).map((character, index) => {
          const bits = frame.lit ? (SEGMENT_GLYPHS[character] ?? 0) : 0
          return (
            <div className={styles.digitSlot} key={index}>
              {SEGMENTS.map((segment, bit) => (
                <span key={segment} className={`${styles.segment} ${styles[segment]}`} data-on={(bits & (1 << bit)) !== 0} />
              ))}
              <span className={styles.dp} data-on={frame.lit && frame.decimalAt === index} />
              {frame.colon && index === 1 && <span className={styles.colon} data-on="true" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
