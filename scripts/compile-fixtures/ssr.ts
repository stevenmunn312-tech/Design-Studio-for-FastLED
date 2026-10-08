/** Generate the normal-sketch gate for the Grove 2-channel solid-state relay. */
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

const source = generateCpp([
  node('btn', 'ButtonInput', { pin: 4 }),
  node('relay', 'RelayOutput', {
    partId: 'seeed-grove-2ch-ssr', in1Pin: 5, in2Pin: 16,
  }),
  node('color', 'SolidColor', { r: 20, g: 40, b: 90 }),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 18 }),
], [
  edge('channel', 'btn', 'pressed', 'relay', 'channel1'),
  edge('frame', 'color', 'frame', 'out', 'frame'),
])

for (const expected of [
  'digitalWrite(5, LOW);',
  'pinMode(5, OUTPUT);',
  'digitalWrite(16, LOW);',
  'pinMode(16, OUTPUT);',
  'digitalWrite(5, n_btn_pressed ? HIGH : LOW);',
  'digitalWrite(16, false ? HIGH : LOW);',
]) {
  if (!source.includes(expected)) throw new Error(`ssr: missing ${expected}`)
}
const idle5 = source.indexOf('digitalWrite(5, LOW);')
const mode5 = source.indexOf('pinMode(5, OUTPUT);')
if (idle5 < 0 || mode5 < idle5) throw new Error('ssr: GPIO 5 is not held low before it becomes an output')
if (source.includes('pinMode(17, OUTPUT);')) throw new Error('ssr: a third channel was emitted')

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/ssr-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'ssr.ino'), source, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  ssr: {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
  },
}, null, 2)}\n`, 'utf8')
console.log(`wrote solid-state relay compile fixture to ${outputDir}`)
