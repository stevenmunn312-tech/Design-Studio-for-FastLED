import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { boardLinkWires, boardNodesIn, type BoardLinkWire } from '../../build/boardPartition'
import { sameNodeData } from '../../utils/sameNodeData'
import { boardOrdinalLabel } from '../Hardware/boardSelection'

/**
 * The canvas side of a board link: which root wires a link carries, and the
 * sentence each one's tooltip says. See docs/design/board-links.md.
 */

/** "Board 2", "Board 2 and Board 3", "Board 2, Board 3 and Board 4". */
function listBoards(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/** "Board 2 to Board 1 over ESP-NOW". */
export function boardLinkWireLabel(boards: readonly StudioNode[], wire: BoardLinkWire): string {
  const receivers = listBoards(wire.receiverBoardIds.map((id) => boardOrdinalLabel(boards, id)))
  return `${boardOrdinalLabel(boards, wire.senderBoardId)} to ${receivers} over ESP-NOW`
}

export const NO_BOARD_LINK_LABELS: ReadonlyMap<string, string> = new Map()

// Single-entry cache. The canvas asks on every render, and a drag hands it a
// new nodes array each frame with every node's data unchanged; the partition
// walk only reads ids and data, so those frames reuse the last answer.
let cachedNodes: readonly StudioNode[] | null = null
let cachedEdges: readonly StudioEdge[] | null = null
let cachedLabels: ReadonlyMap<string, string> = NO_BOARD_LINK_LABELS

/**
 * Root edge id → its link wire tooltip, for every root wire a link carries.
 * Empty, and the same empty map every time, for a one-board project. Pass the
 * root graph's own arrays (the partition caches by their identity).
 */
export function boardLinkWireLabels(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): ReadonlyMap<string, string> {
  if (cachedNodes && edges === cachedEdges && sameNodeData(nodes, cachedNodes)) return cachedLabels
  cachedNodes = nodes
  cachedEdges = edges
  const boards = boardNodesIn(nodes)
  if (boards.length < 2) {
    cachedLabels = NO_BOARD_LINK_LABELS
    return cachedLabels
  }
  const wires = boardLinkWires(nodes, edges)
  if (wires.size === 0) {
    cachedLabels = NO_BOARD_LINK_LABELS
    return cachedLabels
  }
  const labels = new Map<string, string>()
  for (const [edgeId, wire] of wires) labels.set(edgeId, boardLinkWireLabel(boards, wire))
  cachedLabels = labels
  return cachedLabels
}
