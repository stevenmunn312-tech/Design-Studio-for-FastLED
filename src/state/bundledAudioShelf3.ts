import type { StudioEdge, StudioNode } from './graphStore'
import type { SavedPattern } from './patternLibrary'
import { NODE_LIBRARY } from './nodeLibrary'

type BundledSeed = Omit<SavedPattern, 'id' | 'createdAt' | 'categoryId' | 'bundled'>
type Port = BundledSeed['outputs'][number]

const FRAME_OUTPUT: Port[] = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
const AUDIO_INPUT: Port[] = [{ id: 'param0', label: 'Audio', dataType: 'audio' }]
const NODE_DEFS = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))

function clonePorts(ports: { id: string; label: string; dataType: string }[]) {
  return ports.map((port) => ({ ...port }))
}

function studioNode(
  id: string,
  nodeType: string,
  x: number,
  y: number,
  properties: Record<string, unknown> = {},
): StudioNode {
  const definition = NODE_DEFS.get(nodeType)
  if (!definition) throw new Error(`Unknown bundled pattern node type: ${nodeType}`)
  return {
    id,
    type: 'studioNode',
    position: { x, y },
    data: {
      label: definition.label,
      nodeType: definition.type,
      category: definition.category,
      properties: { ...(definition.defaultProperties ?? {}), ...properties },
      inputs: clonePorts(definition.inputs),
      outputs: clonePorts(definition.outputs),
    },
  } as StudioNode
}

function groupOutput(id: string, x: number, y: number): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x, y },
    data: {
      label: 'Group Output',
      nodeType: 'GroupOutput',
      category: 'output',
      properties: {},
      inputs: clonePorts(FRAME_OUTPUT),
      outputs: [],
    },
  } as StudioNode
}

function audioIn(x = -1200, y = 40): StudioNode {
  return {
    id: 'audio',
    type: 'studioNode',
    position: { x, y },
    data: {
      label: 'Audio',
      nodeType: 'GroupInput',
      category: 'composite',
      properties: { paramId: 'param0' },
      inputs: [],
      outputs: [{ id: 'out', label: 'Audio', dataType: 'audio' }],
    },
  } as StudioNode
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): StudioEdge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'glowEdge',
    reconnectable: 'target',
  } as StudioEdge
}

function audioPattern(name: string, nodes: StudioNode[], edges: StudioEdge[]): BundledSeed {
  return {
    name,
    inputs: clonePorts(AUDIO_INPUT),
    outputs: clonePorts(FRAME_OUTPUT),
    subgraph: { nodes, edges },
  }
}

const fft = (y = -160) => studioNode('fft', 'FFTAnalyzer', -1200, y, {
  bands: 24, gain: 1.2, smoothing: 0.82, tilt: 0.08,
})
const beat = (y = 200) => studioNode('beat', 'BeatDetect', -1200, y, {
  threshold: 0.22, attack: 0.55, decay: 0.3,
})
const perc = (y = 360) => studioNode('perc', 'PercussionDetect', -1200, y, {
  sensitivity: 0.64, decay: 0.76, separation: 0.5,
})
const feat = (y = 520) => studioNode('feat', 'AudioFeatures', -1200, y, {
  sensitivity: 0.55, gate: 0.1, smoothing: 0.82,
})
const listen = [
  edge('in-fft', 'audio', 'out', 'fft', 'audio'),
  edge('in-beat', 'audio', 'out', 'beat', 'audio'),
  edge('in-perc', 'audio', 'out', 'perc', 'audio'),
  edge('in-feat', 'audio', 'out', 'feat', 'audio'),
]

/**
 * Shelf three — ten new audio-reactive library patterns.
 *
 * Each one is built around a visual engine the first two shelves barely used
 * (or never used) as the star of the graph, so they do not read as remixes of
 * Spectrum Visualizer + Beat Flash. Kick, snare, hi-hat, bass and energy are
 * wired into the thing that actually moves, not only into a flash overlay.
 */
export const AUDIO_SHELF_THREE_SEEDS: BundledSeed[] = [
  audioPattern(
    'Juggle After Dark',
    [
      audioIn(), fft(), beat(), feat(),
      studioNode('pal', 'Poline', -880, -200, {
        anchorA: '#140816', anchorB: '#ff5a1f', anchorC: '#ffd36a', points: 6,
      }),
      studioNode('hue', 'AudioHue', -880, 40, { bassWeight: 0.5, midsWeight: 0.3, trebleWeight: 0.2 }),
      studioNode('count', 'MapRange', -880, 220, { inMin: 0.05, inMax: 0.95, outMin: 3, outMax: 8 }),
      studioNode('shift', 'MapRange', -880, 380, { inMin: 0, inMax: 360, outMin: 0, outMax: 1 }),
      studioNode('juggle', 'Juggle', -520, 40, { speed: 0.55, fade: 0.18, palette: 'lava', seed: 19 }),
      studioNode('trails', 'Trails', -220, 40, { decay: 0.11 }),
      studioNode('flash', 'BeatFlash', 80, 40, {
        attack: 0.1, decay: 0.9, intensity: 1.15, blendMode: 'screen', preserveBase: true,
        palette: 'lava', r: 255, g: 210, b: 120,
      }),
      studioNode('tint', 'HueShift', 360, 40),
      studioNode('boost', 'ColorBoost', 640, 40, { boost: 0.42 }),
      groupOutput('out', 920, 40),
    ],
    [
      ...listen.filter((item) => item.id !== 'in-perc'),
      edge('e-pal', 'pal', 'palette', 'juggle', 'paletteIn'),
      edge('e-bass', 'fft', 'bass', 'count', 'value'),
      edge('e-count', 'count', 'result', 'juggle', 'count'),
      edge('e-spd', 'feat', 'energy', 'juggle', 'speed'),
      edge('e-j', 'juggle', 'frame', 'trails', 'frame'),
      edge('e-t', 'trails', 'frame', 'flash', 'frame'),
      edge('e-b', 'beat', 'beat', 'flash', 'beat'),
      edge('e-hb', 'fft', 'bass', 'hue', 'bass'),
      edge('e-hm', 'fft', 'mids', 'hue', 'mids'),
      edge('e-ht', 'fft', 'treble', 'hue', 'treble'),
      edge('e-hs', 'hue', 'hue', 'shift', 'value'),
      edge('e-f', 'flash', 'frame', 'tint', 'frame'),
      edge('e-sh', 'shift', 'result', 'tint', 'shift'),
      edge('e-c', 'tint', 'frame', 'boost', 'frame'),
      edge('e-o', 'boost', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Confetti Cannonade',
    [
      audioIn(), fft(), beat(), perc(), feat(),
      studioNode('pal', 'Poline', -880, -180, {
        anchorA: '#1a0730', anchorB: '#ff2f86', anchorC: '#ffe36b', points: 7,
      }),
      studioNode('rate', 'Math', -880, 80, { mathOp: 'add', b: 0.22 }),
      studioNode('gate', 'Compare', -880, 260, { b: 0.28 }),
      studioNode('confetti', 'Confetti', -520, -40, {
        speed: 0.5, density: 0.62, fade: 0.22, palette: 'party', seed: 41,
      }),
      studioNode('sparks', 'TrebleSparks', -520, 220, { density: 0.7, palette: 'citrus' }),
      studioNode('mix', 'Blend', -180, 80, { blendMode: 'screen', amount: 0.48 }),
      studioNode('flash', 'BeatFlash', 140, 80, {
        attack: 0.08, decay: 0.9, intensity: 1.35, blendMode: 'add', preserveBase: true,
        palette: 'party', r: 255, g: 255, b: 255,
      }),
      studioNode('boost', 'ColorBoost', 420, 80, { boost: 0.55 }),
      groupOutput('out', 700, 80),
    ],
    [
      ...listen,
      edge('e-pal', 'pal', 'palette', 'confetti', 'paletteIn'),
      edge('e-sn', 'perc', 'snare', 'rate', 'a'),
      edge('e-rt', 'rate', 'result', 'confetti', 'speed'),
      edge('e-tr', 'fft', 'treble', 'sparks', 'treble'),
      edge('e-en', 'feat', 'energy', 'sparks', 'density'),
      edge('e-a', 'confetti', 'frame', 'mix', 'a'),
      edge('e-b', 'sparks', 'frame', 'mix', 'b'),
      edge('e-m', 'mix', 'frame', 'flash', 'frame'),
      edge('e-g', 'perc', 'snare', 'gate', 'a'),
      edge('e-fl', 'gate', 'result', 'flash', 'beat'),
      edge('e-c', 'flash', 'frame', 'boost', 'frame'),
      edge('e-o', 'boost', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Firefly Congregation',
    [
      audioIn(), beat(), perc(), feat(),
      studioNode('pal', 'Poline', -880, -160, {
        anchorA: '#06140c', anchorB: '#7cff6a', anchorC: '#fff4a8', points: 6,
      }),
      studioNode('rate', 'Math', -880, 80, { mathOp: 'add', b: 0.18 }),
      studioNode('kickGate', 'Compare', -880, 260, { b: 0.3 }),
      studioNode('bugs', 'Particles', -520, -20, {
        particleType: 'fireflies', rate: 0.28, decay: 0.94, palette: 'aurora',
        size: 1.35, count: 36, spread: 1, seed: 77,
      }),
      studioNode('veil', 'VocalAurora', -520, 240, { speed: 0.55, palette: 'aurora' }),
      studioNode('mix', 'Blend', -180, 80, { blendMode: 'screen', amount: 0.38 }),
      studioNode('flash', 'BeatFlash', 140, 80, {
        attack: 0.12, decay: 0.91, intensity: 1.1, blendMode: 'screen', preserveBase: true,
        palette: 'aurora', r: 210, g: 255, b: 160,
      }),
      studioNode('sat', 'Saturation', 420, 80, { amount: 1.28 }),
      groupOutput('out', 700, 80),
    ],
    [
      edge('in-beat', 'audio', 'out', 'beat', 'audio'),
      edge('in-perc', 'audio', 'out', 'perc', 'audio'),
      edge('in-feat', 'audio', 'out', 'feat', 'audio'),
      edge('e-pal', 'pal', 'palette', 'bugs', 'paletteIn'),
      edge('e-hh', 'perc', 'hihat', 'rate', 'a'),
      edge('e-rt', 'rate', 'result', 'bugs', 'rate'),
      edge('e-vc', 'feat', 'vocals', 'veil', 'vocals'),
      edge('e-en', 'feat', 'energy', 'veil', 'energy'),
      edge('e-sl', 'feat', 'silence', 'veil', 'silence'),
      edge('e-a', 'veil', 'frame', 'mix', 'a'),
      edge('e-b', 'bugs', 'frame', 'mix', 'b'),
      edge('e-m', 'mix', 'frame', 'flash', 'frame'),
      edge('e-g', 'perc', 'kick', 'kickGate', 'a'),
      edge('e-fl', 'kickGate', 'result', 'flash', 'beat'),
      edge('e-s', 'flash', 'frame', 'sat', 'frame'),
      edge('e-o', 'sat', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Spectra Mosaic Night',
    [
      audioIn(), fft(), beat(), feat(),
      studioNode('pal', 'Poline', -880, -180, {
        anchorA: '#050b18', anchorB: '#2f7bff', anchorC: '#7cffef', points: 6,
      }),
      studioNode('mosaic', 'SpectraMosaic', -520, 40, {
        energy: 0.85, speed: 0.7, palette: 'peacock', tiles: 5,
      }),
      studioNode('boost', 'ColorBoost', -180, 40, { boost: 0.48 }),
      studioNode('flash', 'BeatFlash', 140, 40, {
        attack: 0.1, decay: 0.92, intensity: 1.2, blendMode: 'screen', preserveBase: true,
        palette: 'peacock', r: 120, g: 220, b: 255,
      }),
      studioNode('blur', 'Blur2D', 420, 40, { amount: 0.05 }),
      studioNode('sat', 'Saturation', 700, 40, { amount: 1.4 }),
      groupOutput('out', 980, 40),
    ],
    [
      edge('in-fft', 'audio', 'out', 'fft', 'audio'),
      edge('in-beat', 'audio', 'out', 'beat', 'audio'),
      edge('in-feat', 'audio', 'out', 'feat', 'audio'),
      edge('e-pal', 'pal', 'palette', 'mosaic', 'paletteIn'),
      edge('e-b', 'fft', 'bass', 'mosaic', 'bass'),
      edge('e-m', 'fft', 'mids', 'mosaic', 'mids'),
      edge('e-t', 'fft', 'treble', 'mosaic', 'treble'),
      edge('e-e', 'feat', 'energy', 'mosaic', 'energy'),
      edge('e-c', 'mosaic', 'frame', 'boost', 'frame'),
      edge('e-f', 'boost', 'frame', 'flash', 'frame'),
      edge('e-bt', 'beat', 'beat', 'flash', 'beat'),
      edge('e-bl', 'flash', 'frame', 'blur', 'frame'),
      edge('e-s', 'blur', 'frame', 'sat', 'frame'),
      edge('e-o', 'sat', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Midrange Bloom Cathedral',
    [
      audioIn(), fft(), beat(), feat(),
      studioNode('pal', 'Poline', -880, -180, {
        anchorA: '#160820', anchorB: '#a14bff', anchorC: '#ffc6f2', points: 6,
      }),
      studioNode('hue', 'AudioHue', -880, 160, { bassWeight: 0.2, midsWeight: 0.55, trebleWeight: 0.25 }),
      studioNode('shift', 'MapRange', -880, 340, { inMin: 0, inMax: 360, outMin: 0, outMax: 1 }),
      studioNode('bloom', 'MidrangeBloom', -520, 40, { energy: 0.85, speed: 0.62, palette: 'amethyst' }),
      studioNode('kale', 'Kaleidoscope', -220, 40, { segments: 6 }),
      studioNode('flash', 'BeatFlash', 80, 40, {
        attack: 0.11, decay: 0.9, intensity: 1.18, blendMode: 'screen', preserveBase: true,
        palette: 'amethyst', r: 255, g: 180, b: 255,
      }),
      studioNode('tint', 'HueShift', 360, 40),
      studioNode('sat', 'Saturation', 640, 40, { amount: 1.45 }),
      groupOutput('out', 920, 40),
    ],
    [
      edge('in-fft', 'audio', 'out', 'fft', 'audio'),
      edge('in-beat', 'audio', 'out', 'beat', 'audio'),
      edge('in-feat', 'audio', 'out', 'feat', 'audio'),
      edge('e-pal', 'pal', 'palette', 'bloom', 'paletteIn'),
      edge('e-md', 'fft', 'mids', 'bloom', 'mids'),
      edge('e-en', 'feat', 'energy', 'bloom', 'energy'),
      edge('e-k', 'bloom', 'frame', 'kale', 'frame'),
      edge('e-f', 'kale', 'frame', 'flash', 'frame'),
      edge('e-bt', 'beat', 'beat', 'flash', 'beat'),
      edge('e-hb', 'fft', 'bass', 'hue', 'bass'),
      edge('e-hm', 'fft', 'mids', 'hue', 'mids'),
      edge('e-ht', 'fft', 'treble', 'hue', 'treble'),
      edge('e-hs', 'hue', 'hue', 'shift', 'value'),
      edge('e-fl', 'flash', 'frame', 'tint', 'frame'),
      edge('e-sh', 'shift', 'result', 'tint', 'shift'),
      edge('e-s', 'tint', 'frame', 'sat', 'frame'),
      edge('e-o', 'sat', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Boid Thunder Flock',
    [
      audioIn(), fft(), beat(), perc(), feat(),
      studioNode('pal', 'Poline', -880, -180, {
        anchorA: '#071018', anchorB: '#1ec8ff', anchorC: '#ffe27a', points: 6,
      }),
      studioNode('pop', 'MapRange', -880, 80, { inMin: 0.08, inMax: 0.9, outMin: 18, outMax: 44 }),
      studioNode('shock', 'KickShock', -520, 240, {
        energy: 0.9, speed: 0.85, tiles: 1, palette: 'citrus',
        count: 7, decay: 0.88, thickness: 1.05, spawnSpread: 0.35, blendMode: 'add',
      }),
      studioNode('flock', 'Boids', -520, -20, {
        speed: 0.55, count: 28, separation: 0.42, alignment: 0.58, cohesion: 0.5,
        visualRange: 5, colorMode: 'palette', palette: 'citrus', seed: 204,
      }),
      studioNode('mix', 'Blend', -180, 80, { blendMode: 'add', amount: 0.42 }),
      studioNode('flash', 'BeatFlash', 140, 80, {
        attack: 0.09, decay: 0.9, intensity: 1.22, blendMode: 'screen', preserveBase: true,
        palette: 'citrus', r: 255, g: 240, b: 160,
      }),
      studioNode('boost', 'ColorBoost', 420, 80, { boost: 0.4 }),
      groupOutput('out', 700, 80),
    ],
    [
      ...listen,
      edge('e-pal', 'pal', 'palette', 'flock', 'paletteIn'),
      edge('e-en', 'feat', 'energy', 'pop', 'value'),
      edge('e-n', 'pop', 'result', 'flock', 'count'),
      edge('e-sp', 'feat', 'energy', 'flock', 'speed'),
      edge('e-k', 'perc', 'kick', 'shock', 'kick'),
      edge('e-s', 'perc', 'snare', 'shock', 'snare'),
      edge('e-h', 'perc', 'hihat', 'shock', 'hihat'),
      edge('e-se', 'feat', 'energy', 'shock', 'energy'),
      edge('e-a', 'flock', 'frame', 'mix', 'a'),
      edge('e-b', 'shock', 'frame', 'mix', 'b'),
      edge('e-m', 'mix', 'frame', 'flash', 'frame'),
      edge('e-bt', 'beat', 'beat', 'flash', 'beat'),
      edge('e-c', 'flash', 'frame', 'boost', 'frame'),
      edge('e-o', 'boost', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Radial Kick Halo',
    [
      audioIn(), fft(), beat(), perc(), feat(),
      studioNode('pal', 'Poline', -880, -180, {
        anchorA: '#1a0708', anchorB: '#ff3b1f', anchorC: '#ffd27a', points: 6,
      }),
      studioNode('rings', 'MapRange', -880, 80, { inMin: 0.05, inMax: 0.95, outMin: 5, outMax: 16 }),
      studioNode('burst', 'RadialBurst', -520, -40, { speed: 0.7, arms: 8, palette: 'volcano' }),
      studioNode('shock', 'KickShock', -520, 220, {
        energy: 0.92, speed: 0.9, tiles: 1, palette: 'volcano',
        count: 9, decay: 0.86, thickness: 1.2, spawnSpread: 0.2, blendMode: 'add',
      }),
      studioNode('mix', 'Blend', -180, 80, { blendMode: 'add', amount: 0.52 }),
      studioNode('flash', 'BeatFlash', 140, 80, {
        attack: 0.08, decay: 0.89, intensity: 1.4, blendMode: 'screen', preserveBase: true,
        palette: 'volcano', r: 255, g: 180, b: 80,
      }),
      studioNode('sat', 'Saturation', 420, 80, { amount: 1.35 }),
      groupOutput('out', 700, 80),
    ],
    [
      ...listen,
      edge('e-pal', 'pal', 'palette', 'burst', 'paletteIn'),
      edge('e-bs', 'fft', 'bass', 'rings', 'value'),
      edge('e-rg', 'rings', 'result', 'burst', 'arms'),
      edge('e-sp', 'feat', 'energy', 'burst', 'speed'),
      edge('e-k', 'perc', 'kick', 'shock', 'kick'),
      edge('e-s', 'perc', 'snare', 'shock', 'snare'),
      edge('e-h', 'perc', 'hihat', 'shock', 'hihat'),
      edge('e-se', 'feat', 'energy', 'shock', 'energy'),
      edge('e-a', 'burst', 'frame', 'mix', 'a'),
      edge('e-b', 'shock', 'frame', 'mix', 'b'),
      edge('e-m', 'mix', 'frame', 'flash', 'frame'),
      edge('e-bt', 'beat', 'beat', 'flash', 'beat'),
      edge('e-c', 'flash', 'frame', 'sat', 'frame'),
      edge('e-o', 'sat', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Pacifica Whitecap Storm',
    [
      audioIn(), fft(), beat(), feat(),
      studioNode('pal', 'Poline', -880, -180, {
        anchorA: '#031422', anchorB: '#1b7ad4', anchorC: '#b8fff4', points: 6,
      }),
      studioNode('sea', 'Pacifica', -520, -40, { speed: 0.28, scale: 0.55, palette: 'ocean' }),
      studioNode('caps', 'TrebleSparks', -520, 220, { density: 0.55, palette: 'ice' }),
      studioNode('mix', 'Blend', -180, 80, { blendMode: 'screen', amount: 0.32 }),
      studioNode('flash', 'BeatFlash', 140, 80, {
        attack: 0.14, decay: 0.93, intensity: 0.95, blendMode: 'screen', preserveBase: true,
        palette: 'ocean', r: 200, g: 240, b: 255,
      }),
      studioNode('sat', 'Saturation', 420, 80, { amount: 1.22 }),
      groupOutput('out', 700, 80),
    ],
    [
      edge('in-fft', 'audio', 'out', 'fft', 'audio'),
      edge('in-beat', 'audio', 'out', 'beat', 'audio'),
      edge('in-feat', 'audio', 'out', 'feat', 'audio'),
      edge('e-pal', 'pal', 'palette', 'sea', 'paletteIn'),
      edge('e-sp', 'fft', 'bass', 'sea', 'speed'),
      edge('e-sc', 'feat', 'energy', 'sea', 'scale'),
      edge('e-tr', 'fft', 'treble', 'caps', 'treble'),
      edge('e-a', 'sea', 'frame', 'mix', 'a'),
      edge('e-b', 'caps', 'frame', 'mix', 'b'),
      edge('e-m', 'mix', 'frame', 'flash', 'frame'),
      edge('e-bt', 'beat', 'beat', 'flash', 'beat'),
      edge('e-s', 'flash', 'frame', 'sat', 'frame'),
      edge('e-o', 'sat', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Heartline Tracer',
    [
      audioIn(), fft(), beat(), feat(),
      studioNode('pal', 'Poline', -880, -200, {
        anchorA: '#1a0610', anchorB: '#ff2a5f', anchorC: '#ffd1a0', points: 6,
      }),
      studioNode('clock', 'Math', -880, 40, { mathOp: 'add', b: 0.14 }),
      studioNode('orbit', 'Counter', -880, 200),
      studioNode('size', 'MapRange', -880, 360, { inMin: 0.05, inMax: 0.95, outMin: 0.48, outMax: 1.12 }),
      studioNode('ink', 'PaletteSampler', -520, -160, { palette: 'lava', t: 0.4 }),
      studioNode('path', 'Path', -520, 40, {
        pathShape: 'heart', t: 0, scale: 0.82, thickness: 1.6, r: 255, g: 80, b: 120,
      }),
      studioNode('trails', 'Trails', -180, 40, { decay: 0.16 }),
      studioNode('flash', 'BeatFlash', 140, 40, {
        attack: 0.1, decay: 0.9, intensity: 1.25, blendMode: 'add', preserveBase: true,
        palette: 'lava', r: 255, g: 120, b: 160,
      }),
      studioNode('sat', 'Saturation', 420, 40, { amount: 1.38 }),
      groupOutput('out', 700, 40),
    ],
    [
      edge('in-fft', 'audio', 'out', 'fft', 'audio'),
      edge('in-beat', 'audio', 'out', 'beat', 'audio'),
      edge('in-feat', 'audio', 'out', 'feat', 'audio'),
      edge('e-pal', 'pal', 'palette', 'ink', 'paletteIn'),
      edge('e-en', 'feat', 'energy', 'clock', 'a'),
      edge('e-ck', 'clock', 'result', 'orbit', 'rate'),
      edge('e-t', 'orbit', 'value', 'path', 't'),
      edge('e-bs', 'fft', 'bass', 'size', 'value'),
      edge('e-sc', 'size', 'result', 'path', 'scale'),
      edge('e-md', 'fft', 'mids', 'ink', 't'),
      edge('e-col', 'ink', 'color', 'path', 'color'),
      edge('e-p', 'path', 'frame', 'trails', 'frame'),
      edge('e-f', 'trails', 'frame', 'flash', 'frame'),
      edge('e-bt', 'beat', 'beat', 'flash', 'beat'),
      edge('e-s', 'flash', 'frame', 'sat', 'frame'),
      edge('e-o', 'sat', 'frame', 'out', 'frame'),
    ],
  ),

  audioPattern(
    'Plasma Beat Lattice',
    [
      audioIn(), fft(), beat(), feat(),
      studioNode('pal', 'Poline', -880, -180, {
        anchorA: '#0b0620', anchorB: '#6a3dff', anchorC: '#ff8ad8', points: 6,
      }),
      studioNode('dice', 'Random', -880, 80, { min: 0, max: 1, seed: 13 }),
      studioNode('hold', 'SampleHold', -880, 240),
      studioNode('plasma', 'Plasma', -520, -40, { speed: 0.22, palette: 'ultraviolet' }),
      studioNode('kale', 'Kaleidoscope', -220, -40, { segments: 5 }),
      studioNode('tint', 'HueShift', -220, 200),
      studioNode('flash', 'BeatFlash', 80, 40, {
        attack: 0.09, decay: 0.9, intensity: 1.28, blendMode: 'screen', preserveBase: true,
        palette: 'ultraviolet', r: 220, g: 160, b: 255,
      }),
      studioNode('boost', 'ColorBoost', 360, 40, { boost: 0.5 }),
      groupOutput('out', 640, 40),
    ],
    [
      edge('in-fft', 'audio', 'out', 'fft', 'audio'),
      edge('in-beat', 'audio', 'out', 'beat', 'audio'),
      edge('in-feat', 'audio', 'out', 'feat', 'audio'),
      edge('e-pal', 'pal', 'palette', 'plasma', 'paletteIn'),
      edge('e-sp', 'fft', 'mids', 'plasma', 'speed'),
      edge('e-k', 'plasma', 'frame', 'kale', 'frame'),
      edge('e-d', 'dice', 'value', 'hold', 'value'),
      edge('e-tr', 'beat', 'beat', 'hold', 'trigger'),
      edge('e-h', 'kale', 'frame', 'tint', 'frame'),
      edge('e-sh', 'hold', 'result', 'tint', 'shift'),
      edge('e-f', 'tint', 'frame', 'flash', 'frame'),
      edge('e-bt', 'beat', 'beat', 'flash', 'beat'),
      edge('e-c', 'flash', 'frame', 'boost', 'frame'),
      edge('e-o', 'boost', 'frame', 'out', 'frame'),
    ],
  ),
]
