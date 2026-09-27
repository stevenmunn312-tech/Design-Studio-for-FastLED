/** Generate the real Phase 0 pattern-node graph used by its firmware compile gate. */
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

const nodes = [
  node('circle', 'ShapeField', { shape: 'circle', fieldMode: 'distance', size: 0.3, range: 0.35 }),
  node('square', 'ShapeField', { shape: 'polygon', fieldMode: 'distance', size: 0.3, sides: 4, rotation: 45, range: 0.35 }),
  node('morph', 'FieldLerp', { t: 0.5 }),
  node('levels', 'FieldLevels', { low: 0.5, high: 0.5, steps: 1 }),
  node('color', 'FieldToFrame', { palette: 'ocean', brightness: 1 }),
  node('outline', 'Shape', { shape: 'polygon', size: 6, sides: 5.5, filled: false, thickness: 1, wrap: false }),
  node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5 }),
]

const edges = [
  edge('circle-a', 'circle', 'field', 'morph', 'a'),
  edge('square-b', 'square', 'field', 'morph', 'b'),
  edge('morph-levels', 'morph', 'field', 'levels', 'field'),
  edge('levels-color', 'levels', 'field', 'color', 'field'),
  edge('color-outline', 'color', 'frame', 'outline', 'base'),
  edge('outline-out', 'outline', 'frame', 'out', 'frame'),
]

const source = generateCpp(nodes, edges)
for (const marker of ['/* ShapeField:', '/* FieldLerp */', '/* FieldLevels */', '_sdfMorphPolygon']) {
  if (!source.includes(marker)) throw new Error(`Phase 0 fixture is missing ${marker}`)
}
if ((source.match(/static inline float _sdfPolygon\(/g)?.length ?? 0) !== 1) {
  throw new Error('Phase 0 fixture must emit the shared SDF helper exactly once')
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/pattern-node-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'phase0.ino'), source, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  phase0: {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
  },
}, null, 2)}\n`, 'utf8')
console.log(`wrote the Phase 0 pattern-node compile fixture to ${outputDir}`)
