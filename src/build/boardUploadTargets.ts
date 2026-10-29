import type { StudioNode } from '../state/graphStore'
import { PRIMARY_UPLOAD_TARGET_KEY, type ProjectUploadTargets } from '../state/uploadTargets'
import { boardNodesIn, primaryBoardId } from './boardPartition'

/** Board node id to the FQBN that board builds for. */
export type BoardFqbnTargets = Record<string, string>

/**
 * The FQBN a board validates against: its own target, else the primary's
 * (which the project keeps under `PRIMARY_UPLOAD_TARGET_KEY` whatever the
 * primary Board node is called), else the caller's default.
 */
export function boardFqbn(
  nodes: readonly StudioNode[],
  targets: BoardFqbnTargets,
  boardId: string,
  defaultFqbn = '',
): string {
  return targets[boardId]
    || targets[primaryBoardId(nodes)]
    || targets[PRIMARY_UPLOAD_TARGET_KEY]
    || defaultFqbn
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
