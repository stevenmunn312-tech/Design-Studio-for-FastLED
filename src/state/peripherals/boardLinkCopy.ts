// A copied project gets its own board link. The link id and key are what a
// linked board checks every frame against, so a Duplicate or Save As that kept
// them would leave two projects whose boards accept each other's frames, and
// renewing the key in one would silently cut off the boards of the other. A
// copy whose original already has a link therefore takes a fresh id here; its
// key is made when the copy is committed, and its boards need uploading again
// (the Upload tab's note says so). See docs/design/board-links.md.
import { boardNodesIn } from '../../build/boardPartition'
import { ROOT_GRAPH_ID, type StudioNode } from '../graphStore'
import type { PersistedWorkspace } from '../workspacePersistence'
import { boardLinkSettings, newBoardLinkId } from './boardLinkKey'

function withLinkId(nodes: readonly StudioNode[], linkId: string): StudioNode[] {
  const primaryId = boardNodesIn(nodes)[0]?.id
  return nodes.map((node) => node.id === primaryId
    ? { ...node, data: { ...node.data, properties: { ...node.data.properties, linkId } } }
    : node)
}

/**
 * `workspace` with a new link id on its primary Board, and the id, when the
 * original has one; null when it has none, so a copy made before any wire
 * crossed boards gets its own id the first time one does.
 */
export function withFreshBoardLink(workspace: PersistedWorkspace): { workspace: PersistedWorkspace; linkId: string } | null {
  const rootActive = !workspace.activeGraphId || workspace.activeGraphId === ROOT_GRAPH_ID
  const root = rootActive ? workspace.nodes : workspace.graphData?.[ROOT_GRAPH_ID]?.nodes
  if (!root || !boardLinkSettings(boardNodesIn(root)[0]?.data.properties).linkId) return null
  const linkId = newBoardLinkId()
  if (rootActive) return { workspace: { ...workspace, nodes: withLinkId(root, linkId) }, linkId }
  const graphData = workspace.graphData!
  return {
    workspace: { ...workspace, graphData: { ...graphData, [ROOT_GRAPH_ID]: { ...graphData[ROOT_GRAPH_ID], nodes: withLinkId(root, linkId) } } },
    linkId,
  }
}
