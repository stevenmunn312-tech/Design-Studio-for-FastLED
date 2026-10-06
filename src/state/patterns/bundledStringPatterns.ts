import type { StudioEdge, StudioNode } from '../graphStore'
import type { SavedPattern } from './patternLibrary'
import { NODE_LIBRARY } from '../nodeLibrary'

type Seed = Omit<SavedPattern, 'id' | 'createdAt' | 'categoryId' | 'bundled'>
type Engine = { type: string; props?: Record<string, unknown> }
type Modulation = { source: 'bass' | 'mids' | 'treble' | 'energy' | 'vocals'; port: string; range: [number, number]; target?: 'base' | 'overlay' | 'finish' }
interface Recipe {
  name: string
  base: Engine
  colors: [string, string, string]
  overlay?: Engine
  amount?: number
  finish?: Engine
  mod?: Modulation[]
}

const definitions = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))
const framePorts = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]

function node(id: string, type: string, x: number, y: number, props: Record<string, unknown> = {}): StudioNode {
  const definition = definitions.get(type)
  if (!definition) throw new Error(`Unknown string pattern node: ${type}`)
  return {
    id, type: 'studioNode', position: { x, y },
    data: {
      label: definition.label, nodeType: type, category: definition.category,
      properties: { ...definition.defaultProperties, ...props },
      inputs: definition.inputs.map((port) => ({ ...port })),
      outputs: definition.outputs.map((port) => ({ ...port })),
    },
  } as StudioNode
}

/** One-dimensional engines only: no vertical flames, radial masks or 2-D geometry.
 * Audio controls are mapped to useful ranges rather than raw levels driving speed
 * to zero or scanner widths below one pixel. All nodes already support firmware. */
function build(recipe: Recipe, audio: boolean): Seed {
  const nodes: StudioNode[] = []
  const edges: StudioEdge[] = []
  const wire = (source: string, sourceHandle: string, target: string, targetHandle: string) => {
    edges.push({ id: `e-${edges.length}`, source, sourceHandle, target, targetHandle, type: 'glowEdge', reconnectable: 'target' } as StudioEdge)
  }
  const add = (id: string, engine: Engine, x: number, y: number) => {
    const created = node(id, engine.type, x, y, engine.props)
    nodes.push(created)
    if (definitions.get(engine.type)?.inputs.some((port) => port.id === 'paletteIn')) wire('palette', 'palette', id, 'paletteIn')
  }
  nodes.push(node('palette', 'Poline', -680, -240, {
    anchorA: recipe.colors[0], anchorB: recipe.colors[1], anchorC: recipe.colors[2], points: 6,
  }))
  add('base', recipe.base, -360, 0)
  let tail = 'base'
  if (recipe.overlay) {
    add('overlay', recipe.overlay, -360, 280)
    nodes.push(node('mix', 'Blend', -40, 0, { blendMode: 'screen', amount: recipe.amount ?? 0.45 }))
    wire('base', 'frame', 'mix', 'a')
    wire('overlay', 'frame', 'mix', 'b')
    tail = 'mix'
  }
  if (recipe.finish) {
    add('finish', recipe.finish, 280, 0)
    wire(tail, 'frame', 'finish', 'frame')
    tail = 'finish'
  }
  if (audio) {
    nodes.push({
      id: 'audio', type: 'studioNode', position: { x: -1600, y: 80 },
      data: { label: 'Audio', nodeType: 'GroupInput', category: 'composite',
        properties: { paramId: 'param0' }, inputs: [], outputs: [{ id: 'out', label: 'Audio', dataType: 'audio' }] },
    } as StudioNode)
    const mods = recipe.mod ?? []
    if (mods.some((mod) => ['bass', 'mids', 'treble'].includes(mod.source))) {
      nodes.push(node('fft', 'FFTAnalyzer', -1280, -160, { smoothing: 0.82, gain: 1.2 }))
      wire('audio', 'out', 'fft', 'audio')
    }
    if (mods.some((mod) => ['energy', 'vocals'].includes(mod.source))) {
      nodes.push(node('features', 'AudioFeatures', -1280, 200, { smoothing: 0.82, gate: 0.1 }))
      wire('audio', 'out', 'features', 'audio')
    }
    mods.forEach((mod, index) => {
      const id = `map-${index}`
      nodes.push(node(id, 'MapRange', -960, index * 220, { inMin: 0, inMax: 1, outMin: mod.range[0], outMax: mod.range[1] }))
      wire(['energy', 'vocals'].includes(mod.source) ? 'features' : 'fft', mod.source, id, 'value')
      wire(id, 'result', mod.target ?? 'base', mod.port)
    })
  }
  nodes.push({
    id: 'out', type: 'studioNode', position: { x: 600, y: 0 },
    data: { label: 'Group Output', nodeType: 'GroupOutput', category: 'output', properties: {}, inputs: framePorts.map((port) => ({ ...port })), outputs: [] },
  } as StudioNode)
  wire(tail, 'frame', 'out', 'frame')
  return {
    name: recipe.name, bestOn: ['string'],
    inputs: audio ? [{ id: 'param0', label: 'Audio', dataType: 'audio' }] : [],
    outputs: framePorts.map((port) => ({ ...port })), subgraph: { nodes, edges },
  }
}

const ocean: Recipe['colors'] = ['#001a40', '#008aaf', '#a4fff0']
const ember: Recipe['colors'] = ['#240004', '#ff3500', '#ffd080']
const forest: Recipe['colors'] = ['#001b0b', '#24b55a', '#d4ff91']
const violet: Recipe['colors'] = ['#170035', '#a400e8', '#ff80df']
const ice: Recipe['colors'] = ['#001850', '#2288ff', '#e4ffff']
const candy: Recipe['colors'] = ['#320046', '#ff247c', '#ffc848']

const standard: Recipe[] = [
  { name: 'String Ocean Drift', colors: ocean, base: { type: 'Pacifica', props: { speed: 0.18, scale: 0.38 } } },
  { name: 'String Ember Scanner', colors: ember, base: { type: 'Scanner', props: { speed: 0.28, width: 3, fade: 0.7, axis: 'horizontal' } } },
  { name: 'String Moon Comet', colors: ice, base: { type: 'Juggle', props: { count: 1, speed: 0.22, fade: 0.12, seed: 101 } } },
  { name: 'String Carnival Juggle', colors: candy, base: { type: 'Juggle', props: { count: 7, speed: 0.48, fade: 0.3, seed: 102 } } },
  { name: 'String Forest Fireflies', colors: forest, base: { type: 'TwinkleFox', props: { speed: 0.2, density: 0.28, seed: 103 } } },
  { name: 'String Ice Diamonds', colors: ice, base: { type: 'TwinkleFox', props: { speed: 0.65, density: 0.55, seed: 104 } } },
  { name: 'String Sunset Confetti', colors: ember, base: { type: 'Confetti', props: { speed: 0.3, density: 0.28, fade: 0.16, seed: 105 } } },
  { name: 'String Candy Rain', colors: candy, base: { type: 'Confetti', props: { speed: 0.65, density: 0.68, fade: 0.42, seed: 106 } } },
  { name: 'String Rainbow Conveyor', colors: candy, base: { type: 'Rainbow', props: { speed: 0.24, deltaHue: 9 } } },
  { name: 'String Silk Ribbon', colors: violet, base: { type: 'Pride2015', props: { speed: 0.2, scale: 0.25 } } },
  { name: 'String Candle Garland', colors: ember, base: { type: 'Candle', props: { mode: 'perPixel', flicker: 0.38, warmth: 0.82 } } },
  { name: 'String Lavender Plasma', colors: violet, base: { type: 'Plasma', props: { speed: 0.17 } } },
  { name: 'String Moss Marble', colors: forest, base: { type: 'Noise', props: { speed: 0.14, scale: 0.36, seed: 107 } } },
  { name: 'String Rose Heartbeat', colors: candy, base: { type: 'Heartbeat', props: { bpm: 58, strength: 0.72 } } },
  { name: 'String Whitecap Stars', colors: ocean, base: { type: 'Pacifica', props: { speed: 0.26 } }, overlay: { type: 'TwinkleFox', props: { speed: 0.45, density: 0.16, seed: 108 } }, amount: 0.5 },
  { name: 'String Lantern Chase', colors: ember, base: { type: 'Candle', props: { mode: 'perPixel', warmth: 0.9 } }, overlay: { type: 'Scanner', props: { width: 2, speed: 0.32, fade: 0.5 } }, amount: 0.65 },
  { name: 'String Neon Duet', colors: violet, base: { type: 'Scanner', props: { speed: 0.23, width: 2 } }, overlay: { type: 'Juggle', props: { count: 2, speed: 0.55, fade: 0.12, seed: 109 } }, amount: 0.8 },
  { name: 'String Frosted Confetti', colors: ice, base: { type: 'Noise', props: { speed: 0.08, scale: 0.24, seed: 110 } }, overlay: { type: 'Confetti', props: { density: 0.25, fade: 0.32, seed: 111 } } },
  { name: 'String Rainbow Spark Train', colors: candy, base: { type: 'Rainbow', props: { speed: 0.45, deltaHue: 18 } }, overlay: { type: 'Juggle', props: { count: 3, speed: 0.62, seed: 112 } }, amount: 0.7 },
  { name: 'String Midnight Jewels', colors: violet, base: { type: 'TwinkleFox', props: { speed: 0.12, density: 0.35, seed: 113 } }, finish: { type: 'Trails', props: { decay: 0.16 } } },
]

const audio: Recipe[] = [
  { name: 'String Bass Runner', colors: ember, base: { type: 'Scanner', props: { width: 3, fade: 0.65 } }, mod: [{ source: 'bass', port: 'speed', range: [0.12, 0.8] }] },
  { name: 'String Vocal Comet', colors: ice, base: { type: 'Juggle', props: { count: 1, fade: 0.14, seed: 201 } }, mod: [{ source: 'vocals', port: 'speed', range: [0.1, 0.65] }] },
  { name: 'String Treble Diamonds', colors: ice, base: { type: 'TwinkleFox', props: { speed: 0.58, seed: 202 } }, mod: [{ source: 'treble', port: 'density', range: [0.06, 0.85] }] },
  { name: 'String Snare Sprinkles', colors: candy, base: { type: 'Confetti', props: { speed: 0.6, fade: 0.35, seed: 203 } }, mod: [{ source: 'mids', port: 'density', range: [0.05, 0.8] }] },
  { name: 'String Bass Tide', colors: ocean, base: { type: 'Pacifica' }, mod: [{ source: 'bass', port: 'scale', range: [0.12, 0.65] }, { source: 'energy', port: 'speed', range: [0.08, 0.5] }] },
  { name: 'String Rhythm Ribbon', colors: candy, base: { type: 'Pride2015' }, mod: [{ source: 'energy', port: 'speed', range: [0.12, 0.75] }, { source: 'mids', port: 'scale', range: [0.15, 0.6] }] },
  { name: 'String Spectrum Conveyor', colors: candy, base: { type: 'Rainbow' }, mod: [{ source: 'bass', port: 'speed', range: [0.05, 0.7] }, { source: 'treble', port: 'deltaHue', range: [2, 24] }] },
  { name: 'String Singing Candles', colors: ember, base: { type: 'Candle', props: { mode: 'perPixel', warmth: 0.8 } }, mod: [{ source: 'vocals', port: 'flicker', range: [0.1, 0.9] }] },
  { name: 'String Midrange Marble', colors: forest, base: { type: 'Noise', props: { seed: 204 } }, mod: [{ source: 'mids', port: 'scale', range: [0.08, 0.65] }, { source: 'energy', port: 'speed', range: [0.06, 0.55] }] },
  { name: 'String Pulse Plasma', colors: violet, base: { type: 'Plasma' }, finish: { type: 'BrightnessMod' }, mod: [{ source: 'mids', port: 'speed', range: [0.08, 0.7] }, { source: 'bass', target: 'finish', port: 'brightness', range: [0.15, 1] }] },
  { name: 'String Bass Dot Choir', colors: ember, base: { type: 'Juggle', props: { speed: 0.4, seed: 205 } }, mod: [{ source: 'bass', port: 'count', range: [1, 9] }, { source: 'treble', port: 'fade', range: [0.08, 0.4] }] },
  { name: 'String Wide Kick Scanner', colors: violet, base: { type: 'Scanner', props: { speed: 0.3 } }, mod: [{ source: 'bass', port: 'width', range: [1, 12] }, { source: 'mids', port: 'fade', range: [0.3, 0.85] }] },
  { name: 'String Firefly Crescendo', colors: forest, base: { type: 'TwinkleFox', props: { seed: 206 } }, mod: [{ source: 'energy', port: 'density', range: [0.08, 0.9] }, { source: 'vocals', port: 'speed', range: [0.1, 0.65] }] },
  { name: 'String Confetti Sustain', colors: violet, base: { type: 'Confetti', props: { density: 0.42, seed: 207 } }, mod: [{ source: 'bass', port: 'fade', range: [0.5, 0.08] }, { source: 'treble', port: 'speed', range: [0.18, 0.8] }] },
  { name: 'String Vocal Whitecaps', colors: ocean, base: { type: 'Pacifica', props: { speed: 0.18 } }, overlay: { type: 'TwinkleFox', props: { speed: 0.48, seed: 208 } }, mod: [{ source: 'vocals', port: 'scale', range: [0.15, 0.7] }, { source: 'treble', target: 'overlay', port: 'density', range: [0.02, 0.6] }] },
  { name: 'String Drum Lanterns', colors: ember, base: { type: 'Candle', props: { mode: 'perPixel', warmth: 0.85 } }, overlay: { type: 'Scanner', props: { width: 3 } }, amount: 0.8, mod: [{ source: 'bass', target: 'overlay', port: 'speed', range: [0.08, 0.75] }, { source: 'mids', port: 'flicker', range: [0.15, 0.85] }] },
  { name: 'String Stereo Neon Dance', colors: violet, base: { type: 'Scanner', props: { width: 2 } }, overlay: { type: 'Juggle', props: { count: 3, seed: 209 } }, amount: 0.75, mod: [{ source: 'bass', port: 'speed', range: [0.1, 0.65] }, { source: 'treble', target: 'overlay', port: 'speed', range: [0.15, 0.85] }] },
  { name: 'String Frost Percussion', colors: ice, base: { type: 'Noise', props: { speed: 0.12, scale: 0.24, seed: 210 } }, overlay: { type: 'Confetti', props: { seed: 211 } }, mod: [{ source: 'mids', target: 'overlay', port: 'density', range: [0.03, 0.8] }, { source: 'bass', port: 'scale', range: [0.1, 0.5] }] },
  { name: 'String Festival Spark Train', colors: candy, base: { type: 'Rainbow', props: { deltaHue: 14 } }, overlay: { type: 'Juggle', props: { count: 4, seed: 212 } }, amount: 0.8, mod: [{ source: 'energy', port: 'speed', range: [0.08, 0.6] }, { source: 'bass', target: 'overlay', port: 'count', range: [1, 10] }] },
  { name: 'String Quiet Song Jewels', colors: violet, base: { type: 'TwinkleFox', props: { speed: 0.16, density: 0.4, seed: 213 } }, finish: { type: 'BrightnessMod' }, mod: [{ source: 'energy', target: 'finish', port: 'brightness', range: [0.04, 1] }, { source: 'vocals', port: 'density', range: [0.1, 0.65] }] },
]

export const STANDARD_STRING_SEEDS = standard.map((recipe) => build(recipe, false))
export const AUDIO_STRING_SEEDS = audio.map((recipe) => build(recipe, true))
