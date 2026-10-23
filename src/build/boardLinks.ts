import type { StudioNode } from '../state/graphStore'
import { NODE_LIBRARY } from '../state/nodeLibrary'
import { displayWidgetPortId, parseDisplayWidgetPortId } from '../state/displays/displayRegistry'
import { normalizeWebRemoteControls, parseWebRemotePortId, webRemoteControlKind } from '../state/peripherals/webRemote'

/**
 * Board links — the vocabulary the partition walk and the generators share.
 *
 * A wire from a node one board computes into a node another board computes is
 * carried over ESP-NOW when its type is one a link can carry. The partition
 * replaces such a wire with a synthetic `BoardLinkIn` on the receiving board
 * and a `BoardLinkOut` on the sending one, so every one-board consumer sees a
 * plain source and a plain sink. Neither type is in the node library or ever
 * saved: they exist only in the partition. See docs/design/board-links.md.
 */

export const BOARD_LINK_IN_NODE_TYPE = 'BoardLinkIn'
export const BOARD_LINK_OUT_NODE_TYPE = 'BoardLinkOut'

/** The one port each link node has: the link-in's output, the link-out's input. */
export const BOARD_LINK_PORT_ID = 'value'

/** The wire types a link carries; everything else cannot cross boards. */
export const BOARD_LINK_DATA_TYPES = ['float', 'bool', 'color', 'string', 'datetime', 'display'] as const
export type BoardLinkDataType = (typeof BOARD_LINK_DATA_TYPES)[number]

const LINKABLE = new Set<string>(BOARD_LINK_DATA_TYPES)

export function isBoardLinkDataType(dataType: string | null | undefined): dataType is BoardLinkDataType {
  return typeof dataType === 'string' && LINKABLE.has(dataType)
}

export function isBoardLinkNodeType(nodeType: string): boolean {
  return nodeType === BOARD_LINK_IN_NODE_TYPE || nodeType === BOARD_LINK_OUT_NODE_TYPE
}

/**
 * Network endpoints: a radio or socket on one physical board. Each carries a
 * `boardId` like a bench part (absent means the primary) so that only one
 * board serves the Web Remote page or listens for Art-Net.
 */
const NETWORK_ENDPOINT_NODE_TYPES = new Set(['WebRemoteInput', 'DMXInput', 'DdpInput', 'StreamOutput'])

export function isNetworkEndpointNodeType(nodeType: string): boolean {
  return NETWORK_ENDPOINT_NODE_TYPES.has(nodeType)
}

/**
 * Generator owners: the node that is a board's sketch generator. Each is
 * anchored to every board whose LED output it reaches downstream.
 */
const GENERATOR_OWNER_NODE_TYPES = new Set(['PatternMaster', 'PerformanceGenerator', 'PatternSlideshow'])

export function isGeneratorOwnerNodeType(nodeType: string): boolean {
  return GENERATOR_OWNER_NODE_TYPES.has(nodeType)
}

const LIBRARY_OUTPUTS = new Map(NODE_LIBRARY.map((def) => [def.type, def.outputs]))

interface PortCarrier {
  outputs?: readonly { id: string; dataType: string }[]
}

/**
 * The data type of a node's output port: the instance's own ports first
 * (minted ports such as a Web Remote control or a Touch widget live only
 * there), then the library's. Null for a port neither declares.
 */
export function outputPortDataType(node: StudioNode, handle: string | null | undefined): string | null {
  const data = node.data as PortCarrier & { nodeType?: string }
  const id = handle ?? ''
  const own = data.outputs?.find((port) => port.id === id)
  if (own) return own.dataType
  const declared = LIBRARY_OUTPUTS.get(String(data.nodeType ?? ''))?.find((port) => port.id === id)
  return declared?.dataType ?? null
}

/**
 * The properties a synthetic link node carries: which slot it stands for and
 * what it replaced. The generators read these and nothing else.
 */
export interface BoardLinkNodeProperties {
  /** The slot's position in its sending board's frame. */
  slot: number
  /** The board that sends the slot. */
  senderBoardId: string
  /** The node and port on the sending board the value comes from. */
  sourceNodeId: string
  sourceHandle: string
  dataType: BoardLinkDataType
  /** A bool that is a press (counted) rather than a level (held). */
  momentary: boolean
}

export function boardLinkPropertiesOf(node: StudioNode): BoardLinkNodeProperties | null {
  const type = (node.data as { nodeType?: string }).nodeType ?? ''
  if (!isBoardLinkNodeType(type)) return null
  return node.data.properties as unknown as BoardLinkNodeProperties
}

/** One end of a linked wire on a receiving board. */
export interface BoardLinkReceiver {
  boardId: string
  nodeId: string
  handle: string
}

/** One value a board sends over the link, and everywhere it lands. */
export interface BoardLinkSlot extends BoardLinkNodeProperties {
  receivers: BoardLinkReceiver[]
}

export interface BoardLinkSchema {
  slots: BoardLinkSlot[]
  /**
   * FNV-1a over the slot table, compiled into every linked sketch: a board
   * running firmware from before the link last changed sends a different
   * hash, and its frames are dropped rather than misread.
   */
  hash: number
}

/** FNV-1a, 32 bits, over the UTF-16 code units of `text`. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * The hash of a slot table. Only what both sketches depend on goes in: who
 * sends, the slot's position, the value's identity and how it is encoded.
 * Receivers are left out, because a new consumer of an existing slot changes
 * nothing on the wire.
 */
export function boardLinkSchemaHash(slots: readonly BoardLinkSlot[], boardOrder: readonly string[]): number {
  const rows = slots.map((slot) => [
    boardOrder.indexOf(slot.senderBoardId), slot.slot, slot.sourceNodeId, slot.sourceHandle,
    slot.dataType, slot.momentary ? 1 : 0,
  ].join(':'))
  return fnv1a32(rows.join('|'))
}

/**
 * Sources whose every bool output is a press: push switches, touch pads,
 * keypads, the Button Bank's and the IR remote's minted keys.
 */
const MOMENTARY_NODE_TYPES = new Set([
  'ButtonInput', 'TouchButtonInput', 'ButtonBank', 'KeypadInput', 'JoystickInput', 'TouchPadInput', 'IRRemoteInput',
])
/** Single momentary ports on nodes whose other bool outputs are levels. */
const MOMENTARY_PORTS: Record<string, readonly string[]> = {
  EncoderInput: ['pressed'],
  // A fixed panel layout's touch actions, each a one-pass pulse.
  TouchInput: ['playPause', 'previous', 'next', 'ledToggle'],
}

/**
 * Whether a bool source is a press (sent as a counter, so a tap between two
 * receiver passes is never lost) rather than a level (sent as is).
 *
 * A Web Remote control is a press when it is a Button. A screen widget on a
 * Touch node is a press when nothing in the graph can set it: a Toggle is
 * synchronised, so its panel carries a `widget:<id>:set` input, and a Button
 * has none. `nodes` is the graph that answers that.
 */
export function isMomentaryBoolSource(node: StudioNode, handle: string, nodes: readonly StudioNode[]): boolean {
  const type = String((node.data as { nodeType?: string }).nodeType ?? '')
  if (MOMENTARY_NODE_TYPES.has(type)) return true
  if (MOMENTARY_PORTS[type]?.includes(handle)) return true
  if (type === 'WebRemoteInput') {
    const id = parseWebRemotePortId(handle)
    const control = normalizeWebRemoteControls(node.data.properties?.controls).find((entry) => entry.id === id)
    return control ? webRemoteControlKind(control.type) === 'press' : false
  }
  if (type === 'TouchInput') {
    const widget = parseDisplayWidgetPortId(handle)
    if (!widget) return false
    const setPort = displayWidgetPortId(widget.widgetId, 'set')
    return !nodes.some((other) => (other.data as PortCarrier & { inputs?: readonly { id: string }[] }).inputs
      ?.some((port) => port.id === setPort))
  }
  return false
}
