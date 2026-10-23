import { useGraphStore, useNodeProperties } from '../../../state/graphStore'
import { boardIdOf } from '../../../build/boardPartition'
import type { StudioNode } from '../../../state/graphStore'
import { boardOrdinalLabel, boardProfileLabel, useBoardNodes } from '../../Hardware/boardSelection'
import styles from './RunsOnBoardPicker.module.css'

/**
 * Which board a network endpoint runs on: the Web Remote's page, the DMX and
 * DDP listeners and the Stream Output are each a radio or socket on one
 * physical board, so a project with several boards says which. Drawn only
 * then; a one-board project keeps its endpoints `boardId`-free. Choosing the
 * primary clears the property rather than naming it, so the save reads as it
 * would have without a second board. See docs/design/board-links.md.
 */
export default function RunsOnBoardPicker({ nodeId }: { nodeId: string }) {
  const boards = useBoardNodes()
  const properties = useNodeProperties(nodeId, 'root')
  const updateNodeProperty = useGraphStore((state) => state.updateNodeProperty)
  if (boards.length < 2) return null

  const primaryId = boards[0].id
  const current = boardIdOf(
    { data: { properties } } as unknown as StudioNode,
    primaryId,
    new Set(boards.map((board) => board.id)),
  )

  return (
    <label className={styles.picker}>
      <span>Runs on</span>
      <select
        className="nodrag"
        value={current}
        aria-label="Runs on board"
        onChange={(event) => updateNodeProperty(
          nodeId, 'boardId', event.target.value === primaryId ? undefined : event.target.value)}
      >
        {boards.map((board) => (
          <option key={board.id} value={board.id}>
            {`${boardOrdinalLabel(boards, board.id)} · ${boardProfileLabel(board)}`}
          </option>
        ))}
      </select>
    </label>
  )
}
