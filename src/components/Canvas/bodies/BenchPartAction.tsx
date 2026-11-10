import { boardPartitionOf, useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useNodeBoardId } from '../../Hardware/boardSelection'
import { addProviderPartToBoard, PROVIDER_PART_NAMES } from '../../Hardware/hardwarePartActions'
import styles from './BenchPartAction.module.css'

/**
 * The DMX transceiver or MIDI interface a node's wired source reads, offered
 * from the node while its board's bench has none: the same part, on the same
 * pins, as Graph Health's repair and the Hardware shelf. Nothing once it is
 * there, since the part then speaks for itself on the bench.
 */
export default function BenchPartAction({ nodeId, nodeType }: {
  nodeId: string
  nodeType: 'DmxTransceiver' | 'MidiInterface'
}) {
  const boardId = useNodeBoardId(nodeId)
  const hasPart = useGraphStore((s) => boardPartitionOf(s, boardId).nodes.some((node) => node.data.nodeType === nodeType))
  if (hasPart) return null
  const name = PROVIDER_PART_NAMES[nodeType]
  const add = () => {
    const result = addProviderPartToBoard(nodeType, boardId)
    useUiStore.getState().setStatus(
      result.ok ? `Added ${result.label} on pin${result.pins.length > 1 ? 's' : ''} ${result.pins.join(', ')}` : result.reason,
      result.ok ? 'success' : 'info',
    )
  }
  return (
    <div className={styles.action}>
      <button
        type="button"
        className={`nodrag ${styles.button}`}
        onClick={add}
        title={`Put a ${name} on this board's bench, on free pins, with its UART allocated`}
      >
        Add {name}
      </button>
      <span>No {name} on the bench yet.</span>
    </div>
  )
}
