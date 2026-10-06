/** Generate the sketch used by the KY-012 buzzer compile gate. */
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

// A button held down sounds the buzzer; a solid colour keeps the LED output alive.
const buzzer = generateCpp([
  node('btn', 'ButtonInput', { pin: 4 }),
  node('buzz', 'BuzzerOutput', { partId: 'ky-012-active-buzzer-module', sigPin: 26 }),
  node('fill', 'SolidColor', { r: 255, g: 200, b: 60 }),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
], [
  edge('sound', 'btn', 'pressed', 'buzz', 'on'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
])

const fixtures = { buzzer }
for (const [name, source] of Object.entries(fixtures)) {
  const writes = source.match(/digitalWrite\(26, [^;]+ \? HIGH : LOW\);/g)?.length ?? 0
  const latches = source.match(/digitalWrite\(26, LOW\);/g)?.length ?? 0
  const modes = source.match(/pinMode\(26, OUTPUT\);/g)?.length ?? 0
  if (writes !== 1 || latches !== 1 || modes !== 1) {
    throw new Error(`${name}: expected one buzzer write, silent latch and output mode, found ${writes}/${latches}/${modes}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/buzzer-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} buzzer compile fixture to ${outputDir}`)
