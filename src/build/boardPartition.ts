import type { StudioNode, StudioEdge } from '../state/graphStore'
import { NODE_LIBRARY } from '../state/nodeLibrary'
import { isHardwareNodeType, ROOT_BOARD_NODE_ID } from './hardware'
import { boardLinkSettings } from '../state/peripherals/boardLinkKey'
import { wiredNetworkIn } from '../state/peripherals/ethernetModule'
import { networkSourceIn } from '../codegen/peripherals/networkCpp'
import { displayKindOfSource, displaySlotFields, receiverDisplayFields } from './boardLinkDisplay'
import { isLinkedControlsSource, touchControlsFields } from './boardLinkControls'
import {
  BOARD_LINK_IN_NODE_TYPE,
  BOARD_LINK_OUT_NODE_TYPE,
  BOARD_LINK_PORT_ID,
  boardLinkSchemaHash,
  boardLinkSlotHolds,
  boardLinkStartValue,
  boardLinkWireKind,
  type BoardLinkContext,
  type BoardLinkFrameEntry,
  isBoardLinkDataType,
  isGeneratorOwnerNodeType,
  isMomentaryBoolSource,
  isNetworkEndpointNodeType,
  outputPortDataType,
  type BoardLinkDataType,
  type BoardLinkNodeProperties,
  type BoardLinkReceiver,
  type BoardLinkSchema,
  type BoardLinkSlot,
} from './boardLinks'

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
 *
 * A wire whose value one board computes and another consumes is cut as close
 * to its source as a link can carry it, and the partition stands a synthetic
 * `BoardLinkIn` and `BoardLinkOut` in for it. See docs/design/board-links.md.
 */

export interface BoardPartition {
  /** The partition's one Board node; null only while a graph has no Board. */
  board: StudioNode | null
  nodes: StudioNode[]
  edges: StudioEdge[]
}

export interface CrossBoardIssue {
  /** The wire's two ends: a node one board computes, and a node of another. */
  sourceNodeId: string
  targetNodeId: string
  sourceBoardId: string
  targetBoardId: string
  /** The wire's type, which no link carries (`frame`, `audio`, …), or null
   *  for a carried type whose source no single board can compute. */
  dataType: string | null
}

/** A root wire a link carries: the board that sends it and those receiving it. */
export interface BoardLinkWire {
  senderBoardId: string
  receiverBoardIds: string[]
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
  return SINK_NODE_TYPES.has(nodeType) || nodeType === BOARD_LINK_OUT_NODE_TYPE
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
  /** Board id → ids of every root node in that board's partition. */
  byBoard: Map<string, Set<string>>
  /** Node id → the boards whose partition holds it. */
  byNode: Map<string, Set<string>>
  /** Receiving board id → the slots it reads, keyed by source node and port. */
  linkIns: Map<string, Map<string, BoardLinkSlot>>
  /** Board id → the root edges it receives over a link, by edge id. */
  linkedEdges: Map<string, Map<string, BoardLinkSlot>>
  /** The slots every board sends, sender by sender in board order. */
  slots: BoardLinkSlot[]
  hash: number
  issues: CrossBoardIssue[]
  wires: Map<string, BoardLinkWire>
  partitions: Map<string, BoardPartition>
}

const slotKey = (nodeId: string, handle: string) => `${nodeId}\u0000${handle}`

/**
 * Which nodes land in which board's partition, and what crosses between them.
 *
 * - A node is **anchored** to the boards that alone can compute it: a part or
 *   LED output to its board, a network endpoint to the board in its
 *   `boardId`, and a generator owner (Music Player, Performance Generator,
 *   Pattern Slideshow) to every board whose LED output it reaches.
 * - A node is **foreign** to a board when it is anchored elsewhere, or takes
 *   a wire no link carries from a node foreign to that board.
 * - Each board walks upstream from its Board and anchors. The walk stops at
 *   a foreign node: a wire from one that a link carries becomes a link-in,
 *   any other is a cross-board issue. A link-in's source is computed and sent
 *   by its home, the first board it is not foreign to, which walks upstream
 *   from it in turn; the walks repeat until no board gains a node.
 * - A node no walk reached (an unfinished patch, or a sink such as Master
 *   Speed that every sketch applies) joins each board it is wired to through
 *   other unreached nodes, and failing that every board it is not foreign
 *   to, so the drawer diagnoses it once by id, as before links.
 */
function membership(nodes: readonly StudioNode[], edges: readonly StudioEdge[]): Membership {
  const boards = boardNodesIn(nodes)
  const primaryId = boards[0]?.id ?? ROOT_BOARD_NODE_ID
  const boardIds = new Set(boards.map((board) => board.id))
  const boardOrder = boards.map((board) => board.id)
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const neighbours = new Map<string, string[]>()
  const downstream = new Map<string, string[]>()
  const incoming = new Map<string, StudioEdge[]>()
  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    push(neighbours, edge.source, edge.target)
    push(neighbours, edge.target, edge.source)
    push(downstream, edge.source, edge.target)
    push(incoming, edge.target, edge)
  }

  const byBoard = new Map<string, Set<string>>()
  const byNode = new Map<string, Set<string>>()
  const place = (boardId: string, nodeId: string) => {
    byBoard.get(boardId)!.add(nodeId)
    const owners = byNode.get(nodeId)
    if (owners) owners.add(boardId)
    else byNode.set(nodeId, new Set([boardId]))
  }
  for (const board of boards) byBoard.set(board.id, new Set())

  const empty: Membership = {
    boards, primaryId, byBoard, byNode, linkIns: new Map(), linkedEdges: new Map(),
    slots: [], hash: 0, issues: [], wires: new Map(), partitions: new Map(),
  }
  if (boards.length === 0) return empty
  if (boards.length === 1) {
    for (const node of nodes) place(primaryId, node.id)
    return empty
  }

  // ── Anchors ────────────────────────────────────────────────────────────
  const anchors = new Map<string, Set<string>>()
  const anchor = (nodeId: string, boardId: string) => {
    const set = anchors.get(nodeId)
    if (set) set.add(boardId)
    else anchors.set(nodeId, new Set([boardId]))
  }
  for (const node of nodes) {
    const type = nodeTypeOf(node)
    if (isBoardAttachedNodeType(type) || isNetworkEndpointNodeType(type)) {
      anchor(node.id, boardIdOf(node, primaryId, boardIds))
    }
  }
  for (const node of nodes) {
    if (!isGeneratorOwnerNodeType(nodeTypeOf(node))) continue
    const seen = new Set<string>([node.id])
    const pending = [node.id]
    while (pending.length) {
      const id = pending.pop()!
      for (const next of downstream.get(id) ?? []) {
        if (seen.has(next) || boardIds.has(next)) continue
        seen.add(next)
        const target = byId.get(next)!
        if (isBoardAttachedNodeType(nodeTypeOf(target))) {
          if (nodeTypeOf(target) === 'MatrixOutput') anchor(node.id, boardIdOf(target, primaryId, boardIds))
          continue
        }
        pending.push(next)
      }
    }
  }

  // ── The foreign rule ───────────────────────────────────────────────────
  const carriedType = (edge: StudioEdge): BoardLinkDataType | null => {
    const source = byId.get(edge.source)!
    if (isLinkedControlsSource(source, edge.sourceHandle)) return 'playercontrols'
    const type = outputPortDataType(source, edge.sourceHandle)
    return isBoardLinkDataType(type) ? type : null
  }
  // Foreign is the closure of "anchored elsewhere" along the wires no link
  // carries, computed forward per board, so a feedback loop in the graph
  // reaches the same answer whichever node the walk meets first.
  const outgoing = new Map<string, StudioEdge[]>()
  for (const list of incoming.values()) for (const edge of list) push(outgoing, edge.source, edge)
  const foreignSets = new Map<string, Set<string>>()
  const foreignSetOf = (boardId: string): Set<string> => {
    const known = foreignSets.get(boardId)
    if (known) return known
    const set = new Set<string>()
    const queue: string[] = []
    for (const [nodeId, anchored] of anchors) {
      if (!anchored.has(boardId)) { set.add(nodeId); queue.push(nodeId) }
    }
    while (queue.length) {
      const id = queue.pop()!
      for (const edge of outgoing.get(id) ?? []) {
        const target = edge.target
        if (set.has(target) || anchors.has(target) || boardIds.has(target)) continue
        if (carriedType(edge) !== null) continue
        set.add(target)
        queue.push(target)
      }
    }
    foreignSets.set(boardId, set)
    return set
  }
  const foreign = (boardId: string, nodeId: string): boolean => {
    if (boardIds.has(nodeId)) return nodeId !== boardId
    const anchored = anchors.get(nodeId)
    if (anchored) return !anchored.has(boardId)
    return foreignSetOf(boardId).has(nodeId)
  }
  const homeOf = (nodeId: string): string | null => boardOrder.find((id) => !foreign(id, nodeId)) ?? null

  // ── The walks ──────────────────────────────────────────────────────────
  const pending = new Map<string, string[]>(boardOrder.map((id) => [id, []]))
  const seed = (boardId: string, nodeId: string) => {
    if (byBoard.get(boardId)!.has(nodeId)) return
    place(boardId, nodeId)
    pending.get(boardId)!.push(nodeId)
  }
  for (const board of boards) seed(board.id, board.id)
  for (const [nodeId, owners] of anchors) for (const boardId of owners) seed(boardId, nodeId)

  const sent = new Map<string, Map<string, BoardLinkSlot>>(boardOrder.map((id) => [id, new Map()]))
  const linkIns = new Map<string, Map<string, BoardLinkSlot>>(boardOrder.map((id) => [id, new Map()]))
  const linkedEdges = new Map<string, Map<string, BoardLinkSlot>>(boardOrder.map((id) => [id, new Map()]))
  const issues: CrossBoardIssue[] = []
  const reported = new Set<string>()
  // A node made foreign by an uncarried wire is not where the problem is: the
  // wire into it is. Walk back to the first such wire, so the finding names
  // the microphone, not every pattern downstream of it.
  const rootWire = (boardId: string, start: StudioEdge): StudioEdge => {
    // Breadth first, so a feedback loop on the way back cannot hide the wire
    // from the anchored node that made the loop foreign in the first place.
    const seen = new Set<string>([start.id])
    const queue = [start]
    for (let i = 0; i < queue.length; i += 1) {
      const edge = queue[i]
      if (anchors.has(edge.source)) return edge
      for (const wire of incoming.get(edge.source) ?? []) {
        if (seen.has(wire.id) || carriedType(wire) !== null || !foreign(boardId, wire.source)) continue
        seen.add(wire.id)
        queue.push(wire)
      }
    }
    return start
  }
  const report = (found: StudioEdge, boardId: string, foundType: string | null) => {
    const edge = rootWire(boardId, found)
    const dataType = edge === found ? foundType : outputPortDataType(byId.get(edge.source)!, edge.sourceHandle)
    if (reported.has(edge.id)) return
    reported.add(edge.id)
    const source = edge.source
    issues.push({
      sourceNodeId: source,
      targetNodeId: edge.target,
      sourceBoardId: homeOf(source) ?? [...(anchors.get(source) ?? [])][0] ?? primaryId,
      targetBoardId: boardId,
      dataType,
    })
  }

  let moved = true
  while (moved) {
    moved = false
    for (const boardId of boardOrder) {
      const queue = pending.get(boardId)!
      while (queue.length) {
        moved = true
        const id = queue.pop()!
        for (const edge of incoming.get(id) ?? []) {
          const source = edge.source
          if (boardIds.has(source)) continue
          if (!foreign(boardId, source)) {
            seed(boardId, source)
            continue
          }
          const dataType = carriedType(edge)
          const sender = dataType ? homeOf(source) : null
          if (!dataType || !sender) {
            report(edge, boardId, dataType ? null : outputPortDataType(byId.get(source)!, edge.sourceHandle))
            continue
          }
          const handle = edge.sourceHandle ?? ''
          const key = slotKey(source, handle)
          let slot = sent.get(sender)!.get(key)
          if (!slot) {
            slot = {
              slot: -1, senderBoardId: sender, sourceNodeId: source, sourceHandle: handle, dataType,
              momentary: dataType === 'bool' && isMomentaryBoolSource(byId.get(source)!, handle, nodes),
              receivers: [],
            }
            sent.get(sender)!.set(key, slot)
            seed(sender, source)
          }
          const receiver: BoardLinkReceiver = { boardId, nodeId: edge.target, handle: edge.targetHandle ?? '' }
          slot.receivers.push(receiver)
          linkIns.get(boardId)!.set(key, slot)
          linkedEdges.get(boardId)!.set(edge.id, slot)
        }
      }
    }
  }

  // ── Nodes no walk reached ──────────────────────────────────────────────
  const unplaced = (nodeId: string) => !byNode.has(nodeId) && !boardIds.has(nodeId)
  const reach = new Map<string, Set<string>>()
  for (const boardId of boardOrder) {
    const found = new Set<string>()
    const queue = [...byBoard.get(boardId)!]
    while (queue.length) {
      const id = queue.pop()!
      for (const next of neighbours.get(id) ?? []) {
        if (found.has(next) || !unplaced(next) || foreign(boardId, next)) continue
        found.add(next)
        queue.push(next)
      }
    }
    reach.set(boardId, found)
  }
  for (const [boardId, found] of reach) for (const nodeId of found) place(boardId, nodeId)
  for (const node of nodes) {
    if (!unplaced(node.id)) continue
    for (const boardId of boardOrder) if (!foreign(boardId, node.id)) place(boardId, node.id)
  }

  // ── Display and controls fields, start values ──────────────────────────
  // A display wire carries only the fields its receivers read, and a
  // Controls wire the presses and levels its panel can produce; every other
  // slot starts where its source does before the first frame arrives.
  for (const own of sent.values()) {
    for (const slot of own.values()) {
      const source = byId.get(slot.sourceNodeId)!
      if (slot.dataType === 'playercontrols') {
        slot.fields = touchControlsFields(source, nodes, edges).map((field) => ({ ...field, index: -1 }))
        continue
      }
      if (slot.dataType !== 'display') {
        slot.start = boardLinkStartValue(source, slot.sourceHandle, slot.dataType)
        continue
      }
      const kind = displayKindOfSource(source)
      const wanted = new Set<string>()
      for (const receiver of slot.receivers) {
        const target = byId.get(receiver.nodeId)
        if (!kind || !target) continue
        for (const field of receiverDisplayFields(target, receiver.handle, kind, edges, byBoard.get(receiver.boardId)!)) {
          wanted.add(field)
        }
      }
      slot.displayKind = kind
      slot.fields = displaySlotFields(kind, wanted).map((field) => ({ ...field, index: -1 }))
    }
  }

  // A screen reading whose receivers read no field a link carries (a Pattern
  // Browser, whose thumbnails exist only on the sending board), or a Controls
  // wire from a panel that publishes no control, has nothing to send: it is a
  // wire that cannot cross, not an empty slot that would compile a receive
  // path waiting for frames that never come.
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  for (const own of sent.values()) {
    for (const [key, slot] of own) {
      if (!slot.fields || slot.fields.length > 0) continue
      own.delete(key)
      for (const receiver of slot.receivers) {
        linkIns.get(receiver.boardId)!.delete(key)
        const received = linkedEdges.get(receiver.boardId)!
        for (const [edgeId, carried] of received) {
          if (carried !== slot) continue
          received.delete(edgeId)
          const edge = edgeById.get(edgeId)
          if (edge) report(edge, receiver.boardId, slot.dataType)
        }
      }
    }
  }

  // ── Slot numbers and the hash ──────────────────────────────────────────
  // Numbered in root order of their source, so an edit elsewhere in the
  // graph leaves every slot where it was and the hash unchanged. A display
  // slot takes one frame index per field it carries, from its own `slot` on.
  const rootIndex = new Map(nodes.map((node, index) => [node.id, index]))
  const slots: BoardLinkSlot[] = []
  const frames: Record<string, BoardLinkFrameEntry[]> = {}
  for (const boardId of boardOrder) {
    const own = [...sent.get(boardId)!.values()].sort((a, b) =>
      (rootIndex.get(a.sourceNodeId)! - rootIndex.get(b.sourceNodeId)!)
      || (a.sourceHandle < b.sourceHandle ? -1 : a.sourceHandle > b.sourceHandle ? 1 : 0))
    const table: BoardLinkFrameEntry[] = []
    for (const slot of own) {
      slot.slot = table.length
      if (slot.fields) {
        for (const field of slot.fields) {
          field.index = table.length
          table.push({ index: field.index, kind: field.kind })
        }
      } else {
        table.push({
          index: slot.slot, kind: boardLinkWireKind(slot),
          ...(boardLinkSlotHolds(byId.get(slot.sourceNodeId), slot.sourceHandle) ? { hold: true as const } : {}),
        })
      }
    }
    if (table.length) frames[boardId] = table
    slots.push(...own)
  }
  const hash = slots.length ? boardLinkSchemaHash(slots, boardOrder) : 0
  const settings = boardLinkSettings(boards[0]?.data.properties as Record<string, unknown> | undefined)
  // The same test validation applies: a board's network user brings up Wi-Fi
  // unless the board is on a cable.
  const wifiByBoard: Record<string, string> = {}
  for (const boardId of boardOrder) {
    const members = byBoard.get(boardId)!
    const own = nodes.filter((node) => members.has(node.id))
    const source = wiredNetworkIn(own) ? null : networkSourceIn(own)
    if (source) wifiByBoard[boardId] = source.id
  }
  const context: BoardLinkContext = {
    hash, linkId: settings.linkId, channel: settings.channel, boardOrder, frames, wifiByBoard,
  }
  for (const slot of slots) slot.link = context

  const wires = new Map<string, BoardLinkWire>()
  for (const boardId of boardOrder) {
    for (const [edgeId, slot] of linkedEdges.get(boardId)!) {
      const wire = wires.get(edgeId)
      if (wire) wire.receiverBoardIds.push(boardId)
      else wires.set(edgeId, { senderBoardId: slot.senderBoardId, receiverBoardIds: [boardId] })
    }
  }

  return {
    boards, primaryId, byBoard, byNode, linkIns, linkedEdges, slots, hash,
    issues, wires, partitions: new Map(),
  }
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

/** A synthetic link node: never on the canvas, never saved. */
function linkNode(type: string, id: string, slot: BoardLinkSlot, label: string): StudioNode {
  const port = { id: BOARD_LINK_PORT_ID, label: 'Value', dataType: slot.dataType }
  const properties: BoardLinkNodeProperties = {
    slot: slot.slot,
    senderBoardId: slot.senderBoardId,
    sourceNodeId: slot.sourceNodeId,
    sourceHandle: slot.sourceHandle,
    dataType: slot.dataType,
    momentary: slot.momentary,
    ...(slot.fields ? { displayKind: slot.displayKind ?? null, fields: slot.fields } : {}),
    ...(slot.start !== undefined ? { start: slot.start } : {}),
    ...(slot.link ? { link: slot.link } : {}),
  }
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label,
      nodeType: type,
      category: 'signal',
      properties: properties as unknown as Record<string, unknown>,
      inputs: type === BOARD_LINK_OUT_NODE_TYPE ? [port] : [],
      outputs: type === BOARD_LINK_IN_NODE_TYPE ? [port] : [],
    },
  } as unknown as StudioNode
}

export const boardLinkInNodeId = (slot: Pick<BoardLinkSlot, 'sourceNodeId' | 'sourceHandle'>) =>
  `board-link-in:${slot.sourceNodeId}:${slot.sourceHandle}`
export const boardLinkOutNodeId = (slot: Pick<BoardLinkSlot, 'sourceNodeId' | 'sourceHandle'>) =>
  `board-link-out:${slot.sourceNodeId}:${slot.sourceHandle}`

/**
 * The slice of the root graph board `boardId` compiles: its Board node, the
 * parts and outputs attached to it, the signal nodes that reach them, and the
 * edges with both ends inside, in root order. A wire it receives over a link
 * arrives from a `BoardLinkIn`, keeping the wire's own id; a value it sends
 * leaves through a `BoardLinkOut`. Link nodes follow the root nodes. An
 * unknown `boardId` reads as the primary, like a part's dangling `boardId`.
 */
export function boardPartition(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  boardId: string,
): BoardPartition {
  const state = membershipOf(nodes, edges)
  const { boards, primaryId, byBoard } = state
  if (boards.length === 0) return { board: null, nodes: [...nodes], edges: [...edges] }
  const id = byBoard.has(boardId) ? boardId : primaryId
  const cached = state.partitions.get(id)
  if (cached) return cached

  const members = byBoard.get(id)!
  const linked = state.linkedEdges.get(id) ?? new Map<string, BoardLinkSlot>()
  const partNodes = nodes.filter((node) => members.has(node.id))
  const partEdges: StudioEdge[] = []
  for (const edge of edges) {
    const slot = linked.get(edge.id)
    if (slot) {
      partEdges.push({ ...edge, source: boardLinkInNodeId(slot), sourceHandle: BOARD_LINK_PORT_ID })
    } else if (members.has(edge.source ?? '') && members.has(edge.target ?? '')) {
      partEdges.push(edge)
    }
  }
  for (const slot of state.linkIns.get(id)?.values() ?? []) {
    partNodes.push(linkNode(BOARD_LINK_IN_NODE_TYPE, boardLinkInNodeId(slot), slot, 'Board link in'))
  }
  for (const slot of state.slots) {
    if (slot.senderBoardId !== id) continue
    const linkOutId = boardLinkOutNodeId(slot)
    partNodes.push(linkNode(BOARD_LINK_OUT_NODE_TYPE, linkOutId, slot, 'Board link out'))
    partEdges.push({
      id: `board-link-edge:${slot.sourceNodeId}:${slot.sourceHandle}`,
      source: slot.sourceNodeId,
      sourceHandle: slot.sourceHandle,
      target: linkOutId,
      targetHandle: BOARD_LINK_PORT_ID,
    } as StudioEdge)
  }
  const result: BoardPartition = {
    board: boards.find((board) => board.id === id) ?? null,
    nodes: partNodes,
    edges: partEdges,
  }
  state.partitions.set(id, result)
  return result
}

/** Node id → the ids of the boards whose partition holds that root node. */
export function boardMembership(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): ReadonlyMap<string, ReadonlySet<string>> {
  return membershipOf(nodes, edges).byNode
}

/**
 * Wires no link can carry between boards: a `frame`, `audio` or other
 * structure from a node one board computes into a node another computes (a
 * microphone on Board 2 feeding a pattern Board 1 shows), or a carried type
 * whose source no single board can compute. Two boards showing one pattern
 * makes none.
 */
export function findCrossBoardIssues(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): CrossBoardIssue[] {
  return membershipOf(nodes, edges).issues
}

/**
 * The slot table both ends of every link compile from, and its hash. Empty
 * (hash 0) when no wire crosses boards.
 */
export function boardLinkSchema(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): BoardLinkSchema {
  const { slots, hash } = membershipOf(nodes, edges)
  return { slots, hash }
}

/** Root edge id → the boards a link wire runs between, for the canvas. */
export function boardLinkWires(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): ReadonlyMap<string, BoardLinkWire> {
  return membershipOf(nodes, edges).wires
}
