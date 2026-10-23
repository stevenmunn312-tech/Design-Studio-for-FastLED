// Which linked boards run an older link than the project's.
//
// Every linked sketch compiles the schema hash, the link id and the key in,
// and drops frames that disagree on any of them, so after an edit that
// changes the slot table, a new key, or a copy of the project, each linked
// board has to be flashed again, not only the one being uploaded. The project
// keeps a fingerprint of all three for each board's last flash on its upload
// target (`ProjectUploadTarget.flashedLink`, written by `uploadStore` when a
// project upload succeeds), and the Upload tab says which other boards are
// behind. See docs/design/board-links.md, "Upload".
import type { StudioEdge, StudioNode } from '../graphStore'
import { boardLinkSchema, boardNodesIn } from '../../build/boardPartition'
import { fnv1a32 } from '../../build/boardLinks'
import { boardLinkSettings, useBoardLinkKeyStore } from '../peripherals/boardLinkKey'
import { PRIMARY_UPLOAD_TARGET_KEY, type ProjectUploadTargets } from '../uploadTargets'

/**
 * What a linked board's firmware is bound to: the slot table's hash, the link
 * id and this machine's key for it. 0 while no wire crosses boards, so a
 * board flashed with no link reads as such.
 */
export function boardLinkFingerprint(rootNodes: readonly StudioNode[], rootEdges: readonly StudioEdge[]): number {
  const { slots, hash } = boardLinkSchema(rootNodes, rootEdges)
  if (slots.length === 0) return 0
  const { linkId } = boardLinkSettings(boardNodesIn(rootNodes)[0]?.data.properties)
  const key = linkId ? useBoardLinkKeyStore.getState().byLinkId[linkId] ?? '' : ''
  return fnv1a32(`${hash}:${linkId ?? ''}:${key}`) || 1
}

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
 * - A board flashed before any link existed (fingerprint 0) is behind once it is
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
  const { slots } = boardLinkSchema(rootNodes, rootEdges)
  const current = boardLinkFingerprint(rootNodes, rootEdges)
  const linked = new Set<string>()
  for (const slot of slots) {
    linked.add(slot.senderBoardId)
    for (const receiver of slot.receivers) linked.add(receiver.boardId)
  }
  const notes: string[] = []
  boards.forEach((board, index) => {
    if (board.id === active) return
    const flashed = uploadTargets[uploadTargetKey(boards, board.id)]?.flashedLink
    if (flashed === undefined || flashed === current) return
    if (flashed === 0 && !linked.has(board.id)) return
    const label = `Board ${index + 1}`
    notes.push(`The link changed since ${label} was uploaded. Upload ${label} as well.`)
  })
  return notes
}
