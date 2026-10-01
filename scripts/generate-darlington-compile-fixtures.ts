/** Generate the sketch used by the ULN2803A driver compile gate. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../src/state/graphStore'

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

// A button held down drives channels 1 and 8; a solid colour keeps the LED output alive.
const driver = generateCpp([
  node('btn', 'ButtonInput', { pin: 15 }),
  node('drv', 'DarlingtonDriverOutput', { partId: 'uln2803a-dip18' }),
  node('fill', 'SolidColor', { r: 255, g: 200, b: 60 }),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
], [
  edge('c1', 'btn', 'pressed', 'drv', 'channel1'),
  edge('c8', 'btn', 'pressed', 'drv', 'channel8'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
])

const fixtures = { driver }
for (const [name, source] of Object.entries(fixtures)) {
  const writes = source.match(/digitalWrite\(\d+, [^;]+ \? HIGH : LOW\);/g)?.length ?? 0
  const modes = source.match(/pinMode\(\d+, OUTPUT\);/g)?.length ?? 0
  if (writes !== 8 || modes !== 8) {
    throw new Error(`${name}: expected eight channel writes and output modes, found ${writes}/${modes}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/darlington-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} Darlington compile fixture to ${outputDir}`)
