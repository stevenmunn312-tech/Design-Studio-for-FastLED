/**
 * Generate the board-link (D-13) compile fixtures: each board's sketch for the
 * three bench runs in the root todo, section 4, and the two shapes of a board
 * off Wi-Fi that follows a linked board's network. See docs/design/board-links.md.
 *
 * Each pair is one root graph cut by `boardPartition`, exactly as the Upload
 * tab cuts it, so a sketch here is the one that board would be flashed with.
 * The pins are the bench's own wiring.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { NODE_LIBRARY, libraryDefaults, tftControllerForProps } from '../../src/state/nodeLibrary'
import {
  TRANSPORT_TOUCH_ACTION_LABELS, TRANSPORT_TOUCH_ACTION_TYPES, transportTouchActions,
} from '../../src/state/displays/transportTouch'
import { asTftRotation } from '../../src/state/displays/tftSurface'
import { boardPartition } from '../../src/build/boardPartition'
import { findPinConflicts } from '../../src/utils/validateGraph'
import { findCrossBoardIssues } from '../../src/build/boardPartition'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { useBoardLinkKeyStore } from '../../src/state/peripherals/boardLinkKey'
import { useNetworkCredentialsStore } from '../../src/state/peripherals/networkCredentials'
import { webRemoteOutputs } from '../../src/state/peripherals/webRemote'
import { buildShowPlayer } from '../../src/utils/showUpload'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  const merged = { ...libraryDefaults(nodeType), ...properties }
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output', properties: merged,
    inputs: definition?.inputs ?? [],
    outputs: nodeType === 'WebRemoteInput' ? webRemoteOutputs(merged.controls) : definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const LINK_ID = '0d13b0a7'
useBoardLinkKeyStore.getState().createKey(LINK_ID)
const on2 = { boardId: 'board-2' }
// Every Web Remote here joins the bench network, so a board that joins none
// scans for its channel. The name reaches the follower; the password does not.
for (const id of ['remote', 'remote4', 'remote5']) {
  useNetworkCredentialsStore.getState().setCredentials(id, { ssid: 'bench-network', password: 'fixture-only' })
}

const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
}

/** Board 1 of runs 1 and 2: the Music Player on an ESP32-S3 with its card, amplifier and matrix. */
const playerBoard = [
  node('board-root', 'Board', {
    profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', usePsram: true, reportTelemetry: true, linkId: LINK_ID,
  }),
  node('out', 'MatrixOutput', { width: 26, height: 17, dataPin: 1 }),
  node('card', 'SDCard', { sdMisoPin: 13, sdMosiPin: 11, sdSckPin: 12, sdCsPin: 10 }),
  node('amp', 'Amplifier', { model: 'MAX98357A', i2sLrc: 18, i2sBclk: 17, i2sDout: 16 }),
  node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
  node('master', 'PatternMaster'),
]
const playerEdges = [
  edge('collection', 'patternset', 'master', 'patternset'),
  edge('master', 'frame', 'out', 'frame'),
  edge('card', 'storage', 'master', 'storage'),
  edge('master', 'audio', 'amp', 'audio'),
]
const classicBoard2 = node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin', reportTelemetry: true })

/** Run 1: Board 2 is the XC4630 shield alone; its touch sheet is the transport. */
const xc4630 = node('tft', 'TransportDisplay', {
  ...on2, partId: 'ili9341-xc4630-parallel-touch-320x240', tftRotation: '0', tftLayout: 'Fixed Transport',
  d0Pin: 13, d1Pin: 14, d2Pin: 19, d3Pin: 21, d4Pin: 22, d5Pin: 23, d6Pin: 25, d7Pin: 26,
  resetPin: 16, csPin: 32, dcPin: 33, wrPin: 17, rdPin: 18,
})
/*
 * The graph store derives a Touch node's fixed-layout outputs from its panel
 * on every edit; a fixture has no store, so it asks the same helpers. The
 * Controls bundle crosses as these presses and levels, so without them the
 * wire has nothing to carry and is refused.
 */
const touch = node('touch', 'TouchInput', { ...on2, panelId: 'tft' })
touch.data.outputs = [
  ...touch.data.outputs,
  ...transportTouchActions(tftControllerForProps(xc4630.data.properties)!, asTftRotation('0'), 'Fixed Transport')
    .map((action) => ({ id: action, label: TRANSPORT_TOUCH_ACTION_LABELS[action], dataType: TRANSPORT_TOUCH_ACTION_TYPES[action] })),
]
const run1 = {
  nodes: [...playerBoard, classicBoard2, xc4630, touch],
  edges: [
    ...playerEdges,
    edge('master', 'display', 'tft', 'display'),
    edge('touch', 'controls', 'master', 'controls'),
  ],
}

/** Run 2: Board 2 is a 128x64 SSD1306 and a bare encoder, its switch for Next. */
const run2 = {
  nodes: [
    ...playerBoard, classicBoard2,
    node('oled', 'InfoDisplay', { ...on2, partId: 'ssd1306-oled-096-128x64-i2c', sdaPin: 21, sclPin: 22, i2cAddress: '0x3C' }),
    node('enc', 'EncoderInput', { ...on2, pinA: 25, pinB: 26, pinSW: 27, pullup: true, levelStart: 1, levelClicks: 10 }),
  ],
  edges: [
    ...playerEdges,
    edge('master', 'display', 'oled', 'display'),
    edge('enc', 'level', 'master', 'volume'),
    edge('enc', 'pressed', 'master', 'next'),
  ],
}

/** Run 3: an ESP8266 serving a Web Remote whose slider sets an ESP32's brightness. */
const remote = node('remote', 'WebRemoteInput', {
  ...on2, controls: [{ id: 'level', type: 'Slider', label: 'Brightness', properties: {} }],
})
const run3 = {
  nodes: [
    node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin', reportTelemetry: true, linkId: LINK_ID }),
    node('board-2', 'Board', { profileId: 'esp8266-lolin-d1-mini', reportTelemetry: true }),
    node('fill', 'SolidColor'), node('dim', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    remote,
  ],
  edges: [
    edge('fill', 'frame', 'dim', 'frame'), edge('dim', 'frame', 'out', 'frame'),
    edge('remote', 'remote:level', 'dim', 'brightness'),
  ],
}

/**
 * Run 4: the run 1 Music Player off Wi-Fi beside a board on it. Board 2 also
 * serves a Web Remote, so it rides the router's channel and the S3 follows.
 */
const run4 = {
  nodes: [
    ...run1.nodes,
    node('remote4', 'WebRemoteInput', { ...on2, controls: [{ id: 'back', type: 'Button', label: 'Back', properties: {} }] }),
  ],
  edges: [...run1.edges, edge('remote4', 'remote:back', 'master', 'previous')],
}

/**
 * Run 5: an ESP8266 that only sends, off Wi-Fi beside an ESP32 serving a Web
 * Remote. It hears nothing, so it looks for the network's channel on a timer.
 */
const run5 = {
  nodes: [
    node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin', reportTelemetry: true, linkId: LINK_ID }),
    node('board-2', 'Board', { profileId: 'esp8266-lolin-d1-mini', reportTelemetry: true }),
    node('fill', 'SolidColor'), node('dim', 'BrightnessMod'), node('dim2', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    node('remote5', 'WebRemoteInput', { controls: [{ id: 'level', type: 'Slider', label: 'Level', properties: {} }] }),
    node('button', 'ButtonInput', { ...on2, pin: 5 }),
  ],
  edges: [
    edge('fill', 'frame', 'dim', 'frame'), edge('dim', 'frame', 'dim2', 'frame'), edge('dim2', 'frame', 'out', 'frame'),
    edge('remote5', 'remote:level', 'dim', 'brightness'), edge('button', 'pressed', 'dim2', 'brightness'),
  ],
}

const player = (graph: { nodes: StudioNode[]; edges: StudioEdge[] }) => {
  const one = boardPartition(graph.nodes, graph.edges, 'board-root')
  return buildShowPlayer(one.nodes, one.edges, groups, {
    patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
  })
}
const normal = (graph: { nodes: StudioNode[]; edges: StudioEdge[] }, boardId: string) => {
  const part = boardPartition(graph.nodes, graph.edges, boardId)
  return generateCpp(part.nodes, part.edges, groups)
}

const graphs = { run1, run2, run3, run4, run5 }
for (const [name, graph] of Object.entries(graphs)) {
  const crossing = findCrossBoardIssues(graph.nodes, graph.edges)
  if (crossing.length > 0) throw new Error(`${name}: a wire cannot cross boards: ${JSON.stringify(crossing)}`)
  for (const boardId of ['board-root', 'board-2']) {
    const conflicts = findPinConflicts(boardPartition(graph.nodes, graph.edges, boardId).nodes)
    if (conflicts.length > 0) throw new Error(`${name} ${boardId} has pin conflicts: ${conflicts.join('; ')}`)
  }
}

const sketches: Record<string, string> = {
  'run1-board1-player': player(run1),
  'run1-board2-xc4630': normal(run1, 'board-2'),
  'run2-board1-player': player(run2),
  'run2-board2-oled-encoder': normal(run2, 'board-2'),
  'run3-board1-esp32': normal(run3, 'board-root'),
  'run3-board2-esp8266-remote': normal(run3, 'board-2'),
  'run4-board1-player-follows': player(run4),
  'run5-board2-esp8266-follows': normal(run5, 'board-2'),
}

// Every sketch is one half of a link: a sketch with no link code means the
// partition dropped the wire, and the compile would prove nothing.
for (const [name, source] of Object.entries(sketches)) {
  if (!source.includes('_lnkBegin(')) throw new Error(`${name}.ino has no board link`)
}
// The boards that join no Wi-Fi beside one that does follow its channel by
// name, and never carry its password: they scan, they do not join.
for (const name of ['run3-board1-esp32', 'run4-board1-player-follows', 'run5-board2-esp8266-follows']) {
  if (!sketches[name].includes('_lnkFollow(')) throw new Error(`${name}.ino does not follow the network's channel`)
  if (sketches[name].includes('fixture-only')) throw new Error(`${name}.ino carries the network's password`)
}

const outDir = resolve(process.argv[2] ?? 'artifacts/board-link-compile')
mkdirSync(outDir, { recursive: true })
for (const [name, source] of Object.entries(sketches)) {
  writeFileSync(resolve(outDir, `${name}.ino`), source)
  console.log(`${name}.ino  ${createHash('sha256').update(source).digest('hex').slice(0, 12)}`)
}
