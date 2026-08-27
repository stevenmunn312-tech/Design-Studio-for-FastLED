// Which displays a player sketch drives, and what feeds them.
//
// The player sketch is a fixed template rather than a compiled graph, so a
// display's inputs cannot come from arbitrary wiring the way they do in a
// normal sketch. What they can come from is the player itself: the node that
// holds the music is the node that knows the title, and a wire from Music
// Player to a display is a request to show that.
//
// Resolution mirrors `playerControlsFromGraph`: walk the edges once, decide
// what each port is fed by, and report anything that cannot be honoured rather
// than emitting a display that quietly shows nothing.

import {
  asInfoDisplayLayout, STATUS_MAX_INDICATORS, type InfoDisplayLayout,
} from '../state/infoDisplay'
import {
  asOledRotation, oledRotationCommands, asOledAddress,
  type OledTransport,
} from '../state/oledSurface'
import { oledControllerForProps, oledTransportForProps } from '../state/nodeLibrary'
import { asSegmentMode, segmentControllerFor, clampSegmentBrightness, type SegmentDisplayMode } from '../state/segmentDisplay'
import { partById } from '../state/partCatalogue'
import { PLAYER_SONG_EXPRESSIONS } from './playerSongInfoCpp'

interface ConfigNode {
  id: string
  data: { nodeType: string; properties: Record<string, unknown> }
}

interface ConfigEdge {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

/** One display in a player sketch, with each port already resolved. */
export interface PlayerInfoDisplay {
  id: string
  partId: string
  layout: InfoDisplayLayout
  /** Which wires carry the bytes; the layout is the same either way. */
  transport: OledTransport
  csPin: number
  dcPin: number
  resetPin: number
  sckPin: number
  mosiPin: number
  /** I2C only: the pins the sketch starts `Wire` on, and the module's strap. */
  sdaPin: number
  sclPin: number
  address: number
  columnOffset: number
  segmentRemap: number
  comScan: number
  enabled: boolean
  /** Port id -> C++ expression, for the ports this sketch can honour. */
  sources: Record<string, string>
}

export interface PlayerSegmentDisplay {
  id: string
  partId: string
  controller: 'TM1637' | 'MAX7219'
  digits: number
  mode: SegmentDisplayMode
  clkPin: number
  dataPin: number
  csPin: number
  brightness: number
  decimals: number
  leadingZero: boolean
  showColon: boolean
  enabled: boolean
  sources: Record<string, string>
}

export interface PlayerDisplays {
  info: PlayerInfoDisplay[]
  segment: PlayerSegmentDisplay[]
  /**
   * Ports wired to something this sketch cannot evaluate.
   *
   * The player runs a fixed template, so a display fed from a Wave or a Math
   * node has no value to read here. Naming them is what stops the sketch
   * building successfully with a panel that never shows the thing it was wired
   * to — the failure the display plan rules out.
   */
  unresolved: Array<{ display: string; port: string; source: string }>
}

function intProp(value: unknown, fallback: number): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : fallback
}

/**
 * Resolve one display input to a player-side expression.
 *
 * Only Music Player is a source here. Anything else is reported unresolved
 * rather than guessed at.
 */
function resolvePort(
  displayId: string,
  port: string,
  edges: ConfigEdge[],
  byId: Map<string, ConfigNode>,
  unresolved: PlayerDisplays['unresolved'],
): string | null {
  const edge = edges.find((e) => e.target === displayId && e.targetHandle === port)
  if (!edge) return null
  const source = byId.get(edge.source)
  if (!source) return null
  if (source.data.nodeType !== 'PatternMaster') {
    unresolved.push({ display: displayId, port, source: source.data.nodeType })
    return null
  }
  const expression = PLAYER_SONG_EXPRESSIONS[String(edge.sourceHandle ?? '')]
  if (!expression) {
    unresolved.push({ display: displayId, port, source: `Music Player.${edge.sourceHandle}` })
    return null
  }
  return expression
}

export function playerDisplaysFromGraph(nodes: ConfigNode[], edges: ConfigEdge[]): PlayerDisplays {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const unresolved: PlayerDisplays['unresolved'] = []
  const info: PlayerInfoDisplay[] = []
  const segment: PlayerSegmentDisplay[] = []

  for (const node of nodes) {
    const props = node.data.properties
    if (node.data.nodeType === 'InfoDisplay') {
      const partId = String(props.partId ?? 'sh1106-oled-128x64')
      const controller = oledControllerForProps(node.data.properties)
      const rotation = oledRotationCommands(asOledRotation(props.oledRotation))
      const sources: Record<string, string> = {}
      for (const port of ['title', 'line2', 'value', 'progress', 'playing', 'volume',
        ...Array.from({ length: STATUS_MAX_INDICATORS }, (_, i) => `indicator${i + 1}`)]) {
        const expression = resolvePort(node.id, port, edges, byId, unresolved)
        if (expression) sources[port] = expression
      }
      info.push({
        id: node.id,
        partId,
        layout: asInfoDisplayLayout(props.infoLayout),
        transport: oledTransportForProps(props),
        csPin: intProp(props.csPin, 5),
        dcPin: intProp(props.dcPin, 16),
        resetPin: intProp(props.resetPin, 17),
        sckPin: intProp(props.sckPin, 18),
        mosiPin: intProp(props.mosiPin, 23),
        sdaPin: intProp(props.sdaPin, 21),
        sclPin: intProp(props.sclPin, 22),
        address: asOledAddress(props.i2cAddress),
        columnOffset: controller?.columnOffset ?? 0,
        segmentRemap: rotation.segmentRemap,
        comScan: rotation.comScan,
        enabled: props.enabled !== false,
        sources,
      })
      continue
    }

    if (node.data.nodeType === 'SegmentDisplay') {
      const partId = String(props.partId ?? 'tm1637-4digit-display')
      const controller = segmentControllerFor(partById(partId)?.display?.controller)
      const isMax = controller.id === 'MAX7219'
      const sources: Record<string, string> = {}
      for (const port of ['value', 'enabled']) {
        const expression = resolvePort(node.id, port, edges, byId, unresolved)
        if (expression) sources[port] = expression
      }
      segment.push({
        id: node.id,
        partId,
        controller: isMax ? 'MAX7219' : 'TM1637',
        digits: controller.digits,
        mode: asSegmentMode(props.segmentMode),
        clkPin: intProp(props.clkPin, 18),
        dataPin: isMax ? intProp(props.dinPin, 19) : intProp(props.dioPin, 19),
        csPin: intProp(props.csPin, 21),
        brightness: clampSegmentBrightness(props.brightness, controller),
        decimals: intProp(props.decimals, 0),
        leadingZero: props.leadingZero === true,
        showColon: props.showColon !== false && controller.hasColon,
        enabled: props.enabled !== false,
        sources,
      })
    }
  }

  return { info, segment, unresolved }
}
