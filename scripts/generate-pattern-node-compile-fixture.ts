/** Generate the real pattern-node graphs used by the Phase 0–8 firmware gates. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import { BUNDLED_PATTERNS } from '../src/state/bundledPatterns'
import type { StudioEdge, StudioNode } from '../src/state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType,
      nodeType,
      category: definition?.category ?? 'field',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

const phase0Nodes = [
  node('circle', 'ShapeField', { shape: 'circle', fieldMode: 'distance', size: 0.3, range: 0.35 }),
  node('square', 'ShapeField', { shape: 'polygon', fieldMode: 'distance', size: 0.3, sides: 4, rotation: 45, range: 0.35 }),
  node('morph', 'FieldLerp', { t: 0.5 }),
  node('levels', 'FieldLevels', { low: 0.5, high: 0.5, steps: 1 }),
  node('color', 'FieldToFrame', { palette: 'ocean', brightness: 1 }),
  node('outline', 'Shape', { shape: 'polygon', size: 6, sides: 5.5, filled: false, thickness: 1, wrap: false }),
  node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
]

const phase0Edges = [
  edge('circle-a', 'circle', 'field', 'morph', 'a'),
  edge('square-b', 'square', 'field', 'morph', 'b'),
  edge('morph-levels', 'morph', 'field', 'levels', 'field'),
  edge('levels-color', 'levels', 'field', 'color', 'field'),
  edge('color-outline', 'color', 'frame', 'outline', 'base'),
  edge('outline-out', 'outline', 'frame', 'out', 'frame'),
]

const phase0 = generateCpp(phase0Nodes, phase0Edges)
for (const marker of ['/* ShapeField:', '/* FieldLerp */', '/* FieldLevels */', '_sdfMorphPolygon']) {
  if (!phase0.includes(marker)) throw new Error(`Phase 0 fixture is missing ${marker}`)
}
if ((phase0.match(/static inline float _sdfPolygon\(/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 0 fixture must emit the shared SDF helper exactly once')
}

const phase1Nodes = [
  node('hex', 'SliceTiling', { lattice: 'hex', depth: 3, symmetry: 'dihedral', preset: 'snowflake', cells: 1.5, spin: 12, warp: 0.35, morph: 0.4, edge: 0.03, seed: 3 }),
  node('square', 'SliceTiling', { lattice: 'square', depth: 2, symmetry: 'rotational', preset: 'braid', cells: 2, rotation: 15, edge: 0 }),
  node('triangle', 'SliceTiling', { lattice: 'triangle', depth: 1, symmetry: 'dihedral', preset: 'custom', bits: '6', bitsB: '9', cells: 2.5, morph: 0.25 }),
  node('shade', 'FieldMath', { fieldOp: 'multiply' }),
  node('mix-a', 'FieldMath', { fieldOp: 'add' }),
  node('mix-b', 'FieldMath', { fieldOp: 'add' }),
  node('color', 'FieldToFrame', { palette: 'rainbow', brightness: 1 }),
  node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
]
const phase1Edges = [
  edge('hex-field', 'hex', 'field', 'shade', 'a'),
  edge('hex-cell', 'hex', 'cell', 'shade', 'b'),
  edge('shade-a', 'shade', 'field', 'mix-a', 'a'),
  edge('square-b', 'square', 'field', 'mix-a', 'b'),
  edge('mix-a-a', 'mix-a', 'field', 'mix-b', 'a'),
  edge('triangle-b', 'triangle', 'field', 'mix-b', 'b'),
  edge('mix-color', 'mix-b', 'field', 'color', 'field'),
  edge('color-out', 'color', 'frame', 'out', 'frame'),
]
const phase1 = generateCpp(phase1Nodes, phase1Edges)
for (const marker of [
  '/* SliceTiling: hex', '/* SliceTiling: square', '/* SliceTiling: triangle', '_sliceBuildMatrices',
  'float field_hex_cell[NUM_LEDS];', '_latticeCellValue(_cell.a,_cell.b,_cell.flipped,3u)',
]) {
  if (!phase1.includes(marker)) throw new Error(`Phase 1 fixture is missing ${marker}`)
}
if ((phase1.match(/static inline _LatticeCell _squareCell/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 1 fixture must emit the shared lattice helper exactly once')
}

const phase2Nodes = [
  node('noise', 'Noise', { noiseType: 'simplex', speed: 0.2, scale: 0.42, palette: 'synthwave' }),
  node('dx', 'FieldFormula', { formula: '0.5 + 0.22*sin(angle*3+t)' }),
  node('dy', 'FieldFormula', { formula: '0.5 + 0.22*cos(angle*2-t*0.7)' }),
  node('warp', 'FrameWarp', { strength: 2.5, zoom: 1.02, rotate: 2, edgeMode: 'wrap', sampling: 'bilinear' }),
  node('feedback', 'FrameFeedback', { delayFrames: 2, fade: 0.08, amount: 0.58, blendMode: 'screen' }),
  node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
]
const phase2Edges = [
  edge('noise-warp', 'noise', 'frame', 'warp', 'frame'),
  edge('dx-warp', 'dx', 'field', 'warp', 'dx'),
  edge('dy-warp', 'dy', 'field', 'warp', 'dy'),
  edge('warp-feedback', 'warp', 'frame', 'feedback', 'frame'),
  edge('feedback-out', 'feedback', 'frame', 'out', 'frame'),
]
const phase2 = generateCpp(phase2Nodes, phase2Edges)
for (const marker of [
  '/* FrameWarp: wrap, bilinear */', '_sampleFrame(buf_noise,_sx,_sy,1,true)',
  'float field_dx[NUM_LEDS];', 'float field_dy[NUM_LEDS];', '// FrameFeedback: 2-frame recursive ring buffer',
]) {
  if (!phase2.includes(marker)) throw new Error(`Phase 2 fixture is missing ${marker}`)
}
if ((phase2.match(/static inline CRGB _sampleFrame\(/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 2 fixture must emit the shared frame sampler exactly once')
}

const phase3Nodes = [
  node('source', 'FieldFormula', { formula: '(x+2*y)/(3*(W-1))' }),
  node('field-symmetry', 'FieldSymmetry', {
    group: 'p4m', cells: 2.4, rotation: 12, spin: 18, offsetX: 0.15, offsetY: -0.2,
  }),
  node('color', 'FieldToFrame', { palette: 'synthwave', brightness: 1 }),
  node('symmetry', 'Symmetry', {
    group: 'p6m', cells: 1.8, rotation: -8, spin: -12, offsetX: -0.1, offsetY: 0.25,
  }),
  node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
]
const phase3Edges = [
  edge('source-field-symmetry', 'source', 'field', 'field-symmetry', 'field'),
  edge('field-symmetry-color', 'field-symmetry', 'field', 'color', 'field'),
  edge('color-symmetry', 'color', 'frame', 'symmetry', 'frame'),
  edge('symmetry-out', 'symmetry', 'frame', 'out', 'frame'),
]
const phase3 = generateCpp(phase3Nodes, phase3Edges)
for (const marker of [
  '/* FieldSymmetry: p4m */', '/* Symmetry: p6m */', '_squareCell(', '_hexCell(',
  '_foldWallpaper(_cell.x,_cell.y,5,_foldX,_foldY)', '_foldWallpaper(_cell.x,_cell.y,8,_foldX,_foldY)',
  '_sampleFrame(buf_color,_sx,_sy,0,true)',
]) {
  if (!phase3.includes(marker)) throw new Error(`Phase 3 fixture is missing ${marker}`)
}
if ((phase3.match(/static inline void _foldWallpaper/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 3 fixture must emit the shared symmetry helper exactly once')
}
if ((phase3.match(/static inline _LatticeCell _squareCell/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 3 fixture must emit the shared lattice helper exactly once')
}
if ((phase3.match(/static inline CRGB _sampleFrame\(/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 3 fixture must emit the shared frame sampler exactly once')
}

const phase4Nodes = [
  node('square', 'Truchet', {
    lattice: 'square', motif: 'diagonals', cells: 4.2, lineWidth: 0.11,
    scroll: 0.35, rotation: 14, seed: 23,
  }),
  node('hex', 'Truchet', {
    lattice: 'hex', motif: 'hexArcs', cells: 3.4, lineWidth: 0.09,
    scroll: -0.2, rotation: -9, seed: 51,
  }),
  node('mix', 'FieldMath', { fieldOp: 'max' }),
  node('color', 'FieldToFrame', { palette: 'synthwave', brightness: 1 }),
  node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
]
const phase4Edges = [
  edge('square-mix', 'square', 'field', 'mix', 'a'),
  edge('hex-mix', 'hex', 'field', 'mix', 'b'),
  edge('mix-color', 'mix', 'field', 'color', 'field'),
  edge('color-out', 'color', 'frame', 'out', 'frame'),
]
const phase4 = generateCpp(phase4Nodes, phase4Edges)
for (const marker of [
  '/* Truchet: square, diagonals */', '/* Truchet: hex, hexArcs */',
  '_truchetDistance(0,1,', '_truchetDistance(1,3,', '_latticeHashBits(', '_truchetLine(',
]) {
  if (!phase4.includes(marker)) throw new Error(`Phase 4 fixture is missing ${marker}`)
}
if ((phase4.match(/static inline float _truchetDistance/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 4 fixture must emit the shared Truchet helper exactly once')
}
if ((phase4.match(/static inline _LatticeCell _squareCell/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 4 fixture must emit the shared lattice helper exactly once')
}

// Phase 5 prices its RAM at two sizes, so one graph is generated twice.
function phase5Sketch(size: number): string {
  const nodes = [
    node('pulse', 'Interval', { interval: 8 }),
    node('turing', 'TuringField', { scales: 3, baseRadius: 1, speed: 2, stepSize: 0.05, seed: 9 }),
    node('rd', 'ReactionDiffusion', { rdPreset: 'coral', speed: 8, palette: 'ocean', seed: 5 }),
    node('mix', 'FieldMath', { fieldOp: 'max' }),
    node('color', 'FieldToFrame', { palette: 'lava', brightness: 1 }),
    node('out', 'MatrixOutput', { form: 'matrix', width: size, height: size, dataPin: 5 }),
  ]
  const edges = [
    edge('pulse-reset', 'pulse', 'pulse', 'turing', 'reset'),
    edge('turing-mix', 'turing', 'field', 'mix', 'a'),
    edge('rd-mix', 'rd', 'field', 'mix', 'b'),
    edge('mix-color', 'mix', 'field', 'color', 'field'),
    edge('color-out', 'color', 'frame', 'out', 'frame'),
  ]
  const sketch = generateCpp(nodes, edges)
  for (const marker of [
    '/* Turing Field: radii 1,2,4 */', 'static const int _tf_turingr[3]={1,2,4};',
    '_turingStep(_tf_turinga,_tf_turingp,WIDTH,HEIGHT,_tf_turingr,3,_step);',
    'float _f=0.04f, _k=0.0625f;', '::memcpy(field_rd,_vn_rd,NUM_LEDS*sizeof(float));',
  ]) {
    if (!sketch.includes(marker)) throw new Error(`Phase 5 fixture (${size}×${size}) is missing ${marker}`)
  }
  if ((sketch.match(/static void _turingStep\(/g)?.length ?? 0) !== 1) {
    throw new Error('Phase 5 fixture must emit the shared Turing helper exactly once')
  }
  if ((sketch.match(/float _worleyHash\(/g)?.length ?? 0) !== 1) {
    throw new Error('Phase 5 fixture must emit the Worley hash exactly once')
  }
  return sketch
}
const phase5 = phase5Sketch(16)
const phase5Large = phase5Sketch(32)

// Phase 6 records the flash each baked harmonic costs, so one graph is
// generated with two table sizes and nothing else changed.
const CUSTOM_OUTLINE = '0,0.9 0.3,0.2 0.9,0.1 0.4,-0.3 0.6,-0.9 0,-0.5 -0.6,-0.9 -0.4,-0.3 -0.9,0.1 -0.3,0.2'
function phase6Sketch(maxHarmonics: number): string {
  const nodes = [
    node('base', 'Plasma', { speed: 0.3, palette: 'ocean' }),
    node('dim', 'BrightnessMod', { brightness: 0.3 }),
    node('lfo', 'BeatSin', { bpm: 6, low: 1, high: 16 }),
    node('star', 'FourierEpicycles', { outline: 'star', maxHarmonics, speed: 0.25, persistence: 0.995 }),
    node('custom', 'FourierEpicycles', {
      outline: 'custom', customPoints: CUSTOM_OUTLINE, maxHarmonics, speed: -0.2,
      showCircles: false, r: 80, g: 200, b: 255,
    }),
    node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
  ]
  const edges = [
    edge('base-dim', 'base', 'frame', 'dim', 'frame'),
    edge('dim-star', 'dim', 'frame', 'star', 'base'),
    edge('lfo-harmonics', 'lfo', 'value', 'star', 'harmonics'),
    edge('star-custom', 'star', 'frame', 'custom', 'base'),
    edge('custom-out', 'custom', 'frame', 'out', 'frame'),
  ]
  const sketch = generateCpp(nodes, edges)
  for (const marker of [
    `/* Fourier Epicycles: star, ${maxHarmonics} terms */`, `/* Fourier Epicycles: custom, ${maxHarmonics} terms */`,
    `static const float _fe_star[${maxHarmonics}][3] PROGMEM`, '_fePen(_fe_custom,', ',0,WIDTH,HEIGHT,_col,&_penX,&_penY);',
    '_feTrail(_fe_startrail,',
  ]) {
    if (!sketch.includes(marker)) throw new Error(`Phase 6 fixture (${maxHarmonics}) is missing ${marker}`)
  }
  if ((sketch.match(/static void _fePen\(/g)?.length ?? 0) !== 1) {
    throw new Error('Phase 6 fixture must emit the shared Fourier helper exactly once')
  }
  return sketch
}
const phase6Small = phase6Sketch(16)
const phase6Large = phase6Sketch(64)

// Phase 7 compiles the shipped starter patterns themselves. Each bundled
// subgraph ends at a Group Output, which becomes the LED output; an audio
// pattern's Group Input becomes an Audio node backed by an INMP441.
function bundledSketch(name: string, markers: string[]): string {
  const saved = BUNDLED_PATTERNS.find((entry) => entry.name === name)
  if (!saved) throw new Error(`Phase 7 fixture: no bundled pattern named ${name}`)
  const nodes: StudioNode[] = []
  const renamed = new Map<string, string>()
  for (const entry of saved.subgraph.nodes) {
    const type = entry.data.nodeType
    if (type === 'GroupOutput') {
      nodes.push(node(entry.id, 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }))
    } else if (type === 'GroupInput') {
      // The Board is the sketch's only target authority; without it the
      // audio engine is not emitted at all.
      nodes.push(node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin' }))
      nodes.push(node('mic', 'MicInput', {}))
      nodes.push(node(entry.id, 'Audio', { sourceId: 'mic' }))
      renamed.set(entry.id, 'audio')
    } else {
      nodes.push(node(entry.id, type, entry.data.properties as Record<string, unknown>))
    }
  }
  const edges = saved.subgraph.edges.map((wire) => edge(
    wire.id, wire.source, renamed.get(wire.source) ?? wire.sourceHandle ?? '', wire.target, wire.targetHandle ?? '',
  ))
  const sketch = generateCpp(nodes, edges)
  for (const marker of markers) {
    if (!sketch.includes(marker)) throw new Error(`Phase 7 fixture ${name} is missing ${marker}`)
  }
  return sketch
}
const phase7Rosette = bundledSketch('Breathing Rosette', ['/* SliceTiling:', 'float field_slices[NUM_LEDS];'])
const phase7Mirage = bundledSketch('Liquid Mirage', ['/* FrameWarp: wrap, bilinear */', '// FrameFeedback:', 'float field_dx[NUM_LEDS];'])
const phase7Maze = bundledSketch('Truchet Beat Maze', ['/* Truchet: square, tenPrint */', 'fl::audio::Processor'])

// Phase 8 wires one detector per graph to a real INMP441 engine. The Vibe
// fixture proves every FastLED getter the engine publishes exists in the
// pinned FastLED and that the node's emitter reads only those globals.
function phase8VibeSketch(profileId: string): string {
  const nodes = [
    node('board', 'Board', { profileId }),
    node('mic', 'MicInput', {}),
    node('audio', 'Audio', { sourceId: 'mic' }),
    node('vibe', 'Vibe', { gain: 1.25 }),
    node('level', 'MapRange', { inMin: 0.4, inMax: 1.8, outMin: 0.25, outMax: 1 }),
    node('plasma', 'Plasma', { speed: 0.35 }),
    node('dim', 'BrightnessMod'),
    node('spikes', 'Counter'),
    node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
  ]
  const edges = [
    edge('audio-vibe', 'audio', 'audio', 'vibe', 'audio'),
    edge('vibe-level', 'vibe', 'bass', 'level', 'value'),
    edge('level-dim', 'level', 'result', 'dim', 'brightness'),
    edge('plasma-dim', 'plasma', 'frame', 'dim', 'frame'),
    edge('spike-count', 'vibe', 'trebleSpike', 'spikes', 'trigger'),
    edge('dim-out', 'dim', 'frame', 'out', 'frame'),
  ]
  const sketch = generateCpp(nodes, edges)
  for (const marker of [
    '_audioVibeBass = _audioProcessor->getVibeBass();', '_audioVibeTrebleSpike = _audioProcessor->isVibeTrebSpike();',
    '(void)_audioProcessor->getVibeBass();', 'float n_vibe_bass = _audioVibeBass * _vibeGain_vibe',
  ]) {
    if (!sketch.includes(marker)) throw new Error(`Phase 8 Vibe fixture is missing ${marker}`)
  }
  return sketch
}
const phase8Vibe = phase8VibeSketch('espressif-esp32-s3-devkitc-1')
const phase8VibeClassic = phase8VibeSketch('esp32-generic-devkit-38pin')

// Song Structure reads six getters and registers five callbacks; the fixture
// proves the pinned FastLED has every one and the node reads only those globals.
function phase8StructureSketch(profileId: string): string {
  const nodes = [
    node('board', 'Board', { profileId }),
    node('mic', 'MicInput', {}),
    node('audio', 'Audio', { sourceId: 'mic' }),
    node('structure', 'SongStructure'),
    node('ripples', 'RainRipples'),
    node('plasma', 'Plasma', { speed: 0.3 }),
    node('dim', 'BrightnessMod'),
    node('mix', 'Blend'),
    node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
  ]
  const edges = [
    edge('audio-structure', 'audio', 'audio', 'structure', 'audio'),
    edge('drop-ripples', 'structure', 'drop', 'ripples', 'trigger'),
    edge('arousal-dim', 'structure', 'arousal', 'dim', 'brightness'),
    edge('plasma-dim', 'plasma', 'frame', 'dim', 'frame'),
    edge('dim-mix', 'dim', 'frame', 'mix', 'a'),
    edge('ripples-mix', 'ripples', 'frame', 'mix', 'b'),
    edge('mix-out', 'mix', 'frame', 'out', 'frame'),
  ]
  const sketch = generateCpp(nodes, edges)
  for (const marker of [
    '_audioProcessor->onDownbeat(', '_audioProcessor->onBuildupStart(', '_audioProcessor->onBuildupEnd(',
    '_audioProcessor->onDrop(', '_audioProcessor->onTempoStable(', '_audioProcessor->onTempoUnstable(',
    '_audioProcessor->getMeasurePhase()', '_audioProcessor->getCurrentBeatNumber()',
    '_audioProcessor->getBuildupProgress()', '_audioProcessor->getDropImpact()',
    '_audioProcessor->getMoodValence()', '_audioProcessor->getMoodArousal()',
  ]) {
    if (!sketch.includes(marker)) throw new Error(`Phase 8 Song Structure fixture is missing ${marker}`)
  }
  return sketch
}
const phase8Structure = phase8StructureSketch('esp32-generic-devkit-38pin')
const phase8StructureS3 = phase8StructureSketch('espressif-esp32-s3-devkitc-1')

// Pitch Detect runs FastLED's Pitch and Note arithmetic over the 512-sample chunk
// and takes the key from Processor::onKey. The fixture proves the helper
// compiles, that the pinned FastLED has getSample()/pcm()/timestamp()/rms() and
// the key callbacks, and that the node reads only the published globals.
function phase8PitchSketch(profileId: string): string {
  const nodes = [
    node('board', 'Board', { profileId }),
    node('mic', 'MicInput', {}),
    node('audio', 'Audio', { sourceId: 'mic' }),
    node('pitch', 'PitchDetect'),
    node('level', 'MapRange', { inMin: 0, inMax: 1, outMin: 0.25, outMax: 1 }),
    node('plasma', 'Plasma', { speed: 0.3 }),
    node('dim', 'BrightnessMod'),
    node('notes', 'Counter'),
    node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
  ]
  const edges = [
    edge('audio-pitch', 'audio', 'audio', 'pitch', 'audio'),
    edge('pitch-level', 'pitch', 'confidence', 'level', 'value'),
    edge('level-dim', 'level', 'result', 'dim', 'brightness'),
    edge('plasma-dim', 'plasma', 'frame', 'dim', 'frame'),
    edge('note-count', 'pitch', 'noteOn', 'notes', 'trigger'),
    edge('dim-out', 'dim', 'frame', 'out', 'frame'),
  ]
  const sketch = generateCpp(nodes, edges)
  for (const marker of [
    'static float _pitchDetect(const fl::i16* pcm, size_t n, float* confOut)', 'const fl::audio::Sample& sample = _audioProcessor->getSample();',
    'sample.timestamp()', 'sample.rms()', '_audioProcessor->onKey([](const fl::audio::detector::Key& key)',
    '_audioProcessor->onKeyEnd(', '  _audioPitchStep();', 'float n_pitch_hz = _audioPitchHz',
  ]) {
    if (!sketch.includes(marker)) throw new Error(`Phase 8 Pitch fixture is missing ${marker}`)
  }
  return sketch
}
const phase8Pitch = phase8PitchSketch('esp32-generic-devkit-38pin')
const phase8PitchS3 = phase8PitchSketch('espressif-esp32-s3-devkitc-1')

// Waveform chains a line trace and a ring trace over a Plasma base, so both
// column and radial emitters compile, and proves the sketch decimates the
// processor's chunk into `_audioWave` with the getters the pinned FastLED has.
function phase8WaveformSketch(profileId: string): string {
  const nodes = [
    node('board', 'Board', { profileId }),
    node('mic', 'MicInput', {}),
    node('audio', 'Audio', { sourceId: 'mic' }),
    node('plasma', 'Plasma', { speed: 0.3 }),
    node('line', 'Waveform', { style: 'line', gain: 3, palette: 'citrus' }),
    node('ring', 'Waveform', { style: 'ring', gain: 2, thickness: 1.5, smoothing: 0.4, palette: 'lava' }),
    node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
  ]
  const edges = [
    edge('audio-line', 'audio', 'audio', 'line', 'audio'),
    edge('audio-ring', 'audio', 'audio', 'ring', 'audio'),
    edge('plasma-line', 'plasma', 'frame', 'line', 'base'),
    edge('line-ring', 'line', 'frame', 'ring', 'base'),
    edge('ring-out', 'ring', 'frame', 'out', 'frame'),
  ]
  const sketch = generateCpp(nodes, edges)
  for (const marker of [
    'float _audioWave[128] = {0};', 'static void _audioWaveStep()', '  _audioWaveStep();',
    'const fl::audio::Sample& sample = _audioProcessor->getSample();', '// Waveform · line', '// Waveform · ring',
  ]) {
    if (!sketch.includes(marker)) throw new Error(`Phase 8 Waveform fixture is missing ${marker}`)
  }
  return sketch
}
const phase8Waveform = phase8WaveformSketch('esp32-generic-devkit-38pin')
const phase8WaveformS3 = phase8WaveformSketch('espressif-esp32-s3-devkitc-1')

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/pattern-node-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'phase0.ino'), phase0, 'utf8')
writeFileSync(resolve(outputDir, 'phase1.ino'), phase1, 'utf8')
writeFileSync(resolve(outputDir, 'phase2.ino'), phase2, 'utf8')
writeFileSync(resolve(outputDir, 'phase3.ino'), phase3, 'utf8')
writeFileSync(resolve(outputDir, 'phase4.ino'), phase4, 'utf8')
writeFileSync(resolve(outputDir, 'phase5.ino'), phase5, 'utf8')
writeFileSync(resolve(outputDir, 'phase5-32.ino'), phase5Large, 'utf8')
writeFileSync(resolve(outputDir, 'phase6-16.ino'), phase6Small, 'utf8')
writeFileSync(resolve(outputDir, 'phase6-64.ino'), phase6Large, 'utf8')
writeFileSync(resolve(outputDir, 'phase7-rosette.ino'), phase7Rosette, 'utf8')
writeFileSync(resolve(outputDir, 'phase7-mirage.ino'), phase7Mirage, 'utf8')
writeFileSync(resolve(outputDir, 'phase7-maze.ino'), phase7Maze, 'utf8')
writeFileSync(resolve(outputDir, 'phase8-vibe-s3.ino'), phase8Vibe, 'utf8')
writeFileSync(resolve(outputDir, 'phase8-vibe.ino'), phase8VibeClassic, 'utf8')
writeFileSync(resolve(outputDir, 'phase8-structure.ino'), phase8Structure, 'utf8')
writeFileSync(resolve(outputDir, 'phase8-structure-s3.ino'), phase8StructureS3, 'utf8')
writeFileSync(resolve(outputDir, 'phase8-pitch.ino'), phase8Pitch, 'utf8')
writeFileSync(resolve(outputDir, 'phase8-pitch-s3.ino'), phase8PitchS3, 'utf8')
writeFileSync(resolve(outputDir, 'phase8-waveform.ino'), phase8Waveform, 'utf8')
writeFileSync(resolve(outputDir, 'phase8-waveform-s3.ino'), phase8WaveformS3, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  phase0: {
    bytes: Buffer.byteLength(phase0),
    sha256: createHash('sha256').update(phase0).digest('hex'),
  },
  phase1: {
    bytes: Buffer.byteLength(phase1),
    sha256: createHash('sha256').update(phase1).digest('hex'),
  },
  phase2: {
    bytes: Buffer.byteLength(phase2),
    sha256: createHash('sha256').update(phase2).digest('hex'),
  },
  phase3: {
    bytes: Buffer.byteLength(phase3),
    sha256: createHash('sha256').update(phase3).digest('hex'),
  },
  phase4: {
    bytes: Buffer.byteLength(phase4),
    sha256: createHash('sha256').update(phase4).digest('hex'),
  },
  phase5: {
    bytes: Buffer.byteLength(phase5),
    sha256: createHash('sha256').update(phase5).digest('hex'),
  },
  'phase5-32': {
    bytes: Buffer.byteLength(phase5Large),
    sha256: createHash('sha256').update(phase5Large).digest('hex'),
  },
  'phase6-16': {
    bytes: Buffer.byteLength(phase6Small),
    sha256: createHash('sha256').update(phase6Small).digest('hex'),
  },
  'phase6-64': {
    bytes: Buffer.byteLength(phase6Large),
    sha256: createHash('sha256').update(phase6Large).digest('hex'),
  },
  ...Object.fromEntries(([
    ['phase7-rosette', phase7Rosette], ['phase7-mirage', phase7Mirage], ['phase7-maze', phase7Maze],
    ['phase8-vibe-s3', phase8Vibe], ['phase8-vibe', phase8VibeClassic],
    ['phase8-structure', phase8Structure], ['phase8-structure-s3', phase8StructureS3],
    ['phase8-pitch', phase8Pitch], ['phase8-pitch-s3', phase8PitchS3],
    ['phase8-waveform', phase8Waveform], ['phase8-waveform-s3', phase8WaveformS3],
  ] as const).map(([key, sketch]) => [key, {
    bytes: Buffer.byteLength(sketch),
    sha256: createHash('sha256').update(sketch).digest('hex'),
  }])),
}, null, 2)}\n`, 'utf8')
console.log(`wrote the Phase 0–8 pattern-node compile fixtures to ${outputDir}`)
