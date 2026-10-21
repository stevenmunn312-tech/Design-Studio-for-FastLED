import type { StudioNode, StudioEdge } from '../state/graphStore'
import { NODE_LIBRARY } from '../state/nodeLibrary'
import { isHardwareNodeType, ROOT_BOARD_NODE_ID } from './hardware'

/**
 * Board partitions — the multi-board model's one new idea.
 *
 * A project has one or more Board nodes in its root graph. Every hardware part
 * and LED output belongs to exactly one of them (its `boardId` property, the
 * primary board when absent); pattern nodes and controls belong to none. A
 * board compiles the slice of the root graph that reaches its own parts, so
 * every one-board consumer (`find(Board)`, `collectPinUses`, `generateCpp`,
 * validation) keeps working unchanged — it is simply handed a partition
 * instead of the whole root graph. See docs/design/multi-board.md.
 */

export interface BoardPartition {
  /** The partition's one Board node; null only while a graph has no Board. */
  board: StudioNode | null
  nodes: StudioNode[]
  edges: StudioEdge[]
}

export interface CrossBoardIssue {
  /** The part or output where the wire starts, and the one it reaches. */
  sourceNodeId: string
  targetNodeId: string
  sourceBoardId: string
  targetBoardId: string
}

/**
 * Every sink in the library: a node the graph feeds and nothing reads. The
 * same rule as cppGenerator's `TERMINAL_NODE_TYPES` and graphEvaluator's
 * `HOT_NODE_TYPES`, derived here rather than imported so the partition does
 * not pull the generator in.
 */
const SINK_NODE_TYPES = new Set(
  NODE_LIBRARY
    .filter((def) => def.inputs.length > 0 && (def.outputs.length === 0 || def.category === 'output'))
    .map((def) => def.type),
)

/**
 * Node types that carry a `boardId`: the bench parts and LED outputs. The
 * Board itself is hardware too but is the thing attached to, not an
 * attachment, and nothing on the signal graph is attached at all.
 */
export function isBoardAttachedNodeType(nodeType: string): boolean {
  return nodeType !== 'Board' && isHardwareNodeType(nodeType)
}

export function isSinkNodeType(nodeType: string): boolean {
  return SINK_NODE_TYPES.has(nodeType)
}

function nodeTypeOf(node: StudioNode): string {
  return String((node.data as { nodeType?: unknown } | undefined)?.nodeType ?? '')
}

/** The Board nodes in root order, the primary first. */
export function boardNodesIn(nodes: readonly StudioNode[]): StudioNode[] {
  const boards = nodes.filter((node) => nodeTypeOf(node) === 'Board')
  const rootIndex = boards.findIndex((node) => node.id === ROOT_BOARD_NODE_ID)
  if (rootIndex <= 0) return boards
  const [primary] = boards.splice(rootIndex, 1)
  return [primary, ...boards]
}

/** The primary board's id, or the conventional one when the graph has none. */
export function primaryBoardId(nodes: readonly StudioNode[]): string {
  return boardNodesIn(nodes)[0]?.id ?? ROOT_BOARD_NODE_ID
}

/**
 * The board a part is attached to. A `boardId` naming a Board that is not in
 * `boardIds` (or absent, as on every pre-multi-board save) means the primary.
 * `boardIds` is the set of Board ids present; passing it rather than the nodes
 * keeps the per-node cost constant inside the partition walk.
 */
export function boardIdOf(
  node: StudioNode,
  primaryId: string,
  boardIds?: ReadonlySet<string>,
): string {
  const raw = (node.data as { properties?: Record<string, unknown> } | undefined)?.properties?.boardId
  if (typeof raw !== 'string' || !raw) return primaryId
  if (boardIds && !boardIds.has(raw)) return primaryId
  return raw
}

interface Membership {
  boards: StudioNode[]
  primaryId: string
  /** Board id → ids of every node in that board's partition. */
  byBoard: Map<string, Set<string>>
  /** Node id → the boards whose partition holds it. */
  byNode: Map<string, Set<string>>
  /** Part or output id → the board it is attached to. */
  attachedTo: Map<string, string>
  /** Node id → the ids its edges lead to. */
  downstream: Map<string, string[]>
}

/**
 * Which nodes land in which board's partition. One walk for every board:
 *
 * - each board takes the parts and outputs attached to it;
 * - from those it walks the signal graph both ways, upstream from its outputs
 *   and sinks and downstream from its inputs, taking every non-attached node
 *   it reaches and stopping at a part attached to another board;
 * - a non-attached node no board reached (an unfinished patch, or a sink such
 *   as Master Speed that every sketch applies) lands in every partition, so
 *   each board compiles it and the drawer diagnoses it once by id.
 */
function membership(nodes: readonly StudioNode[], edges: readonly StudioEdge[]): Membership {
  const boards = boardNodesIn(nodes)
  const primaryId = boards[0]?.id ?? ROOT_BOARD_NODE_ID
  const boardIds = new Set(boards.map((board) => board.id))
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const neighbours = new Map<string, string[]>()
  const downstream = new Map<string, string[]>()
  const link = (map: Map<string, string[]>, from: string, to: string) => {
    const list = map.get(from)
    if (list) list.push(to)
    else map.set(from, [to])
  }
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    link(neighbours, edge.source, edge.target)
    link(neighbours, edge.target, edge.source)
    link(downstream, edge.source, edge.target)
  }

  const attachedTo = new Map<string, string>()
  for (const node of nodes) {
    if (isBoardAttachedNodeType(nodeTypeOf(node))) attachedTo.set(node.id, boardIdOf(node, primaryId, boardIds))
  }

  const byBoard = new Map<string, Set<string>>()
  const byNode = new Map<string, Set<string>>()
  const place = (boardId: string, nodeId: string) => {
    byBoard.get(boardId)!.add(nodeId)
    const owners = byNode.get(nodeId)
    if (owners) owners.add(boardId)
    else byNode.set(nodeId, new Set([boardId]))
  }

  for (const board of boards) {
    const members = new Set<string>([board.id])
    byBoard.set(board.id, members)
    byNode.set(board.id, new Set([board.id]))
    const pending: string[] = []
    for (const [nodeId, owner] of attachedTo) {
      if (owner !== board.id) continue
      place(board.id, nodeId)
      pending.push(nodeId)
    }
    while (pending.length) {
      const id = pending.pop()!
      for (const next of neighbours.get(id) ?? []) {
        if (members.has(next)) continue
        // Another board's part is the far side of a cross-board wire: it is
        // not ours, and nothing beyond it is reached through it.
        if (attachedTo.has(next) && attachedTo.get(next) !== board.id) continue
        if (boardIds.has(next)) continue
        place(board.id, next)
        pending.push(next)
      }
    }
  }

  if (boards.length > 0) {
    for (const node of nodes) {
      if (byNode.has(node.id)) continue
      if (attachedTo.has(node.id) || boardIds.has(node.id)) continue
      for (const board of boards) place(board.id, node.id)
    }
  }

  return { boards, primaryId, byBoard, byNode, attachedTo, downstream }
}

// Single-entry cache: the store asks for partitions on every render of the
// hardware, build and upload surfaces, with the same root arrays between
// edits, so the walk runs once per graph change rather than once per ask.
let cachedNodes: readonly StudioNode[] | null = null
let cachedEdges: readonly StudioEdge[] | null = null
let cachedMembership: Membership | null = null

function membershipOf(nodes: readonly StudioNode[], edges: readonly StudioEdge[]): Membership {
  if (cachedMembership && nodes === cachedNodes && edges === cachedEdges) return cachedMembership
  cachedNodes = nodes
  cachedEdges = edges
  cachedMembership = membership(nodes, edges)
  return cachedMembership
}

/**
 * The slice of the root graph board `boardId` compiles: its Board node, the
 * parts and outputs attached to it, the signal nodes that reach them, and the
 * edges with both ends inside. Root order is kept, so the result reads as the
 * same graph with the other boards' halves removed. An unknown `boardId`
 * reads as the primary, like a part's dangling `boardId` does.
 */
export function boardPartition(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  boardId: string,
): BoardPartition {
  const { boards, primaryId, byBoard } = membershipOf(nodes, edges)
  if (boards.length === 0) return { board: null, nodes: [...nodes], edges: [...edges] }
  const id = byBoard.has(boardId) ? boardId : primaryId
  const members = byBoard.get(id)!
  return {
    board: boards.find((board) => board.id === id) ?? null,
    nodes: nodes.filter((node) => members.has(node.id)),
    edges: edges.filter((edge) => members.has(edge.source ?? '') && members.has(edge.target ?? '')),
  }
}

/** Node id → the ids of the boards whose partition holds that node. */
export function boardMembership(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): ReadonlyMap<string, ReadonlySet<string>> {
  return membershipOf(nodes, edges).byNode
}

/**
 * Signal wires no firmware can carry: a part on one board whose signal runs,
 * through any run of signal nodes, into a part or output on another. A
 * pattern two boards both show makes none; a pot on board A feeding a pattern
 * board B shows does, because B's sketch would read a pot it does not have.
 */
export function findCrossBoardIssues(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): CrossBoardIssue[] {
  const { boards, attachedTo, downstream } = membershipOf(nodes, edges)
  if (boards.length < 2) return []
  const boardIds = new Set(boards.map((board) => board.id))
  const issues: CrossBoardIssue[] = []
  for (const [startId, startBoard] of attachedTo) {
    const visited = new Set<string>([startId])
    const pending = [startId]
    while (pending.length) {
      const id = pending.pop()!
      for (const next of downstream.get(id) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        const farBoard = attachedTo.get(next)
        if (farBoard === undefined) {
          if (!boardIds.has(next)) pending.push(next)
          continue
        }
        if (farBoard === startBoard) continue
        issues.push({ sourceNodeId: startId, targetNodeId: next, sourceBoardId: startBoard, targetBoardId: farBoard })
      }
    }
  }
  return issues
}
