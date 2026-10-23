// Which linked boards run an older link than the project's.
//
// Every linked sketch compiles the schema hash in and drops frames carrying
// any other, so after an edit that changes the slot table each linked board
// has to be flashed again, not only the one being uploaded. The project keeps
// the hash each board was last flashed with on its upload target
// (`ProjectUploadTarget.linkSchemaHash`, written by `uploadStore` when a
// project upload succeeds), and the Upload tab says which other boards are
// behind. See docs/design/board-links.md, "Upload".
import type { StudioEdge, StudioNode } from '../graphStore'
import { boardLinkSchema, boardNodesIn } from '../../build/boardPartition'
import { PRIMARY_UPLOAD_TARGET_KEY, type ProjectUploadTargets } from '../uploadTargets'

/** The project's upload-target key for a Board: the primary's is the conventional one. */
function uploadTargetKey(boards: readonly StudioNode[], boardId: string): string {
  return boards[0]?.id === boardId ? PRIMARY_UPLOAD_TARGET_KEY : boardId
}

/**
 * One note per board other than `activeBoardId` whose last flash carries a
 * different link than the project now has: "The link changed since Board 2
 * was uploaded. Upload Board 2 as well." A note, never a blocker: order does
 * not matter, and an out-of-date board only drops frames until both match.
 *
 * - A board with no recorded flash says nothing. It was never uploaded from
 *   this project (or was uploaded before the hash was kept), so there is no
 *   firmware to call out of date, and its first upload is the normal path.
 * - A board flashed before any link existed (hash 0) is behind once it is
 *   linked; while it takes no part in the link, a link elsewhere is none of
 *   its business, so it stays quiet.
 * - A board flashed with a link that has since gone away is behind too: it
 *   still sends and listens for frames nobody understands.
 */
export function boardLinkUploadNotes(
  rootNodes: readonly StudioNode[],
  rootEdges: readonly StudioEdge[],
  uploadTargets: ProjectUploadTargets | undefined,
  activeBoardId: string,
): string[] {
  const boards = boardNodesIn(rootNodes)
  if (boards.length < 2 || !uploadTargets) return []
  const active = boards.some((board) => board.id === activeBoardId) ? activeBoardId : boards[0].id
  const { slots, hash } = boardLinkSchema(rootNodes, rootEdges)
  const linked = new Set<string>()
  for (const slot of slots) {
    linked.add(slot.senderBoardId)
    for (const receiver of slot.receivers) linked.add(receiver.boardId)
  }
  const notes: string[] = []
  boards.forEach((board, index) => {
    if (board.id === active) return
    const flashed = uploadTargets[uploadTargetKey(boards, board.id)]?.linkSchemaHash
    if (flashed === undefined || flashed === hash) return
    if (flashed === 0 && !linked.has(board.id)) return
    const label = `Board ${index + 1}`
    notes.push(`The link changed since ${label} was uploaded. Upload ${label} as well.`)
  })
  return notes
}
