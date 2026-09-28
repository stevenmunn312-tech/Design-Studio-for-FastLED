/** Generate the real pattern-node graphs used by the Phase 0–2 firmware gates. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
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

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/pattern-node-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'phase0.ino'), phase0, 'utf8')
writeFileSync(resolve(outputDir, 'phase1.ino'), phase1, 'utf8')
writeFileSync(resolve(outputDir, 'phase2.ino'), phase2, 'utf8')
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
}, null, 2)}\n`, 'utf8')
console.log(`wrote the Phase 0–2 pattern-node compile fixtures to ${outputDir}`)
