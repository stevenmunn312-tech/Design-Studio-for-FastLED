// What a board link needs of the boards at its ends, said as Graph Health
// findings. The partition (`src/build/boardPartition.ts`) has already decided
// which values cross between boards; this checks that the boards carrying
// them can: a radio on both ends, one Wi-Fi channel, a frame that fits, a key
// to sign it with. A wire no link can carry is not here: that is the
// cross-board card in `multiBoardValidation.ts`. See
// docs/design/board-links.md, "Validation".
import type { StudioEdge, StudioNode } from '../state/graphStore'
import {
  boardLinkSchema,
  boardLinkWires,
  boardNodesIn,
  type BoardPartition,
} from '../build/boardPartition'
import type { BoardLinkSlot } from '../build/boardLinks'
import { networkSourceIn } from '../codegen/peripherals/networkCpp'
import { wiredNetworkIn } from '../state/peripherals/ethernetModule'
import { fqbnHasEspNow, fqbnHasWifi } from '../state/peripherals/networkCapability'
import { getNetworkCredentials } from '../state/peripherals/networkCredentials'
import { boardLinkSettings, getBoardLinkKey } from '../state/peripherals/boardLinkKey'
import { panelDisplaySourceKind } from '../state/displays/mountedDisplays'
import { shownDesignId, transportLayoutForKind } from '../state/displays/transportDisplay'
import type { GraphDiagnostic } from './validateGraph'

/**
 * The most slots one board sends, and the most of them that are text. The
 * frame is at most 250 bytes, and a heartbeat carries every number slot and
 * one text slot; these keep both inside it. A bound to confirm at the first
 * bench run (root todo, section 4), not a measured ceiling.
 */
export const BOARD_LINK_MAX_SLOTS = 64
export const BOARD_LINK_MAX_TEXT_SLOTS = 8

/** One board as the multi-board validator runs it. */
export interface LinkedBoardRun {
  board: StudioNode
  label: string
  partition: BoardPartition
  /** Empty when the caller does not know the board's target. */
  fqbn: string
}

/** The fixed layouts that draw the LEDs' own picture (showGenerator's `PICTURE_LAYOUTS`). */
const PICTURE_LAYOUTS: ReadonlySet<string> = new Set(['Now Playing', 'Show Status'])

function nodeLabel(node: StudioNode): string {
  return String(node.data.label ?? node.data.nodeType ?? '')
}

/**
 * Whether a slot carries text. A display field the partition decomposes a
 * screen reading into may say its own type beside the slot's; a text field
 * costs a text slot like a wired string does.
 */
function isTextSlot(slot: BoardLinkSlot): boolean {
  if (slot.dataType === 'string') return true
  const extra = slot as BoardLinkSlot & { field?: { dataType?: unknown }; fieldDataType?: unknown }
  return extra.field?.dataType === 'string' || extra.fieldDataType === 'string'
}

function listOf(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * Every board-link finding for the boards in `runs`. `onlyBoardId` narrows
 * the list to the findings that belong to that board's deploy gate: its own
 * radio and slot bounds, a network mismatch it is one side of, and the
 * missing key on any linked board.
 */
export function boardLinkFindings(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  runs: readonly LinkedBoardRun[],
  onlyBoardId?: string,
): GraphDiagnostic[] {
  const { slots } = boardLinkSchema(nodes, edges)
  if (slots.length === 0) return []
  const runOf = new Map(runs.map((run) => [run.board.id, run]))
  const labelOf = (boardId: string) => runOf.get(boardId)?.label ?? boardId
  const byId = new Map(nodes.map((node) => [node.id, node]))

  // Who talks to whom: a board's partners are the boards it sends a slot to
  // and the boards it receives one from.
  const partners = new Map<string, Set<string>>()
  const pair = (a: string, b: string) => {
    if (a === b) return
    const set = partners.get(a)
    if (set) set.add(b)
    else partners.set(a, new Set([b]))
  }
  for (const slot of slots) {
    for (const receiver of slot.receivers) {
      pair(slot.senderBoardId, receiver.boardId)
      pair(receiver.boardId, slot.senderBoardId)
    }
  }
  const linkedRuns = runs.filter((run) => partners.has(run.board.id))
  const concerns = (...boardIds: string[]) => !onlyBoardId || boardIds.includes(onlyBoardId)
  const issues: GraphDiagnostic[] = []

  // ── ESP-NOW on both ends ───────────────────────────────────────────────
  const radioless = new Set<string>()
  for (const run of linkedRuns) {
    if (!run.fqbn || fqbnHasEspNow(run.fqbn)) continue
    radioless.add(run.board.id)
    if (!concerns(run.board.id)) continue
    const others = [...partners.get(run.board.id)!].map(labelOf)
    issues.push({
      id: `board-link-radio-${run.board.id}`, severity: 'error', category: 'board',
      title: `${run.label} has no radio for the board link`,
      message: `${run.label} trades values with ${listOf(others)} over ESP-NOW, and its selected board has no ESP-NOW radio.`,
      fix: `Choose an ESP32 with a radio (classic, S2, S3, C3 or C6) or an ESP8266 for ${run.label}.`,
      nodeIds: [run.board.id], nodeLabel: run.label,
    })
  }

  // ── One Wi-Fi channel ──────────────────────────────────────────────────
  // A board that joins Wi-Fi sits on its router's channel, so every linked
  // board on Wi-Fi must join the same network. A cable does not move the
  // radio: a board on wired Ethernet alone counts as off Wi-Fi, on the link
  // channel like a board with no network at all.
  const onWifi = linkedRuns.flatMap((run) => {
    if (radioless.has(run.board.id) || (run.fqbn && !fqbnHasWifi(run.fqbn))) return []
    if (wiredNetworkIn(run.partition.nodes)) return []
    const owner = networkSourceIn(run.partition.nodes)
    return owner ? [{ run, owner, ssid: getNetworkCredentials(owner.id).ssid }] : []
  })
  // A board with no network name yet has its own SSID warning; it joins
  // nothing to compare.
  const named = onWifi.filter((entry) => entry.ssid)
  const reference = named[0]
  for (const entry of named.slice(1)) {
    if (entry.ssid === reference.ssid || !concerns(entry.run.board.id, reference.run.board.id)) continue
    const a = reference.run.label
    const b = entry.run.label
    issues.push({
      id: `board-link-network-${entry.run.board.id}`, severity: 'error', category: 'board',
      title: `${a} and ${b} are on different Wi-Fi networks`,
      message: `Linked boards must share one radio channel, and a board on Wi-Fi takes its router's. ${a} joins "${reference.ssid}" and ${b} joins "${entry.ssid}", so the two cannot count on hearing each other.`,
      fix: `Enter the same Wi-Fi network for ${b} as for ${a}.`,
      nodeIds: [entry.owner.id, reference.owner.id], nodeLabel: nodeLabel(entry.owner),
    })
  }
  if (onWifi.length > 0) {
    const primary = boardNodesIn(nodes)[0]
    const { channel } = boardLinkSettings(primary?.data.properties)
    const wifiBoard = onWifi[0]
    const network = wifiBoard.ssid ? `"${wifiBoard.ssid}"` : 'a Wi-Fi network'
    for (const run of linkedRuns) {
      if (radioless.has(run.board.id) || onWifi.some((entry) => entry.run === run)) continue
      if (onlyBoardId) continue // advice, never a gate
      issues.push({
        id: `board-link-channel-${run.board.id}`, severity: 'warning', category: 'board',
        title: `${run.label} may not hear ${wifiBoard.run.label}`,
        message: `${wifiBoard.run.label} joins ${network}, so its radio is on that router's channel. ${run.label} joins no Wi-Fi network and listens on the link channel, ${channel}, so the two hear each other only while the router uses channel ${channel}.`,
        fix: `Set the router to channel ${channel}, or set the link channel in ${labelOf(primary?.id ?? '')}'s options to the router's channel.`,
        nodeIds: [run.board.id], nodeLabel: run.label,
      })
    }
  }

  // ── What one board can send ────────────────────────────────────────────
  for (const run of linkedRuns) {
    if (!concerns(run.board.id)) continue
    const sent = slots.filter((slot) => slot.senderBoardId === run.board.id)
    const sources = [...new Set(sent.map((slot) => slot.sourceNodeId))].filter((id) => byId.has(id))
    if (sent.length > BOARD_LINK_MAX_SLOTS) {
      issues.push({
        id: `board-link-slots-${run.board.id}`, severity: 'error', category: 'board',
        title: `${run.label} sends more than the link can carry`,
        message: `${run.label} sends ${sent.length} values over the link, and one board can send at most ${BOARD_LINK_MAX_SLOTS}.`,
        fix: 'Send fewer: compute a value on the board that uses it, or put a control on the board it controls.',
        nodeIds: sources, nodeLabel: run.label,
      })
    }
    const text = sent.filter(isTextSlot)
    if (text.length > BOARD_LINK_MAX_TEXT_SLOTS) {
      issues.push({
        id: `board-link-text-${run.board.id}`, severity: 'error', category: 'board',
        title: `${run.label} sends too much text over the link`,
        message: `${run.label} sends ${text.length} text values over the link, and one board can send at most ${BOARD_LINK_MAX_TEXT_SLOTS}.`,
        fix: `Show fewer text readings on the linked boards, or move a panel that shows them onto ${run.label}.`,
        nodeIds: [...new Set(text.map((slot) => slot.sourceNodeId))].filter((id) => byId.has(id)),
        nodeLabel: run.label,
      })
    }
  }

  // ── The link key ───────────────────────────────────────────────────────
  // Every linked board signs and checks frames with it, so a missing key
  // stops all of them; making a new one means flashing all of them again.
  const primary = boardNodesIn(nodes)[0]
  const { linkId } = boardLinkSettings(primary?.data.properties)
  if (!getBoardLinkKey(linkId) && (!onlyBoardId || partners.has(onlyBoardId))) {
    issues.push({
      id: 'board-link-key', severity: 'error', category: 'board',
      title: linkId ? 'This computer has no key for the board link' : 'The board link has no key yet',
      message: linkId
        ? "Linked boards sign every frame with the project's link key, which stays on the computer that made it, and this one does not have it."
        : 'Linked boards sign every frame with a key that this computer keeps for the project, and it has none yet.',
      fix: linkId
        ? 'Make a new key here, then upload every linked board again: a board flashed with the old key ignores frames signed with the new one.'
        : 'Make one, then upload every linked board.',
      nodeIds: primary ? [primary.id] : [], nodeLabel: 'Board link',
      action: 'renew-board-link-key', repair: { kind: 'renew-board-link-key' },
    })
  }

  // ── The LED picture on a remote panel ──────────────────────────────────
  // A link carries a screen's readings, never the LEDs: a fixed layout that
  // draws the picture on another board shows an empty frame where it goes.
  // A screen design has no widget that draws the live picture (the Pattern
  // Browser's artwork is baked into each sketch), so only the fixed layouts
  // are asked.
  if (!onlyBoardId) {
    const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
    for (const [edgeId, wire] of boardLinkWires(nodes, edges)) {
      const edge = edgeById.get(edgeId)
      const panel = edge && byId.get(edge.target)
      const source = edge && byId.get(edge.source)
      if (!edge || !panel || !source || edge.targetHandle !== 'display') continue
      if (panel.data.nodeType !== 'TransportDisplay' || shownDesignId(panel.data.properties)) continue
      const kind = panelDisplaySourceKind(panel, nodes, edges)
      const layout = kind ? transportLayoutForKind(kind, panel.data.properties.tftLayout) : null
      if (!layout || !PICTURE_LAYOUTS.has(layout)) continue
      const sender = labelOf(wire.senderBoardId)
      const receivers = listOf(wire.receiverBoardIds.map(labelOf))
      issues.push({
        id: `board-link-picture-${panel.id}`, severity: 'warning', category: 'board',
        title: `${nodeLabel(panel)} on ${receivers} cannot show the LEDs`,
        message: `Its ${layout} layout draws the LED picture, which stays on ${sender}: the link carries what is showing, not the LEDs, so the picture's frame stays empty.`,
        fix: layout === 'Now Playing'
          ? `Choose the Fixed Transport layout for it, or put the panel on ${sender}.`
          : `Put the panel on ${sender} to see the picture; the rest of the screen works as it is.`,
        nodeIds: [panel.id, source.id], edgeIds: [edge.id], nodeLabel: nodeLabel(panel),
      })
    }
  }

  return issues
}
