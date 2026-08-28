// Which displays a template sketch drives, and what feeds them.
//
// Two generators are fixed templates rather than compiled graphs — the SD
// player and the generative show controller — so a display's inputs cannot
// come from arbitrary wiring the way they do in a normal sketch. What they can
// come from is the template itself: the node that holds the music is the node
// that knows the title, and a wire from Music Player to a display is a request
// to show that.
//
// Which of those wires a template can honour differs, and that is the only
// thing that differs. The player is holding a file and can answer for the
// track; the show controller is rotating patterns and has no music at all, so
// it honours none of them and every song wire is reported unresolved. Passing
// the expression table in rather than branching on the generator is what keeps
// one resolver serving both: a third template supplies its own table and
// inherits the pin, layout and controller resolution unchanged.
//
// Resolution mirrors `playerControlsFromGraph`: walk the edges once, decide
// what each port is fed by, and report anything that cannot be honoured rather
// than emitting a display that quietly shows nothing.

import { infoLayoutForKind, type InfoDisplayLayout } from '../state/infoDisplay'
import {
  DISPLAY_SOURCE_LABELS, DISPLAY_SOURCE_NODE_TYPES, type DisplaySignalKind,
} from '../state/displaySignal'
import {
  asOledRotation, oledRotationCommands, asOledAddress,
  type OledTransport,
} from '../state/oledSurface'
import { oledControllerForProps, oledTransportForProps, tftControllerForProps } from '../state/nodeLibrary'
import { asTransportDisplayLayout, type TransportDisplayLayout } from '../state/transportDisplay'
import { asTftRotation, TFT_CONTROLLERS, type TftController, type TftRotation } from '../state/tftSurface'
import { segmentModeForKind, segmentControllerFor, clampSegmentBrightness, type SegmentDisplayMode } from '../state/segmentDisplay'
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
  showColon: boolean
  enabled: boolean
  sources: Record<string, string>
}

/**
 * One colour panel in a player sketch.
 *
 * The controller and rotation travel as resolved objects rather than as a part
 * id, because everything downstream — window origin, MADCTL, the size the
 * layout resolves against — is derived from them, and re-resolving in the
 * generator is how the two halves would come to disagree.
 */
export interface PlayerTransportDisplay {
  id: string
  partId: string
  layout: TransportDisplayLayout
  controller: TftController
  rotation: TftRotation
  csPin: number
  dcPin: number
  resetPin: number
  sckPin: number
  mosiPin: number
  backlightPin: number
  touch: null | {
    csPin: number
    irqPin: number
    sckPin: number
    mosiPin: number
    misoPin: number
    xMin: number
    xMax: number
    yMin: number
    yMax: number
  }
  enabled: boolean
  sources: Record<string, string>
}

export interface PlayerDisplays {
  info: PlayerInfoDisplay[]
  segment: PlayerSegmentDisplay[]
  tft: PlayerTransportDisplay[]
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

function touchRawProp(value: unknown, fallback: number): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(4095, n)) : fallback
}

/** What a `playercontrols` chain can end at. */
export type ControlChainSink =
  /** Music Player's transport: play/pause, track, volume, pattern selection. */
  | 'player'
  /** An LED output's blackout and dimming latch. */
  | 'output'

/**
 * Every sink a control bundle reaches, following Player Controls links.
 *
 * One walk for both, because "does this wire go anywhere" is one question with
 * two answers now. A panel wired to an LED output is serviced by a normal
 * sketch; one wired to Music Player is serviced by the SD player; one wired to
 * both is serviced by whichever generator the graph selects. Answering only
 * the player half is what made a touch panel look unroutable in a plain sketch
 * for as long as an LED output had nothing to receive it on.
 */
export function controlChainSinks(
  sourceId: string,
  edges: ConfigEdge[],
  byId: Map<string, ConfigNode>,
): Set<ControlChainSink> {
  const found = new Set<ControlChainSink>()
  const pending = [sourceId]
  const seen = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const edge of edges) {
      if (edge.source !== id || edge.sourceHandle !== 'controls') continue
      const target = byId.get(edge.target)
      if (target?.data.nodeType === 'PatternMaster' && edge.targetHandle === 'controls') found.add('player')
      if (target?.data.nodeType === 'MatrixOutput' && edge.targetHandle === 'controls') found.add('output')
      if (target?.data.nodeType === 'PlayerControls' && edge.targetHandle === 'controlsIn') pending.push(target.id)
    }
  }
  return found
}

/** Whether this display's control bundle reaches the Music Player through the
 * same Player Controls chain as physical buttons and encoders. */
export function displayControlsPlayer(
  displayId: string,
  edges: ConfigEdge[],
  byId: Map<string, ConfigNode>,
): boolean {
  return controlChainSinks(displayId, edges, byId).has('player')
}

/*
 * What a generative show controller can answer for a display, and what it cannot.
 *
 * Deliberately empty, and the emptiness is the statement. A generative show
 * rotates patterns; it is not holding a file, so there is no title, no artist,
 * no elapsed time and no volume anywhere in the sketch. Wiring one of Music
 * Player's song outputs to a panel in a show is therefore reported unresolved
 * rather than filled with a plausible zero — the same rule the browser follows
 * when it leaves artist blank instead of guessing it from a filename.
 *
 * What the controller *does* know it supplies without a wire, below: which
 * pattern is running and how many there are. Those come from the show's own
 * state rather than from a port, because they are the show, not the music.
 */
export const SHOW_DISPLAY_EXPRESSIONS: Record<string, string> = {}

/** What a template generator can answer for, and what it can act on. */
export interface TemplateDisplayOptions {
  /**
   * Music Player output handle -> the C++ expression that reads it here.
   *
   * Defaults to the SD player's table. A generator hands in its own rather
   * than being branched on, so an unlisted handle is reported unresolved by
   * the same path for every template.
   */
  expressions?: Record<string, string>
  /**
   * Whether a wired Controls output reaches a transport this template has.
   *
   * False for a generator with nothing to control: the touch service calls
   * the player's own transport functions, so emitting it into a sketch that
   * has none produces C++ that names undefined symbols. Diagnostics touch is
   * unaffected — it only reports coordinates.
   */
  transportTouch?: boolean
  /**
   * Which `Display` sources this template can honour.
   *
   * A simple panel's content is one wire, so "can this generator draw this
   * panel" is one question: is the thing plugged in something this sketch has.
   * The player has a track, the show has a rotation, and neither has the
   * other's — so a panel wired across is reported here rather than emitted
   * blank.
   */
  kinds?: readonly DisplaySignalKind[]
}

/**
 * Resolve a simple display's one content input to the source kind behind it.
 *
 * Null means the panel draws its waiting screen: either nothing is plugged in,
 * which is a legitimate state a panel states outright, or something is that
 * this generator cannot answer for — which is reported.
 */
function resolveDisplayKind(
  displayId: string,
  edges: ConfigEdge[],
  byId: Map<string, ConfigNode>,
  unresolved: PlayerDisplays['unresolved'],
  kinds: readonly DisplaySignalKind[],
): DisplaySignalKind | null {
  const edge = edges.find((e) => e.target === displayId && e.targetHandle === 'display')
  if (!edge) return null
  const source = byId.get(edge.source)
  if (!source) return null
  const kind = DISPLAY_SOURCE_NODE_TYPES[source.data.nodeType]
  if (!kind) {
    unresolved.push({ display: displayId, port: 'display', source: source.data.nodeType })
    return null
  }
  if (!kinds.includes(kind)) {
    unresolved.push({ display: displayId, port: 'display', source: DISPLAY_SOURCE_LABELS[kind] })
    return null
  }
  return kind
}

/**
 * Resolve one display input to a template-side expression.
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
  expressions: Record<string, string>,
): string | null {
  const edge = edges.find((e) => e.target === displayId && e.targetHandle === port)
  if (!edge) return null
  const source = byId.get(edge.source)
  if (!source) return null
  if (source.data.nodeType !== 'PatternMaster') {
    unresolved.push({ display: displayId, port, source: source.data.nodeType })
    return null
  }
  const expression = expressions[String(edge.sourceHandle ?? '')]
  if (!expression) {
    unresolved.push({ display: displayId, port, source: `Music Player.${edge.sourceHandle}` })
    return null
  }
  return expression
}

export function playerDisplaysFromGraph(
  nodes: ConfigNode[],
  edges: ConfigEdge[],
  options: TemplateDisplayOptions = {},
): PlayerDisplays {
  const expressions = options.expressions ?? PLAYER_SONG_EXPRESSIONS
  const kinds = options.kinds ?? ['player']
  const transportTouch = options.transportTouch !== false
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const unresolved: PlayerDisplays['unresolved'] = []
  const info: PlayerInfoDisplay[] = []
  const segment: PlayerSegmentDisplay[] = []
  const tft: PlayerTransportDisplay[] = []

  for (const node of nodes) {
    const props = node.data.properties
    if (node.data.nodeType === 'InfoDisplay') {
      const partId = String(props.partId ?? 'sh1106-oled-128x64')
      const controller = oledControllerForProps(node.data.properties)
      const rotation = oledRotationCommands(asOledRotation(props.oledRotation))
      const kind = resolveDisplayKind(node.id, edges, byId, unresolved, kinds)
      // One envelope in, so the fields come from the generator's own table
      // rather than one wire at a time. Nothing to forget, and nothing that
      // resolves in preview and not here.
      const sources: Record<string, string> = kind === 'player'
        ? {
          title: expressions.title,
          value: expressions.elapsed,
          duration: expressions.duration,
          progress: expressions.progress,
          playing: expressions.playing,
          volume: expressions.volume,
        }
        : {}
      info.push({
        id: node.id,
        partId,
        layout: kind ? infoLayoutForKind(kind) : 'Waiting',
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

    if (node.data.nodeType === 'TransportDisplay') {
      const partId = String(props.partId ?? 'st7789-tft-240x240')
      const part = partById(partId)
      const sources: Record<string, string> = {}
      // Every port the layouts render. A player sketch can only honour the
      // ones the music itself knows; anything else wired here is reported
      // unresolved rather than emitted as a panel that shows nothing.
      for (const port of ['title', 'artist', 'elapsedSec', 'durationSec', 'progress',
        'playing', 'volume', 'patternName', 'patternIndex', 'patternCount',
        'section', 'bpm', 'beat', 'outputEnabled', 'brightness', 'enabled']) {
        const expression = resolvePort(node.id, port, edges, byId, unresolved, expressions)
        if (expression) sources[port] = expression
      }
      tft.push({
        id: node.id,
        partId,
        layout: asTransportDisplayLayout(props.tftLayout),
        controller: tftControllerForProps(props) ?? TFT_CONTROLLERS.ST7789,
        rotation: asTftRotation(props.tftRotation),
        csPin: intProp(props.csPin, 5),
        dcPin: intProp(props.dcPin, 16),
        resetPin: intProp(props.resetPin, 17),
        sckPin: intProp(props.sckPin, 18),
        mosiPin: intProp(props.mosiPin, 23),
        backlightPin: intProp(props.backlightPin, 4),
        touch: part?.display?.touchController
          && (asTransportDisplayLayout(props.tftLayout) === 'Diagnostics'
            || (transportTouch && displayControlsPlayer(node.id, edges, byId)))
          ? {
            csPin: intProp(props.touchCsPin, 15),
            irqPin: intProp(props.touchIrqPin, 2),
            sckPin: intProp(props.touchSckPin, 18),
            mosiPin: intProp(props.touchMosiPin, 23),
            misoPin: intProp(props.touchMisoPin, 19),
            xMin: touchRawProp(props.touchXMin, 200),
            xMax: touchRawProp(props.touchXMax, 3900),
            yMin: touchRawProp(props.touchYMin, 200),
            yMax: touchRawProp(props.touchYMax, 3900),
          }
          : null,
        enabled: props.enabled !== false,
        sources,
      })
      continue
    }

    if (node.data.nodeType === 'SegmentDisplay') {
      const partId = String(props.partId ?? 'tm1637-4digit-display')
      const controller = segmentControllerFor(partById(partId)?.display?.controller)
      const isMax = controller.id === 'MAX7219'
      const kind = resolveDisplayKind(node.id, edges, byId, unresolved, kinds)
      // A segment module reads one number, and which number is the kind:
      // elapsed seconds from a player, an ordinal from a show.
      const sources: Record<string, string> = kind === 'player'
        ? { value: expressions.elapsed }
        : {}
      segment.push({
        id: node.id,
        partId,
        controller: isMax ? 'MAX7219' : 'TM1637',
        digits: controller.digits,
        mode: kind ? segmentModeForKind(kind) : 'Waiting',
        clkPin: intProp(props.clkPin, 18),
        dataPin: isMax ? intProp(props.dinPin, 19) : intProp(props.dioPin, 19),
        csPin: intProp(props.csPin, 21),
        brightness: clampSegmentBrightness(props.brightness, controller),
        showColon: props.showColon !== false && controller.hasColon,
        enabled: props.enabled !== false,
        sources,
      })
    }
  }

  return { info, segment, tft, unresolved }
}
