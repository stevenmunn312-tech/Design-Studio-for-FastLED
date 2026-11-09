// Which board a surface is working on, and how it is named: the helpers
// behind `BoardSelector`, kept out of the component file so the strip stays
// fast-refreshable and a heading or sheet can name a board without rendering
// the strip. See docs/design/multi-board.md.
import { useShallow } from 'zustand/react/shallow'
import { rootGraphEdges, rootGraphNodes, useGraphStore, type StudioNode } from '../../state/graphStore'
import { boardMembership, boardNodesIn } from '../../build/boardPartition'
import { ROOT_BOARD_NODE_ID } from '../../build/hardware'
import { resolveBoardSelection } from '../../build/boards/boardProfiles'

/** The project's Board nodes in root order, the primary first. */
export function useBoardNodes(): StudioNode[] {
  return useGraphStore(useShallow((s) => boardNodesIn(rootGraphNodes(s))))
}

/**
 * The board a root node runs on: the first board whose partition holds it,
 * the primary for a node no board reaches or one inside a pattern group.
 * What a network node's body names when it says whose network it joins.
 */
export function useNodeBoardId(nodeId: string): string {
  return useGraphStore((s) => {
    const nodes = rootGraphNodes(s)
    const boards = boardNodesIn(nodes)
    const owners = boardMembership(nodes, rootGraphEdges(s)).get(nodeId)
    return boards.find((board) => owners?.has(board.id))?.id ?? boards[0]?.id ?? ROOT_BOARD_NODE_ID
  })
}

/** "Board 2": a board's place in root order, which is how every surface names it. */
export function boardOrdinalLabel(boards: readonly StudioNode[], boardId: string): string {
  const index = boards.findIndex((board) => board.id === boardId)
  return `Board ${(index < 0 ? 0 : index) + 1}`
}

/** The controller the board names, as the tab's subtitle says it. */
export function boardProfileLabel(board: StudioNode): string {
  const resolution = resolveBoardSelection((board.data.properties ?? {}) as Record<string, unknown>)
  if (resolution.profile) return resolution.profile.label
  return resolution.kind === 'custom' ? 'Custom board' : 'No board chosen'
}

/**
 * The active board id resolved against the boards present: a removed board
 * leaves `activeBoardId` naming nothing, and the partition then reads as the
 * primary, so the strip highlights the primary too.
 */
export function resolveActiveBoardId(boards: readonly StudioNode[], activeBoardId: string): string {
  return boards.some((board) => board.id === activeBoardId) ? activeBoardId : boards[0]?.id ?? activeBoardId
}
