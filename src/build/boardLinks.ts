import type { StudioNode } from '../state/graphStore'
import { NODE_LIBRARY } from '../state/nodeLibrary'
import {
  displayHueColor, displayPickerTone, displayWidgetPortId, parseDisplayWidgetPortId,
} from '../state/displays/displayRegistry'
import type { DisplaySignalKind } from '../state/displays/displaySignal'
import {
  normalizeWebRemoteControls, parseWebRemotePortId, webRemoteControlKind, webRemoteStartState,
} from '../state/peripherals/webRemote'

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
/**
 * Plus a Touch Screen's Controls bundle, which crosses only from a Touch
 * Screen (`isLinkedControlsSource`), split into its presses and levels.
 */
export type BoardLinkDataType = (typeof BOARD_LINK_DATA_TYPES)[number] | 'playercontrols'

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
 * How one value is written into a frame. A held bool is one byte, a press a
 * counter and the level, a string its length and up to 63 bytes; see "What a
 * link carries" in docs/design/board-links.md.
 */
export type BoardLinkWireKind = 'float' | 'bool' | 'press' | 'color' | 'text' | 'datetime'

/** A value's bytes on the wire, or for text the most it can take. */
export const BOARD_LINK_WIRE_BYTES: Record<BoardLinkWireKind, number> = {
  float: 4, bool: 1, press: 3, color: 3, text: 64, datetime: 4,
}

/**
 * One field of a display wire, at its own frame index. A display slot is
 * decomposed into the fields its receiving panels read, so a panel that shows
 * a title and a position costs two values on the wire.
 */
export interface BoardLinkField {
  /** The source-field id (`title`, `elapsed`, …), or `dateTime` for a clock. */
  id: string
  kind: BoardLinkWireKind
  /** The field's index in its sender's frame. */
  index: number
}

/** One value a board sends, as its frame table lists it. */
export interface BoardLinkFrameEntry {
  index: number
  kind: BoardLinkWireKind
}

/**
 * What every linked sketch compiles beside its own slots: the link's identity,
 * its radio channel and every sender's frame table. A receiver decodes a
 * frame by its sender's table, skipping the values it does not read, so each
 * board's tables are built from the one slot list both sides share.
 */
export interface BoardLinkContext {
  hash: number
  /** The project's link id (eight hex digits), or null before one is made. */
  linkId: string | null
  /** The channel the boards use when none joins a network. */
  channel: number
  /** Board ids in frame order: a frame's sender byte indexes this list. */
  boardOrder: string[]
  /** Each sending board's frame table, in index order. */
  frames: Record<string, BoardLinkFrameEntry[]>
  /**
   * The boards that join Wi-Fi, each with the node whose network it joins (a
   * network user, and no wired Ethernet). Their radios sit on the router's
   * channel, so a board that joins none follows that network's channel.
   */
  wifiByBoard: Record<string, string>
}

/**
 * The properties a synthetic link node carries: which slot it stands for and
 * what it replaced. The generators read these and nothing else.
 */
export interface BoardLinkNodeProperties {
  /** The slot's frame index in its sending board's frame (a display slot's first field). */
  slot: number
  /** The board that sends the slot. */
  senderBoardId: string
  /** The node and port on the sending board the value comes from. */
  sourceNodeId: string
  sourceHandle: string
  dataType: BoardLinkDataType
  /** A bool that is a press (counted) rather than a level (held). */
  momentary: boolean
  /** A display slot: the source's kind and the fields its receivers read. */
  displayKind?: DisplaySignalKind | null
  fields?: BoardLinkField[]
  /**
   * What a link-in reads before the first frame: the sending node's start
   * value, the same one the preview has at time zero.
   */
  start?: number | boolean | string
  link?: BoardLinkContext
}

/** How a non-display slot's value is written into the frame. */
export function boardLinkWireKind(slot: Pick<BoardLinkNodeProperties, 'dataType' | 'momentary'>): BoardLinkWireKind {
  switch (slot.dataType) {
    case 'bool': return slot.momentary ? 'press' : 'bool'
    case 'color': return 'color'
    case 'string': return 'text'
    case 'datetime': return 'datetime'
    default: return 'float'
  }
}

/**
 * A sending node's value before anything has moved it: a Web Remote control's
 * start state, and for everything else the rest value of its type (0, false,
 * black, an empty string), which is what a part reads before its first sample.
 * A colour is packed 0xRRGGBB.
 */
export function boardLinkStartValue(node: StudioNode, handle: string, dataType: BoardLinkDataType): number | boolean | string {
  const type = String((node.data as { nodeType?: string }).nodeType ?? '')
  if (type === 'WebRemoteInput') {
    const id = parseWebRemotePortId(handle)
    const control = normalizeWebRemoteControls(node.data.properties?.controls).find((entry) => entry.id === id)
    if (control) {
      const start = webRemoteStartState(control)
      if (dataType === 'color' && typeof start === 'number') {
        const tone = displayPickerTone(control)
        const rgb = displayHueColor(start, tone.saturation, tone.brightness)
        return (rgb.r << 16) | (rgb.g << 8) | rgb.b
      }
      if (dataType === 'bool') return start === true
      if (dataType === 'string') return typeof start === 'string' ? start : ''
      if (typeof start === 'number' && Number.isFinite(start)) return start
    }
  }
  return dataType === 'bool' ? false : dataType === 'string' ? '' : 0
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
 * nothing on the wire; a display slot's fields are in, because a panel that
 * starts reading another field moves every index after it.
 */
export function boardLinkSchemaHash(slots: readonly BoardLinkSlot[], boardOrder: readonly string[]): number {
  const rows = slots.map((slot) => [
    boardOrder.indexOf(slot.senderBoardId), slot.slot, slot.sourceNodeId, slot.sourceHandle,
    slot.dataType, slot.momentary ? 1 : 0,
    ...(slot.fields ? [slot.fields.map((field) => `${field.id}/${field.kind}/${field.index}`).join(',')] : []),
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
