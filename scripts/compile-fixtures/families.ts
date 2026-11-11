/**
 * Generate the board-family gate: one ordinary pattern sketch (a Scanner into
 * an LED output) compiled for every non-ESP32 family. Pattern code
 * calls `min`, `max` and the FastLED math the other family legs never reach,
 * and each core declares those names differently.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

// 30 LEDs: the sketch has to fit an Uno's 2 KB of RAM.
const source = generateCpp([
  node('scanner', 'Scanner'),
  node('out', 'MatrixOutput', { width: 30, height: 1, dataPin: 5 }),
], [edge('frame', 'scanner', 'frame', 'out', 'frame')])

if (!/\b(?:min|max)\(/.test(source)) throw new Error('pattern: the sketch no longer calls min or max')

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/family-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'pattern.ino'), source, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  pattern: { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') },
}, null, 2)}\n`, 'utf8')
console.log(`wrote the board-family compile fixture to ${outputDir}`)
