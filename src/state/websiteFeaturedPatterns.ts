import type { StudioEdge, StudioNode } from './graphStore'
import type { SavedPattern } from './patternLibrary'
import { NODE_LIBRARY } from './nodeLibrary'

export interface WebsiteFeaturedPatternAsset {
  slug: string
  summary: string
  moods: string[]
  pattern: SavedPattern
}

type PatternSeed = Omit<SavedPattern, 'id' | 'createdAt'> & {
  slug: string
  summary: string
  moods: string[]
}

type Port = SavedPattern['outputs'][number]

const FRAME_OUTPUT: Port[] = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]

const NODE_DEFS = new Map(NODE_LIBRARY.map((def) => [def.type, def]))

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
  const def = NODE_DEFS.get(nodeType)
  if (!def) throw new Error(`Unknown website pattern node type: ${nodeType}`)
  return {
    id,
    type: 'studioNode',
    position: { x, y },
    data: {
      label: def.label,
      nodeType: def.type,
      category: def.category,
      properties: { ...(def.defaultProperties ?? {}), ...properties },
      inputs: clonePorts(def.inputs),
      outputs: clonePorts(def.outputs),
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

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  stroke?: string,
): StudioEdge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'glowEdge',
    reconnectable: 'target',
    ...(stroke ? { style: { stroke } } : {}),
  } as StudioEdge
}

function asset(
  slug: string,
  name: string,
  summary: string,
  moods: string[],
  nodes: StudioNode[],
  edges: StudioEdge[],
): PatternSeed {
  return {
    slug,
    name,
    summary,
    moods,
    inputs: [],
    outputs: clonePorts(FRAME_OUTPUT),
    subgraph: { nodes, edges },
  }
}

const WEBSITE_PATTERN_SEEDS: PatternSeed[] = [
  asset(
    'stillwater-halo',
    'Stillwater Halo',
    'Glassy tidal light that folds soft ocean bands into a meditative halo.',
    ['soothing', 'oceanic', 'luxury'],
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#041826',
        anchorB: '#2b879f',
        anchorC: '#c8fff8',
        points: 6,
      }),
      studioNode('base', 'Pacifica', -460, 40, { speed: 0.12, scale: 0.44 }),
      studioNode('kale', 'Kaleidoscope', -160, 40, { segments: 5 }),
      studioNode('blur', 'Blur2D', 120, 40, { amount: 0.1 }),
      studioNode('sat', 'Saturation', 400, 40, { amount: 1.16 }),
      groupOutput('out', 680, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'base', 'paletteIn', '#ff5cf0'),
      edge('e2', 'base', 'frame', 'kale', 'frame'),
      edge('e3', 'kale', 'frame', 'blur', 'frame'),
      edge('e4', 'blur', 'frame', 'sat', 'frame'),
      edge('e5', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'roseglass-quietude',
    'Roseglass Quietude',
    'A dusk-to-coral bloom with slow plasma breathing through polished glass.',
    ['warm', 'ambient', 'romantic'],
    [
      studioNode('backdrop', 'GradientFrame', -760, -80, {
        rA: 18,
        gA: 10,
        bA: 44,
        rB: 255,
        gB: 114,
        bB: 120,
        vertical: true,
      }),
      studioNode('pal', 'Poline', -760, 200, {
        anchorA: '#28153d',
        anchorB: '#ff7d8f',
        anchorC: '#ffd0b1',
        points: 7,
      }),
      studioNode('plasma', 'Plasma', -420, 200, { speed: 0.12, scale: 0.38 }),
      studioNode('blend', 'Blend', -100, 60, { blendMode: 'screen', amount: 0.24 }),
      studioNode('blur', 'Blur2D', 200, 60, { amount: 0.08 }),
      studioNode('sat', 'Saturation', 480, 60, { amount: 1.42 }),
      groupOutput('out', 760, 60),
    ],
    [
      edge('e1', 'pal', 'palette', 'plasma', 'paletteIn', '#ff5cf0'),
      edge('e2', 'backdrop', 'frame', 'blend', 'a'),
      edge('e3', 'plasma', 'frame', 'blend', 'b'),
      edge('e4', 'blend', 'frame', 'blur', 'frame'),
      edge('e5', 'blur', 'frame', 'sat', 'frame'),
      edge('e6', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'mosslight-cloister',
    'Mosslight Cloister',
    'Deep forest light with a near-imperceptible hue drift, like sun through old stone glass.',
    ['earthy', 'calm', 'organic'],
    [
      studioNode('forest', 'PaletteSelector', -1040, -100, { palette: 'forest' }),
      studioNode('ocean', 'PaletteSelector', -1040, 140, { palette: 'ocean' }),
      studioNode('mix', 'PaletteBlend', -760, 20, { amount: 0.22 }),
      studioNode('noise', 'FractalNoise', -460, 20, {
        speed: 0.1,
        scale: 0.34,
        octaves: 5,
        seed: 812,
      }),
      studioNode('mirror', 'Mirror', -160, 20, {
        mirrorMode: 'quad',
        glow: true,
        glowAmount: 0.18,
      }),
      studioNode('swing', 'BeatSin', -160, 220, { bpm: 3, low: -0.03, high: 0.05 }),
      studioNode('shift', 'HueShift', 140, 20),
      studioNode('blur', 'Blur2D', 440, 20, { amount: 0.08 }),
      groupOutput('out', 720, 20),
    ],
    [
      edge('e1', 'forest', 'palette', 'mix', 'paletteA', '#ff5cf0'),
      edge('e2', 'ocean', 'palette', 'mix', 'paletteB', '#ff5cf0'),
      edge('e3', 'mix', 'palette', 'noise', 'paletteIn', '#ff5cf0'),
      edge('e4', 'noise', 'frame', 'mirror', 'frame'),
      edge('e5', 'mirror', 'frame', 'shift', 'frame'),
      edge('e6', 'swing', 'value', 'shift', 'shift', '#9aa0a6'),
      edge('e7', 'shift', 'frame', 'blur', 'frame'),
      edge('e8', 'blur', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'paper-lantern-drift',
    'Paper Lantern Drift',
    'Warm suspended lantern bands that sweep slowly and dissolve into silk.',
    ['warm', 'zen', 'architectural'],
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#24122e',
        anchorB: '#ff9f4c',
        anchorC: '#ffe6a3',
        points: 6,
      }),
      studioNode('scan', 'Scanner', -460, 40, {
        speed: 0.1,
        width: 3,
        fade: 0.82,
        axis: 'vertical',
      }),
      studioNode('array', 'Array', -120, 40, {
        count: 7,
        offsetX: 0,
        offsetY: 1.4,
        angle: 32,
        scale: 0.9,
        falloff: 0.78,
        blendMode: 'lighten',
      }),
      studioNode('blur', 'Blur2D', 220, 40, { amount: 0.18 }),
      studioNode('sat', 'Saturation', 500, 40, { amount: 1.3 }),
      groupOutput('out', 780, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'scan', 'paletteIn', '#ff5cf0'),
      edge('e2', 'scan', 'frame', 'array', 'frame'),
      edge('e3', 'array', 'frame', 'blur', 'frame'),
      edge('e4', 'blur', 'frame', 'sat', 'frame'),
      edge('e5', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'moonpool-aviary',
    'Moonpool Aviary',
    'Tiny flocking lights drift across a dark pool like bioluminescent birds.',
    ['floating', 'dreamy', 'cinematic'],
    [
      studioNode('backdrop', 'GradientFrame', -1040, -80, {
        rA: 6,
        gA: 14,
        bA: 38,
        rB: 18,
        gB: 44,
        bB: 82,
        vertical: true,
      }),
      studioNode('pal', 'Poline', -1040, 220, {
        anchorA: '#102448',
        anchorB: '#7cecff',
        anchorC: '#cdb8ff',
        points: 6,
      }),
      studioNode('boids', 'Boids', -660, 80, {
        speed: 0.12,
        count: 18,
        separation: 0.42,
        alignment: 0.6,
        cohesion: 0.46,
        visualRange: 5,
        colorMode: 'palette',
        seed: 401,
      }),
      studioNode('blur', 'Blur2D', -340, 80, { amount: 0.22 }),
      studioNode('blend', 'Blend', -20, 80, { blendMode: 'screen', amount: 0.32 }),
      studioNode('sat', 'Saturation', 280, 80, { amount: 1.22 }),
      groupOutput('out', 560, 80),
    ],
    [
      edge('e1', 'pal', 'palette', 'boids', 'paletteIn', '#ff5cf0'),
      edge('e2', 'boids', 'frame', 'blur', 'frame'),
      edge('e3', 'backdrop', 'frame', 'blend', 'a'),
      edge('e4', 'blur', 'frame', 'blend', 'b'),
      edge('e5', 'blend', 'frame', 'sat', 'frame'),
      edge('e6', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'quiet-filigree',
    'Quiet Filigree',
    'Layered diagonal ribbons that feel woven, luminous, and almost textile-like.',
    ['elegant', 'woven', 'gallery'],
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#131f49',
        anchorB: '#3ec7ff',
        anchorC: '#d8cbff',
        points: 7,
      }),
      studioNode('grad', 'PaletteGradient', -460, 40, {
        angle: 18,
        repeat: 4,
        speed: 0.03,
      }),
      studioNode('array', 'Array', -120, 40, {
        count: 8,
        offsetX: 1.7,
        offsetY: 1.4,
        angle: 60,
        scale: 0.84,
        falloff: 0.74,
        blendMode: 'lighten',
      }),
      studioNode('blur', 'Blur2D', 220, 40, { amount: 0.12 }),
      studioNode('sat', 'Saturation', 500, 40, { amount: 1.38 }),
      groupOutput('out', 780, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'grad', 'paletteIn', '#ff5cf0'),
      edge('e2', 'grad', 'frame', 'array', 'frame'),
      edge('e3', 'array', 'frame', 'blur', 'frame'),
      edge('e4', 'blur', 'frame', 'sat', 'frame'),
      edge('e5', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'tiled-aurora-silk',
    'Tiled Aurora Silk',
    'Soft aurora cells drift through a tiled field like folded silk lit from within.',
    ['mesmeric', 'silken', 'immersive'],
    [
      studioNode('pal', 'Poline', -1040, -40, {
        anchorA: '#0a1f46',
        anchorB: '#20b8a0',
        anchorC: '#d3fff1',
        points: 6,
      }),
      studioNode('noise', 'FieldNoise', -1040, 180, {
        speed: 0.16,
        scale: 0.24,
        octaves: 5,
        seed: 618,
      }),
      studioNode('tile', 'FieldTile', -760, 180, { tilesX: 3, tilesY: 2 }),
      studioNode('rotate', 'FieldRotate', -480, 180, { angle: 0, spin: 9 }),
      studioNode('toFrame', 'FieldToFrame', -180, 120, { brightness: 1 }),
      studioNode('blur', 'Blur2D', 120, 120, { amount: 0.08 }),
      studioNode('sat', 'Saturation', 400, 120, { amount: 1.48 }),
      groupOutput('out', 680, 120),
    ],
    [
      edge('e1', 'noise', 'field', 'tile', 'field'),
      edge('e2', 'tile', 'field', 'rotate', 'field'),
      edge('e3', 'rotate', 'field', 'toFrame', 'field'),
      edge('e4', 'pal', 'palette', 'toFrame', 'paletteIn', '#ff5cf0'),
      edge('e5', 'toFrame', 'frame', 'blur', 'frame'),
      edge('e6', 'blur', 'frame', 'sat', 'frame'),
      edge('e7', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'echo-basin',
    'Echo Basin',
    'A slow current leaves luminous after-images, like ripples remembering where they have been.',
    ['liquid', 'reflective', 'slow-burn'],
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#071c2c',
        anchorB: '#40a9cc',
        anchorC: '#c7fff6',
        points: 6,
      }),
      studioNode('flow', 'FlowField', -460, 40, {
        speed: 0.11,
        scale: 0.09,
        count: 30,
        fade: 0.95,
        seed: 244,
      }),
      studioNode('feedback', 'FrameFeedback', -140, 40, {
        delayFrames: 3,
        amount: 0.38,
        fade: 0.06,
        blendMode: 'screen',
        feedbackTransform: 'scale',
        scale: 0.985,
      }),
      studioNode('blur', 'Blur2D', 160, 40, { amount: 0.1 }),
      studioNode('sat', 'Saturation', 440, 40, { amount: 1.18 }),
      groupOutput('out', 720, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'flow', 'paletteIn', '#ff5cf0'),
      edge('e2', 'flow', 'frame', 'feedback', 'frame'),
      edge('e3', 'feedback', 'frame', 'blur', 'frame'),
      edge('e4', 'blur', 'frame', 'sat', 'frame'),
      edge('e5', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'veil-of-petals',
    'Veil of Petals',
    'Oriented noise turns into a soft floral lattice, delicate without becoming static.',
    ['botanical', 'ornamental', 'soft-focus'],
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#2a1234',
        anchorB: '#ff6cb0',
        anchorC: '#ffe0d3',
        points: 6,
      }),
      studioNode('gabor', 'GaborNoise', -460, 40, {
        speed: 0.09,
        scale: 0.64,
        frequency: 0.92,
        orientation: 120,
        seed: 918,
      }),
      studioNode('kale', 'Kaleidoscope', -140, 40, { segments: 5 }),
      studioNode('blur', 'Blur2D', 140, 40, { amount: 0.1 }),
      studioNode('sat', 'Saturation', 420, 40, { amount: 1.34 }),
      groupOutput('out', 700, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'gabor', 'paletteIn', '#ff5cf0'),
      edge('e2', 'gabor', 'frame', 'kale', 'frame'),
      edge('e3', 'kale', 'frame', 'blur', 'frame'),
      edge('e4', 'blur', 'frame', 'sat', 'frame'),
      edge('e5', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  asset(
    'pearl-tissue',
    'Pearl Tissue',
    'Living pearlescent cells evolve at an unhurried pace, halfway between water and cloud.',
    ['organic', 'pearlescent', 'showpiece'],
    [
      studioNode('cloud', 'PaletteSelector', -1040, -80, { palette: 'cloud' }),
      studioNode('ocean', 'PaletteSelector', -1040, 160, { palette: 'ocean' }),
      studioNode('mix', 'PaletteBlend', -760, 40, { amount: 0.44 }),
      studioNode('react', 'ReactionDiffusion', -460, 40, {
        feed: 0.05,
        kill: 0.061,
        speed: 4,
        seed: 111,
      }),
      studioNode('blur', 'Blur2D', -140, 40, { amount: 0.06 }),
      studioNode('sat', 'Saturation', 140, 40, { amount: 1.28 }),
      groupOutput('out', 420, 40),
    ],
    [
      edge('e1', 'cloud', 'palette', 'mix', 'paletteA', '#ff5cf0'),
      edge('e2', 'ocean', 'palette', 'mix', 'paletteB', '#ff5cf0'),
      edge('e3', 'mix', 'palette', 'react', 'paletteIn', '#ff5cf0'),
      edge('e4', 'react', 'frame', 'blur', 'frame'),
      edge('e5', 'blur', 'frame', 'sat', 'frame'),
      edge('e6', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
]

function materializeWebsitePatternAssets(
  seeds: PatternSeed[],
  createdAtBase: number,
): WebsiteFeaturedPatternAsset[] {
  return seeds.map((entry, index) => {
    const { slug, summary, moods, ...pattern } = entry
    return {
      slug,
      summary,
      moods,
      pattern: {
        ...pattern,
        id: `website-featured-${String(index + 1).padStart(2, '0')}`,
        createdAt: createdAtBase + index,
      },
    }
  })
}

export const WEBSITE_FEATURED_PATTERN_ASSETS = materializeWebsitePatternAssets(
  WEBSITE_PATTERN_SEEDS,
  Date.UTC(2026, 7, 3, 0, 0, 0),
)

export const WEBSITE_FEATURED_PATTERNS: SavedPattern[] = WEBSITE_FEATURED_PATTERN_ASSETS.map(
  ({ pattern }) => pattern,
)
