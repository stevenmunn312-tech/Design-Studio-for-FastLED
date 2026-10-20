/**
 * The sketches the dead-code gate reads: a normal sketch for every node's live
 * example, and variants of the Music Player, the SD performance player and the
 * slideshow chosen for what each can leave behind. The corpus test checks them
 * for dead code; `npm run gen:compile-fixtures -- dead-code` writes the same
 * set for the compile matrix.
 */
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { liveExampleForNode } from '../../components/HelpModal/liveExamples'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, hidden = false): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 }, ...(hidden ? { hidden: true } : {}),
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: definition ? resolveDefaultProperties(nodeType, { ...libraryDefaults(nodeType), ...properties }) : properties,
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

/** One normal sketch per distinct live example, keyed by node type. */
function normalSketches(): Record<string, string> {
  const sketches: Record<string, string> = {}
  const seen = new Set<string>()
  for (const definition of NODE_LIBRARY) {
    const example = liveExampleForNode(definition)
    const key = JSON.stringify([example.nodes.map((entry) => [entry.type, entry.properties]), example.edges])
    if (seen.has(key)) continue
    seen.add(key)
    const nodes: StudioNode[] = []
    const providers = new Map<string, string>()
    for (const entry of example.nodes) {
      const provider = entry.sourceProvider
      if (provider && !providers.has(provider.type)) {
        providers.set(provider.type, `hw-${provider.type}`)
        nodes.push(node(`hw-${provider.type}`, provider.type, provider.properties, true))
      }
    }
    for (const entry of example.nodes) {
      const providerId = entry.sourceProvider ? providers.get(entry.sourceProvider.type) : undefined
      nodes.push(node(entry.key, entry.type, { ...entry.properties, ...(providerId ? { sourceId: providerId } : {}) }))
    }
    sketches[`normal-${definition.type}`] = generateCpp(nodes, example.edges.map((entry, n) => ({ id: `e${n}`, ...entry })) as StudioEdge[])
  }
  return sketches
}

const group = (inner: StudioNode[], edges: StudioEdge[]) => ({ nodes: [...inner, node('go', 'GroupOutput')], edges })
const single = (type: string, properties: Record<string, unknown> = {}) =>
  group([node('n', type, properties)], [edge('e', 'n', 'frame', 'go', 'frame')])
// A show role's group input, which "Use group inputs" feeds from the music.
const roleInput = (role: string, dataType: string) => {
  const input = node(role, 'GroupInput', { paramId: role })
  return { ...input, data: { ...input.data, category: 'composite', outputs: [{ id: 'out', label: role, dataType }] } } as StudioNode
}

const PATTERNS = {
  solid: single('SolidColor', { r: 20, g: 30, b: 40 }),
  plasma: single('Plasma'),
  rainbow: single('Rainbow'),
  noise: single('Noise'),
  warp: group([node('nz', 'Noise'), node('fx', 'FrameWarp', { edgeMode: 'wrap', sampling: 'bilinear' })],
    [edge('a', 'nz', 'frame', 'fx', 'frame'), edge('b', 'fx', 'frame', 'go', 'frame')]),
  symmetry: group([node('nz', 'Noise'), node('fx', 'Symmetry', { group: 'p6m' })],
    [edge('a', 'nz', 'frame', 'fx', 'frame'), edge('b', 'fx', 'frame', 'go', 'frame')]),
  shape: single('Shape', { shape: 'polygon' }),
  reactive: group([node('au', 'Audio', { sourceId: 'decoder:sd' }), node('fft', 'FFTAnalyzer'), node('sc', 'SolidColor', { b: 60 })],
    [edge('a1', 'au', 'audio', 'fft', 'audio'), edge('a2', 'fft', 'bass', 'sc', 'r'), edge('eg', 'sc', 'frame', 'go', 'frame')]),
  roles: group([
    roleInput('speed', 'float'), roleInput('palette', 'palette'), roleInput('energy', 'float'), node('pl', 'Plasma'), node('bm', 'BrightnessMod'),
  ], [
    edge('rs', 'speed', 'out', 'pl', 'speed'), edge('rp', 'palette', 'out', 'pl', 'paletteIn'), edge('pf', 'pl', 'frame', 'bm', 'frame'),
    edge('re', 'energy', 'out', 'bm', 'brightness'), edge('bf', 'bm', 'frame', 'go', 'frame'),
  ]),
} as const
type PatternName = keyof typeof PATTERNS
const registry = (names: PatternName[]) => Object.fromEntries(names.map((name) => [name, PATTERNS[name]])) as unknown as GroupRegistry

const matrix = (dataPin: number) => node('out', 'MatrixOutput', { width: 8, height: 8, dataPin, chipset: 'WS2812B', colorOrder: 'GRB' })

function musicPlayer(names: PatternName[], extra: { nodes?: StudioNode[]; edges?: StudioEdge[]; master?: Record<string, unknown>; noOutput?: boolean } = {}) {
  const nodes = [
    node('sd', 'SDCard'), node('amp', 'Amplifier'), node('master', 'PatternMaster', extra.master ?? {}),
    ...(extra.noOutput ? [] : [matrix(4)]),
    ...(names.length ? [node('collection', 'PatternCollection', { patternIds: names })] : []),
    ...(extra.nodes ?? []),
  ]
  const edges = [
    ...(extra.noOutput ? [] : [edge('frame', 'master', 'frame', 'out', 'frame')]),
    ...(names.length ? [edge('set', 'collection', 'patternset', 'master', 'patternset')] : []),
    ...(extra.edges ?? []),
  ]
  return buildShowPlayer(nodes, edges, registry(names), { patternSet: names, bakedAudio: false, preferredTrack: '', genericPlayer: true })
}

function performance(names: PatternName[], properties: Record<string, unknown> = {}, extra: StudioNode[] = [], extraEdges: StudioEdge[] = []) {
  const nodes = [
    node('library', 'MusicLibrary'), ...(names.length ? [node('collection', 'PatternCollection', { patternIds: names })] : []),
    node('perf', 'PerformanceGenerator', properties), matrix(4), node('sd', 'SDCard'), node('amp', 'Amplifier'), ...extra,
  ]
  const edges = [
    edge('music', 'library', 'music', 'perf', 'music'),
    ...(names.length ? [edge('set', 'collection', 'patternset', 'perf', 'patternset')] : []),
    edge('frame', 'perf', 'frame', 'out', 'frame'), ...extraEdges,
  ]
  return buildShowPlayer(nodes, edges, registry(names), { patternSet: names, bakedAudio: false, preferredTrack: '', genericPlayer: false })
}

function slideshow(names: PatternName[], properties: Record<string, unknown> = {}, transitions?: string[]) {
  const nodes = [
    node('collection', 'PatternCollection', { patternIds: names }),
    node('show', 'PatternSlideshow', { interval: 8, transitionSec: 1, ...properties }),
    node('out', 'MatrixOutput', { width: 16, height: 16, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
    ...(transitions ? [node('pool', 'TransitionSet', { transitions })] : []),
  ]
  const edges = [
    edge('set', 'collection', 'patternset', 'show', 'patternset'), edge('frame', 'show', 'frame', 'out', 'frame'),
    ...(transitions ? [edge('pool', 'pool', 'transitions', 'show', 'transitions')] : []),
  ]
  return generateShowSketch(nodes, edges, registry(names))
}

function showSketches(): Record<string, string> {
  return {
    'music-one-pattern': musicPlayer(['solid']),
    'music-three-patterns': musicPlayer(['solid', 'plasma', 'rainbow']),
    'music-particles': musicPlayer(['solid', 'plasma', 'rainbow'], {
      nodes: [node('particles', 'PlayerParticles', { style: 3 })],
      edges: [edge('fx', 'particles', 'particleFx', 'master', 'particleFx')],
    }),
    'music-beat-transitions': musicPlayer(['solid', 'plasma', 'rainbow'], { master: { beatTransitions: true } }),
    'music-paced': musicPlayer(['solid', 'plasma', 'rainbow'], {
      master: { beatTransitions: true, energyPacing: true, dwellsAndBursts: true },
    }),
    'music-no-patterns': musicPlayer([]),
    'music-vu-only': musicPlayer([], {
      noOutput: true,
      nodes: [node('audio', 'Audio', { sourceId: 'decoder' }), node('vu', 'StereoVuMeter', {
        targetOutputId: '', ledCount: 24, leftDataPin: 5, rightDataPin: 6, chipset: 'WS2812B', colorOrder: 'GRB',
      })],
      edges: [edge('vu', 'audio', 'audio', 'vu', 'audio')],
    }),
    // `roles` reads every role, so all three reach the sketch, and a transition
    // keeps the outgoing pattern's.
    'performance-collection': performance(['roles', 'plasma'], { useGroupInputs: true }),
    'performance-no-group-inputs': performance(['solid', 'plasma']),
    // No collection: the built-in show patterns, which take speed and palette.
    'performance-builtin': performance([]),
    // One pattern never changes, so no show can composite a transition.
    'performance-one-pattern': performance(['solid']),
    'performance-audio-controls': performance(['reactive', 'warp'], { useGroupInputs: true }, [
      node('pool', 'TransitionSet', { transitions: ['iris', 'cube'] }),
      node('button', 'ButtonInput', { pin: 12, pullup: true }), node('controls', 'ControlMap', { controls: ['playPause'] }),
    ], [
      edge('pool', 'pool', 'transitions', 'perf', 'transitions'),
      edge('press', 'button', 'pressed', 'controls', 'playPause'), edge('controls', 'controls', 'controls', 'perf', 'controls'),
    ]),
    'slideshow-one-solid': slideshow(['solid']),
    'slideshow-one-warp': slideshow(['warp']),
    'slideshow-cut': slideshow(['solid', 'noise'], { transitionSec: 0 }),
    'slideshow-sequential': slideshow(['solid', 'noise'], { order: 'Sequential' }),
    'slideshow-mixed': slideshow(['warp', 'symmetry', 'shape'], {}, ['wipe', 'iris']),
    'slideshow-3d-pool': slideshow(['solid', 'noise'], {}, ['cube', 'dolly']),
    // Telemetry on: the timed send and the render/send report in each generator.
    'telemetry-normal': generateCpp([telemetryBoard(), matrix(4), node('fill', 'Plasma')], [edge('f', 'fill', 'frame', 'out', 'frame')]),
    'telemetry-slideshow': generateShowSketch(
      [telemetryBoard(), node('collection', 'PatternCollection', { patternIds: ['solid', 'noise'] }), node('show', 'PatternSlideshow'), matrix(4)],
      [edge('set', 'collection', 'patternset', 'show', 'patternset'), edge('frame', 'show', 'frame', 'out', 'frame')],
      registry(['solid', 'noise']),
    ),
    'telemetry-music': musicPlayer(['solid', 'plasma'], { nodes: [telemetryBoard()] }),
    // Frame-invariant chains drawn on the first frame only (frameInvariance.ts):
    // one output, two native passes, and with telemetry timing the blocks.
    'frozen-normal': frozenChain([matrix(4)]),
    'frozen-two-outputs': frozenChain([matrix(4), node('out2', 'MatrixOutput', { width: 16, height: 1, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' })]),
    'frozen-telemetry': frozenChain([matrix(4), telemetryBoard()]),
  }
}

/** A still field and a fold of a still gradient, composited onto every LED output given. */
function frozenChain(extra: StudioNode[]): string {
  const nodes = [
    node('fx', 'FieldFormula', { formula: 'sqrt(x * x + y * y) / W' }), node('ff', 'FieldToFrame'),
    node('g', 'GradientFrame'), node('k', 'Kaleidoscope'), node('bl', 'Blend'), ...extra,
  ]
  const outputs = extra.filter((entry) => entry.data.nodeType === 'MatrixOutput')
  return generateCpp(nodes, [
    edge('a', 'fx', 'field', 'ff', 'field'), edge('b', 'g', 'frame', 'k', 'frame'),
    edge('c', 'ff', 'frame', 'bl', 'a'), edge('d', 'k', 'frame', 'bl', 'b'),
    ...outputs.map((output) => edge(`o-${output.id}`, 'bl', 'frame', output.id, 'frame')),
  ])
}

function telemetryBoard(): StudioNode {
  return node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', reportTelemetry: true })
}

/** Every corpus sketch by name. Names are file stems: letters, digits, dashes. */
export function deadCodeCorpus(): Record<string, string> {
  return { ...normalSketches(), ...showSketches() }
}
