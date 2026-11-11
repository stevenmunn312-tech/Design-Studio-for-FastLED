/**
 * Generate the v1 targeted-pass variants: one small sketch for each node
 * setting that landed between 2026-11-09 and 2026-11-11 and that no other
 * fixture reaches, because the other gates build each node at its defaults.
 * See root todo, step 2, and
 * docs/reports/compile/v1-targeted-pass-compile-checks.md.
 *
 * Every sketch is checked by the deploy gate for its board before it is
 * written, and the manifest names the board each one builds on.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { buildShowPlayer } from '../../src/utils/showUpload'
import type { GroupRegistry } from '../../src/state/graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import { BUNDLED_PATTERNS } from '../../src/state/patterns/bundledPatterns'
import { starterShowPatterns } from '../../src/state/patterns/starterShowPatterns'
import { STARTER_TEMPLATES, buildBoardAwareStarter } from '../../src/state/patterns/starterTemplates'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { useNetworkCredentialsStore } from '../../src/state/peripherals/networkCredentials'
import { findBoardPinCompatibility, findDeployBlockingErrors, findExactBoardPinIssues, findPinConflicts } from '../../src/utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  // A group's own output is not a library node.
  const definition = nodeType === 'GroupOutput'
    ? { label: 'Group Output', category: 'composite', inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }], outputs: [] }
    : NODE_LIBRARY.find((entry) => entry.type === nodeType)
  if (!definition) throw new Error(`no node type ${nodeType}`)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

/** A wire, refused when either end names a port its node does not have. */
function wire(nodes: StudioNode[], source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  const from = nodes.find((entry) => entry.id === source)
  const to = nodes.find((entry) => entry.id === target)
  if (!from?.data.outputs.some((port) => port.id === sourceHandle)) throw new Error(`${source} has no output ${sourceHandle}`)
  if (!to?.data.inputs.some((port) => port.id === targetHandle)) throw new Error(`${target} has no input ${targetHandle}`)
  return { id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle } as StudioEdge
}

const CLASSIC = 'esp32:esp32:esp32'
const S3 = 'esp32:esp32:esp32s3'
const UNO = 'arduino:avr:uno'

type Wire = [source: string, sourceHandle: string, target: string, targetHandle: string]
interface Graph { fqbn: string; nodes: StudioNode[]; edges: StudioEdge[] }
interface Fixture { fqbn: string; source: string }

const classicBoard = () => node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin' })
const s3Board = () => node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' })
// Classic-ESP32 I2S pins: the library defaults are an S3's.
const classicMic = () => [node('mic', 'MicInput', { i2sSck: 26, i2sWs: 25, i2sSd: 33 }), node('audio', 'Audio', { sourceId: 'mic' })]
const s3Mic = () => [node('mic', 'MicInput'), node('audio', 'Audio', { sourceId: 'mic' })]
const matrix = (properties: Record<string, unknown> = {}) =>
  node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5, ...properties })
const strip = () => node('out', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 5 })

function graph(fqbn: string, nodes: StudioNode[], wires: Wire[]): Graph {
  return { fqbn, nodes, edges: wires.map((entry) => wire(nodes, ...entry)) }
}

/** One frame node into an output on a classic ESP32. */
const frame = (nodeType: string, properties: Record<string, unknown>, output = matrix()): Graph =>
  graph(CLASSIC, [classicBoard(), node('n', nodeType, properties), output], [['n', 'frame', 'out', 'frame']])

/** One field node, coloured, into an output on a classic ESP32. */
const field = (nodeType: string, properties: Record<string, unknown>, output = matrix()): Graph =>
  graph(CLASSIC, [classicBoard(), node('n', nodeType, properties), node('color', 'FieldToFrame', { palette: 'ocean' }), output],
    [['n', 'field', 'color', 'field'], ['color', 'frame', 'out', 'frame']])

/** A frame effect over a moving source. */
const effect = (nodeType: string, properties: Record<string, unknown>, output = matrix()): Graph =>
  graph(CLASSIC, [classicBoard(), node('src', 'Noise'), node('n', nodeType, properties), output],
    [['src', 'frame', 'n', 'frame'], ['n', 'frame', 'out', 'frame']])

/** A reading on the output's Brightness, with a second one on Enabled where given. */
function reading(sensor: StudioNode, level: string, gate?: string, extra: StudioNode[] = []): Graph {
  const out = matrix({ width: 8, height: 8 })
  out.data.exposedInputs = ['brightness', 'enabled']
  const nodes = [classicBoard(), ...extra, sensor, node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }), out]
  return graph(CLASSIC, nodes, [
    ['fill', 'frame', 'out', 'frame'], [sensor.id, level, 'out', 'brightness'],
    ...(gate ? [[sensor.id, gate, 'out', 'enabled'] as Wire] : []),
  ])
}

// Network sketches read the Board's own credentials, seeded as a user enters them.
useNetworkCredentialsStore.getState().setCredentials('board', { ssid: 'studio-bench', password: 'studio-bench-key' })

const normal: Record<string, Graph> = {}

// ── Inputs and data links ──────────────────────────────────────────────────
normal['presence-connected-mm'] = reading(node('radar', 'PresenceInput'), 'distance', 'connected')
normal['keypad-keys-digit'] = (() => {
  const base = reading(node('keys', 'KeypadInput', { col4Pin: 23 }), 'digit', 'key5')
  return base
})()
normal['touchpad-pads'] = (() => {
  const base = reading(node('pads', 'TouchPadInput'), 'count', 'pad0')
  const pick = node('pick', 'Switch', { a: 0.2, b: 1 })
  const nodes = [...base.nodes, pick]
  return { ...base, nodes, edges: [...base.edges.filter((entry) => entry.targetHandle !== 'brightness'),
    wire(nodes, 'pads', 'pad11', 'pick', 'sel'), wire(nodes, 'pick', 'result', 'out', 'brightness')] }
})()
normal['accel-shake'] = reading(node('imu', 'MotionVectorInput'), 'shake', 'connected')
normal['dmx-live'] = (() => {
  const out = matrix({ width: 8, height: 8 })
  out.data.exposedInputs = ['brightness', 'enabled']
  const nodes = [classicBoard(), node('dmx', 'DMXInput', { inputMode: 'Art-Net' }), node('ch', 'DMXChannel', { channel: 1 }),
    node('fill', 'SolidColor'), out]
  return graph(CLASSIC, nodes, [['dmx', 'dmx', 'ch', 'dmx'], ['ch', 'value', 'out', 'brightness'],
    ['dmx', 'live', 'out', 'enabled'], ['fill', 'frame', 'out', 'frame']])
})()
normal['ddp-live'] = (() => {
  const out = matrix({ width: 8, height: 8 })
  out.data.exposedInputs = ['enabled']
  return graph(CLASSIC, [classicBoard(), node('ddp', 'DdpInput'), out],
    [['ddp', 'frame', 'out', 'frame'], ['ddp', 'live', 'out', 'enabled']])
})()
// Two DIN MIDI nodes read one jack through the shared reader.
normal['midi-din-pair'] = (() => {
  const out = matrix({ width: 8, height: 8 })
  out.data.exposedInputs = ['brightness', 'enabled']
  const din = { midiSource: 'DIN (UART)' }
  const nodes = [classicBoard(), node('jack', 'MidiInterface', { midiRxPin: 16 }),
    node('keys', 'MidiInput', { ...din, note: 60 }), node('knob', 'MidiInput', { ...din, cc: 7, channel: 2 }),
    node('fill', 'SolidColor'), out]
  return graph(CLASSIC, nodes, [['keys', 'gate', 'out', 'enabled'], ['knob', 'cc', 'out', 'brightness'], ['fill', 'frame', 'out', 'frame']])
})()
// A board has two spare UARTs, so DMX512 fits beside one other serial part
// and the allocator moves it to the UART that part leaves. With both a radar
// and a DFPlayer the deploy gate refuses the graph.
function dmxBeside(other: StudioNode, extra: Wire[] = []): Graph {
  const out = matrix({ width: 8, height: 8 })
  out.data.exposedInputs = ['brightness', 'enabled']
  const nodes = [classicBoard(),
    node('max485', 'DmxTransceiver', { dmxTxPin: 17, dmxRxPin: 16, dmxEnablePin: 21 }),
    node('dmx', 'DMXInput', { inputMode: 'DMX512' }), node('ch', 'DMXChannel', { channel: 1 }),
    other, node('fill', 'SolidColor'), out]
  return graph(CLASSIC, nodes, [['dmx', 'dmx', 'ch', 'dmx'], ['ch', 'value', 'out', 'brightness'], ['fill', 'frame', 'out', 'frame'], ...extra])
}
normal['dmx-beside-radar'] = dmxBeside(node('radar', 'PresenceInput', { rxPin: 18 }), [['radar', 'presence', 'out', 'enabled']])
normal['dmx-beside-dfplayer'] = dmxBeside(node('voice', 'DFPlayerOutput', { uartRxPin: 26, uartTxPin: 25, busyPin: 27 }), [['dmx', 'live', 'voice', 'play']])

// ── Audio ──────────────────────────────────────────────────────────────────
function bands(fqbn: string, board: StudioNode, mic: StudioNode[]): Graph {
  const nodes = [board, ...mic,
    node('ember', 'EmberPulse', { colorSource: 'palette', palette: 'lava' }), node('well', 'GravityWell'),
    // Hi-Hat Shards: the type id keeps its old name.
    node('shards', 'PrismStorm'), node('trix', 'Animartrix'),
    node('mix1', 'Blend'), node('mix2', 'Blend'), node('mix3', 'Blend'), matrix()]
  const fed: Wire[] = mic.length ? ['ember', 'well', 'shards', 'trix'].map((id) => ['audio', 'audio', id, 'audio'] as Wire) : []
  return graph(fqbn, nodes, [...fed, ['ember', 'frame', 'mix1', 'a'], ['well', 'frame', 'mix1', 'b'],
    ['mix1', 'frame', 'mix2', 'a'], ['shards', 'frame', 'mix2', 'b'],
    ['mix2', 'frame', 'mix3', 'a'], ['trix', 'frame', 'mix3', 'b'], ['mix3', 'frame', 'out', 'frame']])
}
normal['bands-mic-s3'] = bands(S3, s3Board(), s3Mic())
normal['bands-no-mic'] = bands(CLASSIC, classicBoard(), [])
normal['dance-flash-ember-palette'] = graph(CLASSIC, [classicBoard(), ...classicMic(), node('beat', 'BeatDetect'),
  node('ember', 'EmberPulse', { colorSource: 'palette', palette: 'sunset' }),
  node('flash', 'DanceFlash', { colorSource: 'palette', palette: 'party' }), matrix()],
[['audio', 'audio', 'ember', 'audio'], ['audio', 'audio', 'beat', 'audio'], ['beat', 'beat', 'flash', 'beat'],
  ['ember', 'frame', 'flash', 'frame'], ['flash', 'frame', 'out', 'frame']])
normal['audio-features-level'] = reading(node('features', 'AudioFeatures'), 'level', 'silence', classicMic())
normal['audio-features-level'].edges.push(wire(normal['audio-features-level'].nodes, 'audio', 'audio', 'features', 'audio'))
// The envelope and the bar phase both run on the sketch clock.
normal['envelope-beat-phase'] = (() => {
  const out = matrix({ width: 8, height: 8 })
  out.data.exposedInputs = ['brightness']
  const nodes = [classicBoard(), ...classicMic(), node('beat', 'BeatDetect'), node('env', 'Envelope', { attack: 0.02, decay: 0.4 }),
    node('phase', 'BeatPhase'), node('mul', 'Math', { mathOp: 'multiply' }), node('fill', 'SolidColor'), out]
  return graph(CLASSIC, nodes, [['audio', 'audio', 'beat', 'audio'], ['beat', 'beat', 'env', 'trigger'],
    ['beat', 'beat', 'phase', 'beat'], ['beat', 'bpm', 'phase', 'bpm'], ['env', 'result', 'mul', 'a'], ['phase', 'phase', 'mul', 'b'],
    ['mul', 'result', 'out', 'brightness'], ['fill', 'frame', 'out', 'frame']])
})()

// The drum patterns play their demo kit while no drum port is wired.
normal['demo-drums-kick-shock'] = frame('KickShock', {})
normal['demo-drums-percussion-blobs'] = frame('PercussionBlobs', {})
// The Clock's time zone on an ESP8266, whose core takes the zone with the server.
normal['clock-zone-esp8266'] = (() => {
  const out = matrix({ width: 8, height: 8 })
  out.data.exposedInputs = ['brightness']
  const nodes = [node('board', 'Board', { profileId: 'esp8266-lolin-d1-mini' }),
    node('clock', 'RTCInput', { timeSource: 'NTP', ntpServer: 'pool.ntp.org', timeZone: 'Europe/Paris' }),
    node('seconds', 'MapRange', { inMin: 0, inMax: 59, outMin: 0, outMax: 1, clamp: true }),
    node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }), out]
  return graph('esp8266:esp8266:d1_mini', nodes, [['clock', 'second', 'seconds', 'value'],
    ['seconds', 'result', 'out', 'brightness'], ['fill', 'frame', 'out', 'frame']])
})()

// ── Patterns, fields and simulations ───────────────────────────────────────
normal['code-ab'] = graph(CLASSIC, [classicBoard(), node('hue', 'Constant', { value: 0.6 }), node('level', 'Constant', { value: 0.8 }),
  node('code', 'Code', { code: 'fill_solid(leds, NUM_LEDS, CHSV((uint8_t)(a * 255), 255, (uint8_t)(b * 255)));' }), matrix()],
[['hue', 'value', 'code', 'a'], ['level', 'value', 'code', 'b'], ['code', 'frame', 'out', 'frame']])
normal['saturation-keep-brightness'] = effect('Saturation', { amount: 0.4, keepBrightness: true })
for (const motion of ['swirl', 'ripple', 'turbulence']) normal[`frame-warp-${motion}`] = effect('FrameWarp', { motion, motionSpeed: 0.6 })
normal['trail-confetti'] = frame('Confetti', { trail: 0.8 })
normal['trail-trails'] = effect('Trails', { decay: 0.05 })
normal['trail-game-of-life'] = frame('GameOfLife', { trail: 0.7 })
normal['color-trails-linked'] = frame('ColorTrails', { independentAxes: false, trailLength: 4 })
normal['color-trails-independent'] = frame('ColorTrails', { independentAxes: true, xSpeed: 0.3, ySpeed: 0.05, trailLength: 30 })
normal['plasma-scale'] = frame('Plasma', { plasmaStyle: 'classic', scale: 0.9 })
normal['plasma-sine-grid'] = frame('Plasma', { plasmaStyle: 'sineGrid' })
normal['plasma-sine-2d'] = frame('Plasma', { plasmaStyle: 'sine2d' })
normal['noise-contrast'] = frame('Noise', { noiseType: 'fbm', contrast: 2.5 })
normal['noise-plasma-lava'] = frame('Noise', { noiseType: 'plasma', palette: 'lava' })
normal['frame-transform-smooth'] = effect('FrameTransform', { mode: 'smooth', rotateRate: 20, scale: 1.3 })
normal['frame-transform-exact-rate'] = effect('FrameTransform', { mode: 'exact', rotateRate: 90, offsetXRate: 0.2, edgeMode: 'wrap' })
normal['shape-field-rose-spin'] = field('ShapeField', { shape: 'rose', petals: 7, spin: 30, fieldMode: 'distance' })
normal['shape-field-superformula'] = field('ShapeField', { shape: 'superformula', symmetry: 5, n1: 0.4, n2: 1.2, n3: 0.9 })
normal['mirror-radial-turned'] = effect('Mirror', { mirrorMode: 'radial', segments: 8, rotation: 30, spin: 20 })
normal['mirror-radial-rotation-only'] = effect('Mirror', { mirrorMode: 'radial', segments: 5, rotation: 45, spin: 0 })
normal['mirror-radial-strip'] = effect('Mirror', { mirrorMode: 'radial', segments: 6, spin: 10 }, strip())
normal['switch-literal'] = reading(node('pick', 'Switch', { a: 0.2, b: 0.9, select: true }), 'result')
for (const particleType of ['luminova', 'comet', 'fireworks', 'chase', 'waterfall']) {
  normal[`particles-${particleType}`] = frame('Particles', { particleType })
}
for (const mode of ['drift', 'meteors']) {
  normal[`string-particles-ring-${mode}`] = frame('StringParticles', { track: 'ring', mode, ringLeds: 60 },
    node('out', 'MatrixOutput', { form: 'ring', ledCount: 60, dataPin: 5 }))
}
for (const [name, formulaType] of [['logistic', 'logisticMap'], ['attractor', 'attractor'], ['lissajous', 'lissajousPath'], ['rose', 'rosePath']]) {
  normal[`formula-points-${name}`] = frame('FormulaPoints', { formulaType })
}
for (const [name, fireStyle] of [['classic', 'classic'], ['smoke', 'smoke'], ['2012', 'fire2012']]) normal[`fire-${name}`] = frame('Fire', { fireStyle })
normal['boids-density'] = frame('Boids', { colorMode: 'density' })
normal['reaction-diffusion'] = frame('ReactionDiffusion', {})

// ── Text, layout and output ────────────────────────────────────────────────
normal['text-base'] = graph(CLASSIC, [classicBoard(), node('bg', 'Plasma'), node('text', 'Text', { text: 'BASE', scroll: 0.4 }), matrix({ width: 32 })],
  [['bg', 'frame', 'text', 'base'], ['text', 'frame', 'out', 'frame']])
normal['path-speed'] = frame('Path', { pathShape: 'lissajous', speed: 1.5 })
normal['pixels-text-clock-line'] = graph(CLASSIC, [classicBoard(), node('rtc', 'RTCInput', { timeSource: 'Compile Time' }),
  node('line', 'Line', { units: 'normalized', x1: 0, y1: 0, x2: 1, y2: 1 }),
  node('text', 'Text', { text: 'PX', units: 'pixels', x: 20, y: 4 }),
  node('clock', 'ClockDisplay', { displayMode: 'Analog', units: 'pixels', x: 8, y: 8, radius: 6, scaleWithMatrix: false }),
  matrix({ width: 32 })],
[['line', 'frame', 'text', 'base'], ['text', 'frame', 'clock', 'base'], ['rtc', 'dateTime', 'clock', 'dateTime'], ['clock', 'frame', 'out', 'frame']])
for (const font of ['3x5', '4x6', '5x8', '6x8']) {
  normal[`font-${font}`] = graph(CLASSIC, [classicBoard(), node('rtc', 'RTCInput', { timeSource: 'Compile Time' }),
    node('text', 'Text', { text: 'Font 0-9', font, y: 0.25, scroll: 0.3 }),
    node('clock', 'ClockDisplay', { displayMode: 'Digital HH:MM:SS', font, y: 0.75 }), matrix({ width: 48, height: 24 })],
  [['text', 'frame', 'clock', 'base'], ['rtc', 'dateTime', 'clock', 'dateTime'], ['clock', 'frame', 'out', 'frame']])
}
normal['hub75-size-2'] = graph(CLASSIC, [classicBoard(), node('rtc', 'RTCInput', { timeSource: 'Compile Time' }),
  node('text', 'Text', { text: 'BIG', size: 2, y: 0.25 }), node('clock', 'ClockDisplay', { displayMode: 'Digital HH:MM', size: 2, y: 0.75 }),
  node('out', 'MatrixOutput', { form: 'hub75', width: 64, height: 32 })],
[['text', 'frame', 'clock', 'base'], ['rtc', 'dateTime', 'clock', 'dateTime'], ['clock', 'frame', 'out', 'frame']])

// A 60x1 strip: centring and long-side sizing, and the flat path row.
const onStrip: Record<string, () => Graph> = {
  geometry: () => field('GeometryField', {}, strip()),
  'formula-r': () => field('FieldFormula', { formula: 'sin8(r*200 + t*60)/255' }, strip()),
  'shape-field': () => field('ShapeField', { shape: 'ellipse', fieldMode: 'falloff' }, strip()),
  path: () => frame('Path', { pathShape: 'circle' }, strip()),
  fourier: () => frame('FourierEpicycles', { maxHarmonics: 8, harmonics: 8 }, strip()),
}
for (const [name, build] of Object.entries(onStrip)) {
  normal[`strip-${name}`] = build()
  // The same graph with no Board, for an Uno: every core declares `min` and `max` its own way.
  const avr = build()
  normal[`strip-${name}-avr`] = { fqbn: UNO, nodes: avr.nodes.filter((entry) => entry.data.nodeType !== 'Board'), edges: avr.edges }
}

normal['start-corner-bottom-right-vertical'] = frame('Rainbow', {}, matrix({ startCorner: 'bottom-right', firstRun: 'vertical', serpentine: true }))
normal['start-corner-top-right-rows'] = frame('Rainbow', {}, matrix({ startCorner: 'top-right', firstRun: 'horizontal', serpentine: false }))
normal['start-corner-bottom-left-tiled'] = frame('Rainbow', {}, matrix({
  width: 8, height: 8, layout: 'panels', tilesX: 2, tilesY: 1, startCorner: 'bottom-left', firstRun: 'vertical',
}))

normal['gamma-single'] = frame('Plasma', {}, matrix({ outputGamma: 2.2 }))
normal['gamma-two-outputs'] = (() => {
  const nodes = [classicBoard(), node('n', 'Plasma'), matrix({ outputGamma: 2.2 }),
    node('second', 'MatrixOutput', { form: 'strip', ledCount: 30, dataPin: 18, outputGamma: 2.8 })]
  return graph(CLASSIC, nodes, [['n', 'frame', 'out', 'frame'], ['n', 'frame', 'second', 'frame']])
})()
normal['gamma-ring'] = frame('Plasma', {}, node('out', 'MatrixOutput', { form: 'ring', ledCount: 24, dataPin: 5, outputGamma: 2.4 }))

// ── Bundled patterns the pass names, as normal sketches ────────────────────
// The player collections compile every bundled pattern; this builds the ones
// whose changed code the pass names through the normal sketch's emitter too.
// A pattern's audio Group Input becomes an Audio node on a microphone; its
// other role inputs fall away, so those settings read their saved values.
function bundled(name: string): Graph {
  const saved = BUNDLED_PATTERNS.find((entry) => entry.name === name)
  if (!saved) throw new Error(`no bundled pattern named ${name}`)
  const nodes: StudioNode[] = [classicBoard()]
  const audioInputs = new Set<string>()
  const dropped = new Set<string>()
  for (const entry of saved.subgraph.nodes) {
    const type = entry.data.nodeType
    if (type === 'GroupOutput') {
      nodes.push({ ...matrix(), id: entry.id })
    } else if (type === 'GroupInput') {
      const isAudio = entry.data.outputs?.some((port) => port.dataType === 'audio')
      if (isAudio) audioInputs.add(entry.id)
      else dropped.add(entry.id)
    } else if (type !== 'Comment') {
      nodes.push({ ...node(entry.id, type, entry.data.properties as Record<string, unknown>), data: {
        ...node(entry.id, type, entry.data.properties as Record<string, unknown>).data,
        ...(entry.data.exposedInputs ? { exposedInputs: entry.data.exposedInputs } : {}),
      } } as StudioNode)
    }
  }
  if (audioInputs.size) nodes.push(...classicMic())
  const edges = saved.subgraph.edges
    .filter((entry) => !dropped.has(entry.source))
    .map((entry) => (audioInputs.has(entry.source)
      ? { ...entry, source: 'audio', sourceHandle: 'audio' }
      : entry) as StudioEdge)
  return { fqbn: CLASSIC, nodes, edges }
}
const BUNDLED = [
  'Psydance', 'Laser Monsoon Parade', 'Lissajous Lattice', 'Golden Ratio Cathedral', 'Prism Fracture', 'Chromasonic Vortex',
  'Bass Cathedral Collapse', 'Chromatic Orbit Reactor', 'Beat Temple',
]
for (const name of BUNDLED) normal[`bundled-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`] = bundled(name)

// ── Shows and players ──────────────────────────────────────────────────────
const single = (inner: StudioNode[], wires: Wire[]) => {
  const nodes = [...inner, node('go', 'GroupOutput')]
  return { nodes, edges: wires.map((entry) => wire(nodes, ...entry)) }
}
const groups = {
  plasma: single([node('n', 'Plasma')], [['n', 'frame', 'go', 'frame']]),
  noise: single([node('n', 'Noise')], [['n', 'frame', 'go', 'frame']]),
} as unknown as GroupRegistry

function checked(name: string, { fqbn, nodes, edges }: Graph, registry: GroupRegistry = {}): void {
  const errors = [
    ...findPinConflicts(nodes, edges),
    ...findDeployBlockingErrors(nodes, edges, fqbn, undefined, registry),
    ...findBoardPinCompatibility(nodes, fqbn).errors,
    ...findExactBoardPinIssues(nodes).errors,
  ]
  if (errors.length > 0) throw new Error(`${name}: the deploy gate refuses it: ${[...new Set(errors)].join('; ')}`)
}

const fixtures: Record<string, Fixture> = {}
for (const [name, entry] of Object.entries(normal)) {
  checked(name, entry)
  fixtures[name] = { fqbn: entry.fqbn, source: generateCpp(entry.nodes, entry.edges) }
}

// Output Gamma in a slideshow and in the SD player.
const gammaShow = graph(CLASSIC, [classicBoard(), node('collection', 'PatternCollection', { patternIds: ['plasma', 'noise'] }),
  node('show', 'PatternSlideshow'), matrix({ outputGamma: 2.2 })],
[['collection', 'patternset', 'show', 'patternset'], ['show', 'frame', 'out', 'frame']])
checked('gamma-show', gammaShow, groups)
fixtures['gamma-show'] = { fqbn: CLASSIC, source: generateShowSketch(gammaShow.nodes, gammaShow.edges, groups) }

const gammaPlayer = graph(S3, [s3Board(), node('sd', 'SDCard', { sdMisoPin: 13, sdMosiPin: 11, sdSckPin: 12, sdCsPin: 10 }),
  node('amp', 'Amplifier', { model: 'MAX98357A', i2sLrc: 18, i2sBclk: 17, i2sDout: 16 }), node('master', 'PatternMaster'),
  node('collection', 'PatternCollection', { patternIds: ['plasma', 'noise'] }), matrix({ outputGamma: 2.2 })],
[['collection', 'patternset', 'master', 'patternset'], ['master', 'frame', 'out', 'frame']])
checked('gamma-player', gammaPlayer, groups)
fixtures['gamma-player'] = { fqbn: S3, source: buildShowPlayer(gammaPlayer.nodes, gammaPlayer.edges, groups, {
  patternSet: ['plasma', 'noise'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
}) }
// The Music Player's Seed: a fixed seed in place of the boot entropy.
const seededNodes = gammaPlayer.nodes.map((entry) => (entry.id === 'master'
  ? { ...entry, data: { ...entry.data, properties: { ...entry.data.properties, seed: 7 } } } as StudioNode : entry))
fixtures['player-seed'] = { fqbn: S3, source: buildShowPlayer(seededNodes, gammaPlayer.edges, groups, {
  patternSet: ['plasma', 'noise'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
}) }

// A slideshow pattern whose Audio Cascade reads the show's audio through the
// group's own input, with a microphone on the board.
const cascadeGroups = (() => {
  const input = node('audio', 'Audio')
  const audioIn = { ...input, data: { ...input.data, nodeType: 'GroupInput', label: 'Audio', category: 'composite',
    properties: { paramId: 'audio' }, inputs: [], outputs: [{ id: 'out', label: 'Audio', dataType: 'audio' }] } } as StudioNode
  const nodes = [audioIn, node('cascade', 'AudioCascade'), node('go', 'GroupOutput')]
  return { ...groups, cascade: { nodes, edges: [wire(nodes, 'audio', 'out', 'cascade', 'audio'), wire(nodes, 'cascade', 'frame', 'go', 'frame')] } } as unknown as GroupRegistry
})()
const cascadeShow = graph(CLASSIC, [classicBoard(), ...classicMic(),
  node('collection', 'PatternCollection', { patternIds: ['cascade', 'plasma'] }),
  node('show', 'PatternSlideshow', { audioReactive: true }), matrix()],
[['audio', 'audio', 'show', 'audio'], ['collection', 'patternset', 'show', 'patternset'], ['show', 'frame', 'out', 'frame']])
checked('slideshow-audio-cascade', cascadeShow, cascadeGroups)
fixtures['slideshow-audio-cascade'] = { fqbn: CLASSIC, source: generateShowSketch(cascadeShow.nodes, cascadeShow.edges, cascadeGroups) }

// The two Music Player starters as the app builds them for an ESP32-S3, each
// with the twenty starter show patterns in its collection.
const S3_N16R8 = 'esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB'
for (const id of ['generative-show', 'player-transport']) {
  const starter = STARTER_TEMPLATES.find((entry) => entry.id === id)
  if (!starter) throw new Error(`no starter ${id}`)
  const patterns = starterShowPatterns()
  const ids = patterns.map((pattern) => pattern.id)
  const built = buildBoardAwareStarter(starter, [node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', usePsram: true })], S3_N16R8)
  const nodes = built.nodes.filter((entry) => entry.data.nodeType !== 'Comment').map((entry) => (entry.data.nodeType === 'PatternCollection'
    ? { ...entry, data: { ...entry.data, properties: { ...entry.data.properties, patternIds: ids } } } as StudioNode
    : entry))
  const live = new Set(nodes.map((entry) => entry.id))
  const edges = built.edges.filter((entry) => live.has(entry.source) && live.has(entry.target))
  const registry = Object.fromEntries(patterns.map((pattern) => [pattern.id, pattern.subgraph])) as unknown as GroupRegistry
  checked(`starter-${id}`, { fqbn: S3_N16R8, nodes, edges }, registry)
  fixtures[`starter-${id}`] = { fqbn: S3_N16R8, source: buildShowPlayer(nodes, edges, registry, {
    patternSet: ids, bakedAudio: false, genericPlayer: true, preferredTrack: '',
  }) }
}

// What each named change must leave in its sketch.
const required: Record<string, string[]> = {
  'midi-din-pair': ['Serial'],
  'dmx-beside-radar': ['_dmxBegin('],
  'dmx-beside-dfplayer': ['_dmxBegin('],
  'mirror-radial-strip': ['#define HEIGHT   1'],
  'hub75-size-2': ['MatrixPanel_I2S_DMA'],
  'demo-drums-kick-shock': ['_ksDemoKick'],
  'demo-drums-percussion-blobs': ['_pbDemoKick'],
  'clock-zone-esp8266': ['configTime('],
  'player-seed': ['randomSeed(7u);'],
  'audio-features-level': ['float _audioLoudness = 0.0f;'],
}
for (const [name, symbols] of Object.entries(required)) {
  const missing = symbols.filter((symbol) => !fixtures[name].source.includes(symbol))
  if (missing.length) throw new Error(`${name}: missing ${missing.join(', ')}`)
}

const outputDir = resolve(process.argv[2] ?? 'artifacts/v1-variants-compile')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { fqbn: string; bytes: number; sha256: string }> = {}
for (const [name, { fqbn, source }] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { fqbn, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} v1 variant compile fixtures to ${outputDir}`)
