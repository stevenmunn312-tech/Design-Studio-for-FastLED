import type { StudioEdge, StudioNode } from '../graphStore'
import type { SavedPattern } from './patternLibrary'
import { NODE_LIBRARY } from '../nodeLibrary'

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
    'A ring of moonlight breathes on dark water while glassy ripples roll out beneath it.',
    ['soothing', 'oceanic', 'luxury'],
    [
      // Dark water. The palette closes on itself, so turning it (flow) rolls
      // the ripple crests outward without a seam.
      studioNode('depths', 'CustomPalette', -580, -940, {
        colors: ['#02030f', '#07224a', '#1596a8', '#07224a', '#02030f', '#07224a', '#1596a8', '#02030f'],
        positions: [0, 0.14, 0.25, 0.36, 0.5, 0.64, 0.75, 1],
      }),
      studioNode('tide', 'Wave', -580, -720, { waveform: 'sawtooth', rateUnit: 'Hz', frequency: 0.06, amplitude: -1, offset: 1 }),
      studioNode('flow', 'PaletteTransform', -260, -460),
      studioNode('rings', 'GradientField', -580, -320, { gradientType: 'radial' }),
      studioNode('glassX', 'FieldNoise', -580, 20, { speed: 0.09, scale: 0.2, octaves: 1, seed: 5 }),
      studioNode('glassY', 'FieldNoise', -580, 360, { speed: 0.07, scale: 0.2, octaves: 1, seed: 17 }),
      studioNode('water', 'FieldWarp', -260, -140, { strength: 1.4 }),
      studioNode('ripples', 'FieldToFrame', 60, -100),
      studioNode('breathWave', 'Wave', -1220, 40, { waveform: 'sine', rateUnit: 'Hz', frequency: 0.07 }),
      studioNode('breath', 'MapRange', -900, 40, { outMin: 0.25, outMax: 0.34 }),
      // The halo. Its distance field reads 0 outside the ring, 0.5 on it and up
      // to 1 in the pool inside, and moonlight puts its white at 0.5.
      studioNode('disc', 'ShapeField', -580, 700, { shape: 'ellipse', fieldMode: 'distance', range: 0.2 }),
      studioNode('lens', 'FieldWarp', -260, 260, { strength: 1.4 }),
      studioNode('moonlight', 'CustomPalette', -260, 660, {
        colors: ['#000000', '#0a1a6a', '#35c8e8', '#ffffff', '#ffe2c0', '#0a5a6a', '#031c26'],
        positions: [0, 0.3, 0.44, 0.5, 0.57, 0.7, 1],
      }),
      studioNode('halo', 'FieldToFrame', 60, 180),
      studioNode('glow', 'Blend', 380, 40, { blendMode: 'screen', amount: 1 }),
      groupOutput('out', 700, 40),
    ],
    [
      edge('e1', 'depths', 'palette', 'flow', 'paletteIn', '#ff5cf0'),
      edge('e2', 'tide', 'result', 'flow', 'offset', '#9aa0a6'),
      edge('e3', 'rings', 'field', 'water', 'field'),
      edge('e4', 'glassX', 'field', 'water', 'dx'),
      edge('e5', 'glassY', 'field', 'water', 'dy'),
      edge('e6', 'water', 'field', 'ripples', 'field'),
      edge('e7', 'flow', 'palette', 'ripples', 'paletteIn', '#ff5cf0'),
      edge('e8', 'breathWave', 'result', 'breath', 'value', '#9aa0a6'),
      edge('e9', 'breath', 'result', 'disc', 'size', '#9aa0a6'),
      edge('e10', 'disc', 'field', 'lens', 'field'),
      edge('e11', 'glassX', 'field', 'lens', 'dx'),
      edge('e12', 'glassY', 'field', 'lens', 'dy'),
      edge('e13', 'lens', 'field', 'halo', 'field'),
      edge('e14', 'moonlight', 'palette', 'halo', 'paletteIn', '#ff5cf0'),
      edge('e15', 'ripples', 'frame', 'glow', 'a'),
      edge('e16', 'halo', 'frame', 'glow', 'b'),
      edge('e17', 'glow', 'frame', 'out', 'frame'),
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
        angle: 90,
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
      studioNode('noise', 'Noise', -460, 20, { noiseType: 'fbm', speed: 0.1, scale: 0.34, octaves: 5, palette: 'forest', seed: 812 }),
      studioNode('mirror', 'Mirror', -160, 20, {
        mirrorMode: 'quad',
        glow: true,
        glowAmount: 0.18,
      }),
      studioNode('swing', 'Wave', -160, 220, { rateUnit: 'BPM', bpm: 3, unipolar: true, amplitude: 0.08, offset: -0.03 }),
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
      edge('e6', 'swing', 'result', 'shift', 'shift', '#9aa0a6'),
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
        trail: 0.83,
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
        angle: 90,
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
    'Aurora green, violet and rose silk folds through a slowly turning hexagonal tiling, lit from within.',
    ['mesmeric', 'silken', 'immersive'],
    [
      // Plasma scrolls round its palette, so this one closes on itself. Three
      // lobes with a trough between each pair keep two colours and a dark in
      // most frames; two lobes left whole frames one colour.
      studioNode('aurora', 'CustomPalette', -260, 40, {
        colors: ['#0a1850', '#3fe8a0', '#0a1850', '#8a3df0', '#0a1850', '#ff5fd0', '#0a1850'],
        positions: [0, 0.167, 0.333, 0.5, 0.667, 0.833, 1],
      }),
      studioNode('silk', 'Plasma', 60, 40, { speed: 0.1, scale: 0.3 }),
      studioNode('tiles', 'Symmetry', 380, 40, { group: 'p6m', cells: 1.4, spin: 3 }),
      groupOutput('out', 700, 40),
    ],
    [
      edge('e1', 'aurora', 'palette', 'silk', 'paletteIn', '#ff5cf0'),
      edge('e2', 'silk', 'frame', 'tiles', 'frame'),
      edge('e3', 'tiles', 'frame', 'out', 'frame'),
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
        scale: 0.36,
        count: 30,
        trail: 0.65,
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
    'Layered petals unfurl from a glowing heart through rose, blush and peach, never still.',
    ['botanical', 'ornamental', 'soft-focus'],
    [
      // The palette closes on itself; turning it (cycle) sends the bands
      // outward, so the flower keeps unfurling.
      studioNode('rose', 'CustomPalette', -900, -560, {
        colors: ['#3a0838', '#b3175f', '#ff5c9a', '#ffd0de', '#ffb37a', '#e02a7a', '#3a0838'],
        positions: [0, 0.16, 0.34, 0.5, 0.64, 0.82, 1],
      }),
      studioNode('unfurl', 'Wave', -900, -340, { waveform: 'sawtooth', rateUnit: 'Hz', frequency: 0.06 }),
      studioNode('cycle', 'PaletteTransform', -580, -480),
      // Six broad petals: three two-petal roses a sixth of a turn apart. A rose
      // of more petals has thin ones, which read as a star on a small matrix.
      studioNode('petalA', 'ShapeField', -1220, -240, {
        shape: 'rose',
        fieldMode: 'distance',
        petals: 2,
        size: 0.5,
        range: 0.9,
        rotation: 0,
        spin: 4,
      }),
      studioNode('petalB', 'ShapeField', -1220, 320, {
        shape: 'rose',
        fieldMode: 'distance',
        petals: 2,
        size: 0.5,
        range: 0.9,
        rotation: 60,
        spin: 4,
      }),
      studioNode('petalC', 'ShapeField', -900, 60, {
        shape: 'rose',
        fieldMode: 'distance',
        petals: 2,
        size: 0.5,
        range: 0.9,
        rotation: 120,
        spin: 4,
      }),
      studioNode('pair', 'FieldMath', -900, 620, { fieldOp: 'max' }),
      studioNode('bloom', 'FieldMath', -580, -160, { fieldOp: 'max' }),
      studioNode('petals', 'FieldToFrame', -260, -100, { low: 0.1, high: 0.72 }),
      // A heart that stays lit whatever colour the petals are passing through.
      studioNode('core', 'ShapeField', -580, 100, { shape: 'ellipse', fieldMode: 'falloff', size: 0.03, range: 0.24 }),
      studioNode('ember', 'CustomPalette', -580, 660, { colors: ['#fff4c8', '#ff9a3c', '#5a1030', '#000000'], positions: [0, 0.3, 0.65, 1] }),
      studioNode('heart', 'FieldToFrame', -260, 180),
      studioNode('flower', 'Blend', 60, 40, { blendMode: 'screen', amount: 0.85 }),
      studioNode('soften', 'Blur2D', 380, 40, { amount: 0.1 }),
      groupOutput('out', 700, 40),
    ],
    [
      edge('e1', 'rose', 'palette', 'cycle', 'paletteIn', '#ff5cf0'),
      edge('e2', 'unfurl', 'result', 'cycle', 'offset', '#9aa0a6'),
      edge('e3', 'petalA', 'field', 'pair', 'a'),
      edge('e4', 'petalB', 'field', 'pair', 'b'),
      edge('e5', 'pair', 'field', 'bloom', 'a'),
      edge('e6', 'petalC', 'field', 'bloom', 'b'),
      edge('e7', 'bloom', 'field', 'petals', 'field'),
      edge('e8', 'cycle', 'palette', 'petals', 'paletteIn', '#ff5cf0'),
      edge('e9', 'core', 'field', 'heart', 'field'),
      edge('e10', 'ember', 'palette', 'heart', 'paletteIn', '#ff5cf0'),
      edge('e11', 'petals', 'frame', 'flower', 'a'),
      edge('e12', 'heart', 'frame', 'flower', 'b'),
      edge('e13', 'flower', 'frame', 'soften', 'frame'),
      edge('e14', 'soften', 'frame', 'out', 'frame'),
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
        steps: 4,
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
