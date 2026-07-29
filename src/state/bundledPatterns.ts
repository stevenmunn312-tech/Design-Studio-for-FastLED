import type { StudioEdge, StudioNode } from './graphStore'
import type { SavedPattern } from './patternLibrary'
import { NODE_LIBRARY } from './nodeLibrary'

import auroraCometFoundry from '../assets/bundled-patterns/Aurora Comet Foundry.json'
import auroraEchoChoir from '../assets/bundled-patterns/Aurora Echo Choir.json'
import bassCathedralCollapse from '../assets/bundled-patterns/Bass Cathedral Collapse.json'
import chromasonicVortex from '../assets/bundled-patterns/Chromasonic Vortex.json'
import chromaticOrbitReactor from '../assets/bundled-patterns/Chromatic Orbit Reactor.json'
import colorTrails from '../assets/bundled-patterns/Color Trails.json'
import glassRainResonator from '../assets/bundled-patterns/Glass Rain Resonator.json'
import kaleidoBassSingularity from '../assets/bundled-patterns/Kaleido Bass Singularity.json'
import laserMonsoonParade from '../assets/bundled-patterns/Laser Monsoon Parade.json'
import mainstageConfettiSingularity from '../assets/bundled-patterns/Mainstage Confetti Singularity.json'
import morphingNeonRiver from '../assets/bundled-patterns/Morphing Neon River.json'
import percussionSymphony from '../assets/bundled-patterns/Percussion Symphony.json'
import polarWaveHaloEngine from '../assets/bundled-patterns/Polar Wave Halo Engine.json'
import prismStorm from '../assets/bundled-patterns/Prism Storm.json'
import prismaticWaterfallCathedral from '../assets/bundled-patterns/Prismatic Waterfall Cathedral.json'
import quadrantPulseObservatory from '../assets/bundled-patterns/Quadrant Pulse Observatory.json'
import rgbBlobThunderGarden from '../assets/bundled-patterns/RGB Blob Thunder Garden.json'
import spectralFieldVortex from '../assets/bundled-patterns/Spectral Field Vortex.json'
import spiralusPercussionShrine from '../assets/bundled-patterns/Spiralus Percussion Shrine.json'
import tidalGlassMeditation from '../assets/bundled-patterns/Tidal Glass Meditation.json'

export const AUDIO_REACTIVE_CATEGORY_ID = 'audio-reactive'
export const STANDARD_CATEGORY_ID = 'standard'

type BundledSeed = Omit<SavedPattern, 'id' | 'createdAt' | 'categoryId' | 'bundled'>

type Port = BundledSeed['outputs'][number]

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
  if (!def) throw new Error(`Unknown bundled pattern node type: ${nodeType}`)
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

function pattern(name: string, nodes: StudioNode[], edges: StudioEdge[]): BundledSeed {
  return {
    name,
    inputs: [],
    outputs: clonePorts(FRAME_OUTPUT),
    subgraph: { nodes, edges },
  }
}

const STANDARD_PATTERN_SEEDS: BundledSeed[] = [
  pattern(
    'Azure Tideglass',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#041b2d',
        anchorB: '#1e6f8f',
        anchorC: '#5fe7ff',
        points: 6,
      }),
      studioNode('base', 'Pacifica', -440, 40, { speed: 0.16, scale: 0.54 }),
      studioNode('blur', 'Blur2D', -140, 40, { amount: 0.08 }),
      studioNode('sat', 'Saturation', 140, 40, { amount: 1.28 }),
      groupOutput('out', 420, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'base', 'paletteIn', '#ff5cf0'),
      edge('e2', 'base', 'frame', 'blur', 'frame'),
      edge('e3', 'blur', 'frame', 'sat', 'frame'),
      edge('e4', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Aurora Veil',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#07141f',
        anchorB: '#1fc6a4',
        anchorC: '#dbfff5',
        points: 5,
      }),
      studioNode('base', 'FractalNoise', -440, 40, {
        speed: 0.14,
        scale: 0.48,
        octaves: 5,
        seed: 312,
      }),
      studioNode('kale', 'Kaleidoscope', -140, 40, { segments: 5 }),
      studioNode('blur', 'Blur2D', 140, 40, { amount: 0.12 }),
      groupOutput('out', 420, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'base', 'paletteIn', '#ff5cf0'),
      edge('e2', 'base', 'frame', 'kale', 'frame'),
      edge('e3', 'kale', 'frame', 'blur', 'frame'),
      edge('e4', 'blur', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Opaline Plasma',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#1b1737',
        anchorB: '#2bc9cb',
        anchorC: '#ffd5a8',
        points: 7,
      }),
      studioNode('base', 'Plasma', -440, 40, { speed: 0.18 }),
      studioNode('blur', 'Blur2D', -140, 40, { amount: 0.1 }),
      studioNode('sat', 'Saturation', 140, 40, { amount: 0.84 }),
      groupOutput('out', 420, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'base', 'paletteIn', '#ff5cf0'),
      edge('e2', 'base', 'frame', 'blur', 'frame'),
      edge('e3', 'blur', 'frame', 'sat', 'frame'),
      edge('e4', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Kaleido Reef',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#05111f',
        anchorB: '#136f7d',
        anchorC: '#9ff7f7',
        points: 6,
      }),
      studioNode('base', 'Pacifica', -460, 40, { speed: 0.22, scale: 0.68 }),
      studioNode('kale', 'Kaleidoscope', -160, 40, { segments: 6 }),
      studioNode('blur', 'Blur2D', 120, 40, { amount: 0.06 }),
      studioNode('sat', 'Saturation', 400, 40, { amount: 1.65 }),
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
  pattern(
    'Velvet Prism',
    [
      studioNode('base', 'Pride2015', -480, 40, { speed: 0.12, scale: 0.32 }),
      studioNode('mirror', 'Mirror', -180, 40, { mirrorMode: 'vertical', glow: false }),
      studioNode('blur', 'Blur2D', 100, 40, { amount: 0.09 }),
      groupOutput('out', 380, 40),
    ],
    [
      edge('e1', 'base', 'frame', 'mirror', 'frame'),
      edge('e2', 'mirror', 'frame', 'blur', 'frame'),
      edge('e3', 'blur', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Moonlit Lanterns',
    [
      studioNode('ocean', 'PaletteSelector', -1040, -60, { palette: 'ocean' }),
      studioNode('cloud', 'PaletteSelector', -1040, 180, { palette: 'cloud' }),
      studioNode('mix', 'PaletteBlend', -760, 60, { amount: 0.35 }),
      studioNode('base', 'Pacifica', -460, -20, { speed: 0.15, scale: 0.5 }),
      studioNode('twinkle', 'TwinkleFox', -460, 180, { speed: 0.14, density: 0.62, seed: 144 }),
      studioNode('soften', 'Blur2D', -160, 180, { amount: 0.18 }),
      studioNode('blend', 'Blend', 140, 60, { blendMode: 'screen', amount: 0.2 }),
      studioNode('sat', 'Saturation', 440, 60, { amount: 1.7 }),
      groupOutput('out', 720, 60),
    ],
    [
      edge('e1', 'ocean', 'palette', 'mix', 'paletteA', '#ff5cf0'),
      edge('e2', 'cloud', 'palette', 'mix', 'paletteB', '#ff5cf0'),
      edge('e3', 'mix', 'palette', 'base', 'paletteIn', '#ff5cf0'),
      edge('e4', 'mix', 'palette', 'twinkle', 'paletteIn', '#ff5cf0'),
      edge('e5', 'twinkle', 'frame', 'soften', 'frame'),
      edge('e6', 'base', 'frame', 'blend', 'a'),
      edge('e7', 'soften', 'frame', 'blend', 'b'),
      edge('e8', 'blend', 'frame', 'sat', 'frame'),
      edge('e9', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Forest Cathedral',
    [
      studioNode('forest', 'PaletteSelector', -1040, -100, { palette: 'forest' }),
      studioNode('ocean', 'PaletteSelector', -1040, 140, { palette: 'ocean' }),
      studioNode('mix', 'PaletteBlend', -760, 20, { amount: 0.25 }),
      studioNode('base', 'FractalNoise', -460, 20, {
        speed: 0.12,
        scale: 0.38,
        octaves: 5,
        seed: 771,
      }),
      studioNode('mirror', 'Mirror', -160, 20, {
        mirrorMode: 'quad',
        glow: true,
        glowAmount: 0.22,
      }),
      studioNode('swing', 'BeatSin', -160, 220, { bpm: 4, low: 0.01, high: 0.09 }),
      studioNode('shift', 'HueShift', 140, 20),
      studioNode('blur', 'Blur2D', 440, 20, { amount: 0.08 }),
      groupOutput('out', 720, 20),
    ],
    [
      edge('e1', 'forest', 'palette', 'mix', 'paletteA', '#ff5cf0'),
      edge('e2', 'ocean', 'palette', 'mix', 'paletteB', '#ff5cf0'),
      edge('e3', 'mix', 'palette', 'base', 'paletteIn', '#ff5cf0'),
      edge('e4', 'base', 'frame', 'mirror', 'frame'),
      edge('e5', 'mirror', 'frame', 'shift', 'frame'),
      edge('e6', 'swing', 'value', 'shift', 'shift', '#9aa0a6'),
      edge('e7', 'shift', 'frame', 'blur', 'frame'),
      edge('e8', 'blur', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Spiral Bloom',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#160c26',
        anchorB: '#9053ff',
        anchorC: '#ffb0d7',
        points: 6,
      }),
      studioNode('base', 'Spiral', -460, 40, { speed: 0.1, arms: 3 }),
      studioNode('mirror', 'Mirror', -160, 40, {
        mirrorMode: 'quad',
        glow: true,
        glowAmount: 0.18,
      }),
      studioNode('blur', 'Blur2D', 120, 40, { amount: 0.16 }),
      groupOutput('out', 400, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'base', 'paletteIn', '#ff5cf0'),
      edge('e2', 'base', 'frame', 'mirror', 'frame'),
      edge('e3', 'mirror', 'frame', 'blur', 'frame'),
      edge('e4', 'blur', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Cloud Chamber',
    [
      studioNode('pal', 'Poline', -760, 60, {
        anchorA: '#0a1f3a',
        anchorB: '#3d79ff',
        anchorC: '#6ff7ff',
        points: 6,
      }),
      studioNode('base', 'GaborNoise', -420, 60, {
        speed: 0.11,
        scale: 0.56,
        frequency: 1.4,
        orientation: 34,
        seed: 901,
      }),
      studioNode('blur', 'Blur2D', -120, 60, { amount: 0.1 }),
      studioNode('sat', 'Saturation', 180, 60, { amount: 1.8 }),
      groupOutput('out', 460, 60),
    ],
    [
      edge('e1', 'pal', 'palette', 'base', 'paletteIn', '#ff5cf0'),
      edge('e2', 'base', 'frame', 'blur', 'frame'),
      edge('e3', 'blur', 'frame', 'sat', 'frame'),
      edge('e4', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Sunset Silk',
    [
      studioNode('backdrop', 'GradientFrame', -760, -80, {
        rA: 10,
        gA: 22,
        bA: 88,
        rB: 255,
        gB: 78,
        bB: 116,
        vertical: true,
      }),
      studioNode('pal', 'Poline', -760, 200, {
        anchorA: '#1f1b49',
        anchorB: '#ff8c6b',
        anchorC: '#ffb64f',
        points: 6,
      }),
      studioNode('plasma', 'Plasma', -420, 200, { speed: 0.14 }),
      studioNode('blend', 'Blend', -100, 60, { blendMode: 'screen', amount: 0.28 }),
      studioNode('blur', 'Blur2D', 200, 60, { amount: 0.08 }),
      studioNode('sat', 'Saturation', 480, 60, { amount: 1.8 }),
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
  pattern(
    'Celestial Weave',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#0e1f4f',
        anchorB: '#55d6ff',
        anchorC: '#b075ff',
        points: 6,
      }),
      studioNode('grad', 'PaletteGradient', -460, 40, {
        angle: 28,
        repeat: 3,
        speed: 0.05,
      }),
      studioNode('array', 'Array', -120, 40, {
        count: 6,
        offsetX: 2,
        offsetY: 2,
        angle: 58,
        scale: 0.88,
        falloff: 0.72,
        blendMode: 'lighten',
      }),
      studioNode('blur', 'Blur2D', 220, 40, { amount: 0.11 }),
      studioNode('sat', 'Saturation', 500, 40, { amount: 1.55 }),
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
  pattern(
    'Silver Shoal',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#071b2c',
        anchorB: '#3ba7d8',
        anchorC: '#6fffe9',
        points: 6,
      }),
      studioNode('flow', 'FlowField', -460, 40, {
        speed: 0.18,
        scale: 0.12,
        count: 42,
        fade: 0.94,
        seed: 522,
      }),
      studioNode('blur', 'Blur2D', -140, 40, { amount: 0.08 }),
      studioNode('sat', 'Saturation', 140, 40, { amount: 1.45 }),
      groupOutput('out', 420, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'flow', 'paletteIn', '#ff5cf0'),
      edge('e2', 'flow', 'frame', 'blur', 'frame'),
      edge('e3', 'blur', 'frame', 'sat', 'frame'),
      edge('e4', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Amber Vapor',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#22112e',
        anchorB: '#d86a4d',
        anchorC: '#ffc14f',
        points: 6,
      }),
      studioNode('blobs', 'Blobs', -460, 40, {
        speed: 0.16,
        scale: 0.58,
        count: 4,
      }),
      studioNode('mirror', 'Mirror', -140, 40, {
        mirrorMode: 'vertical',
        glow: true,
        glowAmount: 0.14,
      }),
      studioNode('kale', 'Kaleidoscope', 160, 40, { segments: 5 }),
      studioNode('blur', 'Blur2D', 460, 40, { amount: 0.12 }),
      studioNode('sat', 'Saturation', 740, 40, { amount: 1.5 }),
      groupOutput('out', 1020, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'blobs', 'paletteIn', '#ff5cf0'),
      edge('e2', 'blobs', 'frame', 'mirror', 'frame'),
      edge('e3', 'mirror', 'frame', 'kale', 'frame'),
      edge('e4', 'kale', 'frame', 'blur', 'frame'),
      edge('e5', 'blur', 'frame', 'sat', 'frame'),
      edge('e6', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Quiet Harbor',
    [
      studioNode('backdrop', 'GradientFrame', -760, -80, {
        rA: 4,
        gA: 22,
        bA: 68,
        rB: 18,
        gB: 104,
        bB: 120,
        vertical: true,
      }),
      studioNode('pal', 'PaletteSelector', -760, 200, { palette: 'ocean' }),
      studioNode('pac', 'Pacifica', -420, 200, { speed: 0.12, scale: 0.46 }),
      studioNode('blend', 'Blend', -100, 60, { blendMode: 'screen', amount: 0.2 }),
      studioNode('mirror', 'Mirror', 200, 60, {
        mirrorMode: 'vertical',
        glow: true,
        glowAmount: 0.1,
      }),
      studioNode('kale', 'Kaleidoscope', 500, 60, { segments: 4 }),
      studioNode('blur', 'Blur2D', 780, 60, { amount: 0.07 }),
      studioNode('sat', 'Saturation', 1060, 60, { amount: 1.22 }),
      groupOutput('out', 1340, 60),
    ],
    [
      edge('e1', 'pal', 'palette', 'pac', 'paletteIn', '#ff5cf0'),
      edge('e2', 'backdrop', 'frame', 'blend', 'a'),
      edge('e3', 'pac', 'frame', 'blend', 'b'),
      edge('e4', 'blend', 'frame', 'mirror', 'frame'),
      edge('e5', 'mirror', 'frame', 'kale', 'frame'),
      edge('e6', 'kale', 'frame', 'blur', 'frame'),
      edge('e7', 'blur', 'frame', 'sat', 'frame'),
      edge('e8', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Lantern Orbit',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#1e103a',
        anchorB: '#ff9e45',
        anchorC: '#ffd85a',
        points: 6,
      }),
      studioNode('scan', 'Scanner', -460, 40, {
        speed: 0.12,
        width: 3,
        fade: 0.78,
        axis: 'horizontal',
      }),
      studioNode('array', 'Array', -120, 40, {
        count: 8,
        offsetX: 1.5,
        offsetY: 0,
        angle: 45,
        scale: 0.88,
        falloff: 0.8,
        blendMode: 'lighten',
      }),
      studioNode('blur', 'Blur2D', 220, 40, { amount: 0.16 }),
      studioNode('sat', 'Saturation', 500, 40, { amount: 1.45 }),
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
  pattern(
    'Boreal Loom',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#061726',
        anchorB: '#16a37e',
        anchorC: '#9dffe4',
        points: 6,
      }),
      studioNode('gabor', 'GaborNoise', -460, 40, {
        speed: 0.08,
        scale: 0.48,
        frequency: 0.85,
        orientation: 70,
        seed: 688,
      }),
      studioNode('kale', 'Kaleidoscope', -140, 40, { segments: 4 }),
      studioNode('blur', 'Blur2D', 140, 40, { amount: 0.08 }),
      studioNode('sat', 'Saturation', 420, 40, { amount: 1.65 }),
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
  pattern(
    'Petal Drift',
    [
      studioNode('backdrop', 'GradientFrame', -1040, -80, {
        rA: 28,
        gA: 10,
        bA: 36,
        rB: 96,
        gB: 18,
        bB: 74,
        vertical: false,
      }),
      studioNode('pal', 'Poline', -1040, 220, {
        anchorA: '#2a1234',
        anchorB: '#ff5ea8',
        anchorC: '#ffb6d8',
        points: 6,
      }),
      studioNode('boids', 'Boids', -660, 80, {
        speed: 0.18,
        count: 28,
        separation: 0.38,
        alignment: 0.62,
        cohesion: 0.48,
        visualRange: 5,
        colorMode: 'palette',
        seed: 233,
      }),
      studioNode('blur', 'Blur2D', -340, 80, { amount: 0.18 }),
      studioNode('blend', 'Blend', -20, 80, { blendMode: 'screen', amount: 0.36 }),
      studioNode('sat', 'Saturation', 280, 80, { amount: 1.35 }),
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
  pattern(
    'Cathedral Glass',
    [
      studioNode('pal', 'Poline', -760, 40, {
        anchorA: '#102040',
        anchorB: '#25e6c8',
        anchorC: '#78a6ff',
        points: 7,
      }),
      studioNode('grad', 'PaletteGradient', -460, 40, {
        angle: 90,
        repeat: 5,
        speed: 0.03,
      }),
      studioNode('mirror', 'Mirror', -140, 40, {
        mirrorMode: 'quad',
        glow: true,
        glowAmount: 0.2,
      }),
      studioNode('kale', 'Kaleidoscope', 160, 40, { segments: 7 }),
      studioNode('blur', 'Blur2D', 440, 40, { amount: 0.1 }),
      studioNode('sat', 'Saturation', 720, 40, { amount: 1.7 }),
      groupOutput('out', 1000, 40),
    ],
    [
      edge('e1', 'pal', 'palette', 'grad', 'paletteIn', '#ff5cf0'),
      edge('e2', 'grad', 'frame', 'mirror', 'frame'),
      edge('e3', 'mirror', 'frame', 'kale', 'frame'),
      edge('e4', 'kale', 'frame', 'blur', 'frame'),
      edge('e5', 'blur', 'frame', 'sat', 'frame'),
      edge('e6', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Ink Bloom',
    [
      studioNode('backdrop', 'GradientFrame', -1040, -80, {
        rA: 6,
        gA: 12,
        bA: 40,
        rB: 18,
        gB: 46,
        bB: 110,
        vertical: true,
      }),
      studioNode('pal', 'Poline', -1040, 220, {
        anchorA: '#090f28',
        anchorB: '#3055ff',
        anchorC: '#2df0c8',
        points: 6,
      }),
      studioNode('noise', 'FractalNoise', -660, 80, {
        speed: 0.1,
        scale: 0.4,
        octaves: 5,
        seed: 477,
      }),
      studioNode('mirror', 'Mirror', -340, 80, { mirrorMode: 'quad', glow: false }),
      studioNode('blend', 'Blend', -20, 80, { blendMode: 'overlay', amount: 0.34 }),
      studioNode('blur', 'Blur2D', 280, 80, { amount: 0.04 }),
      studioNode('sat', 'Saturation', 560, 80, { amount: 1.5 }),
      groupOutput('out', 840, 80),
    ],
    [
      edge('e1', 'pal', 'palette', 'noise', 'paletteIn', '#ff5cf0'),
      edge('e2', 'noise', 'frame', 'mirror', 'frame'),
      edge('e3', 'backdrop', 'frame', 'blend', 'a'),
      edge('e4', 'mirror', 'frame', 'blend', 'b'),
      edge('e5', 'blend', 'frame', 'blur', 'frame'),
      edge('e6', 'blur', 'frame', 'sat', 'frame'),
      edge('e7', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
  pattern(
    'Starlace Canopy',
    [
      studioNode('pal', 'Poline', -1040, 220, {
        anchorA: '#0d1535',
        anchorB: '#4b77ff',
        anchorC: '#ff66c7',
        points: 6,
      }),
      studioNode('grad', 'PaletteGradient', -1040, -80, {
        angle: 325,
        repeat: 2,
        speed: 0.04,
      }),
      studioNode('twinkle', 'TwinkleFox', -660, 220, {
        speed: 0.16,
        density: 0.68,
        seed: 844,
      }),
      studioNode('blend', 'Blend', -340, 80, { blendMode: 'screen', amount: 0.18 }),
      studioNode('blur', 'Blur2D', -20, 80, { amount: 0.14 }),
      studioNode('sat', 'Saturation', 260, 80, { amount: 1.55 }),
      groupOutput('out', 540, 80),
    ],
    [
      edge('e1', 'pal', 'palette', 'grad', 'paletteIn', '#ff5cf0'),
      edge('e2', 'pal', 'palette', 'twinkle', 'paletteIn', '#ff5cf0'),
      edge('e3', 'grad', 'frame', 'blend', 'a'),
      edge('e4', 'twinkle', 'frame', 'blend', 'b'),
      edge('e5', 'blend', 'frame', 'blur', 'frame'),
      edge('e6', 'blur', 'frame', 'sat', 'frame'),
      edge('e7', 'sat', 'frame', 'out', 'frame'),
    ],
  ),
]

const AUDIO_PATTERN_SEEDS = [
  auroraCometFoundry,
  auroraEchoChoir,
  bassCathedralCollapse,
  chromasonicVortex,
  chromaticOrbitReactor,
  colorTrails,
  glassRainResonator,
  kaleidoBassSingularity,
  laserMonsoonParade,
  mainstageConfettiSingularity,
  morphingNeonRiver,
  percussionSymphony,
  polarWaveHaloEngine,
  prismStorm,
  prismaticWaterfallCathedral,
  quadrantPulseObservatory,
  rgbBlobThunderGarden,
  spectralFieldVortex,
  spiralusPercussionShrine,
  tidalGlassMeditation,
] as unknown as BundledSeed[]

function materializeBundledPatterns(
  patterns: BundledSeed[],
  prefix: string,
  categoryId: string,
  createdAtBase: number,
): SavedPattern[] {
  return patterns.map((entry, index) => ({
    ...entry,
    id: `bundled-${prefix}-${String(index + 1).padStart(2, '0')}`,
    createdAt: createdAtBase + index,
    categoryId,
    bundled: true,
  }))
}

/** Curated standard patterns are the included non-audio showcase shelf. */
export const STANDARD_BUNDLED_PATTERNS = materializeBundledPatterns(
  STANDARD_PATTERN_SEEDS,
  'standard',
  STANDARD_CATEGORY_ID,
  Date.UTC(2026, 6, 29, 0, 0, 0),
)

/** Curated beta patterns are immutable audio-reactive examples. */
export const AUDIO_BUNDLED_PATTERNS = materializeBundledPatterns(
  AUDIO_PATTERN_SEEDS,
  'audio',
  AUDIO_REACTIVE_CATEGORY_ID,
  Date.UTC(2026, 6, 29, 12, 0, 0),
)

export const BUNDLED_PATTERNS: SavedPattern[] = [
  ...STANDARD_BUNDLED_PATTERNS,
  ...AUDIO_BUNDLED_PATTERNS,
]
