import type { StudioNode } from '../state/graphStore'
import { PRIMARY_UPLOAD_TARGET_KEY, type ProjectUploadTargets } from '../state/uploadTargets'
import { boardNodesIn, primaryBoardId } from './boardPartition'
import { resolveBoardSelection } from './boards/boardProfiles'

/** Board node id to the FQBN that board builds for. */
export type BoardFqbnTargets = Record<string, string>

/**
 * The FQBN a board validates against: its own target (for the primary, also
 * the project's primary target, kept under `PRIMARY_UPLOAD_TARGET_KEY`
 * whatever the primary Board node is called), else the first target its own
 * Board profile builds for, else, for the primary only, the caller's
 * default. A second board never borrows the primary's: an ESP32-S3 beside an
 * Uno was once checked as an Uno. With nothing of its own it gets '', which
 * validates against no target.
 */
export function boardFqbn(
  nodes: readonly StudioNode[],
  targets: BoardFqbnTargets,
  boardId: string,
  defaultFqbn = '',
): string {
  const primary = primaryBoardId(nodes)
  const board = nodes.find((node) => node.id === boardId && node.data.nodeType === 'Board')
  // The conventional key names the primary unless a later Board carries it.
  const isPrimary = boardId === primary || (boardId === PRIMARY_UPLOAD_TARGET_KEY && !board) || boardNodesIn(nodes).length === 0
  const profileFqbn = board ? resolveBoardSelection(board.data.properties).profile?.compatibleFqbns[0] : undefined
  return targets[boardId]
    || (isPrimary ? targets[primary] || targets[PRIMARY_UPLOAD_TARGET_KEY] : '')
    || profileFqbn
    || (isPrimary ? defaultFqbn : '')
    || ''
}

/**
 * The per-board FQBNs a project stores, with the active board's replaced by
 * the live selection: `uploadStore.selectedFqbn` describes the active board
 * and is what the one-board readers validate against today, so the merged
 * result of a one-board project stays exactly theirs.
 */
export function boardFqbnTargets(
  nodes: readonly StudioNode[],
  uploadTargets: ProjectUploadTargets | undefined,
  activeBoardId: string,
  selectedFqbn: string,
): BoardFqbnTargets {
  const targets: BoardFqbnTargets = {}
  for (const [boardId, target] of Object.entries(uploadTargets ?? {})) {
    if (target.selectedFqbn) targets[boardId] = target.selectedFqbn
  }
  const boards = boardNodesIn(nodes)
  const active = boards.some((board) => board.id === activeBoardId) ? activeBoardId : primaryBoardId(nodes)
  if (selectedFqbn) targets[active] = selectedFqbn
  return targets
}
