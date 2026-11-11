/**
 * Generate the long-string gate: one LED string of 720 and one of 4096 LEDs,
 * the longest an output takes.
 *
 * Waveform's line style and an elementary Automaton each kept a row-sized
 * array on the stack, which a long string overflows; both now hold it in
 * static storage. The sketch draws the Automaton under the Waveform trace so
 * one build carries both.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { findBoardPinCompatibility, findDeployBlockingErrors, findExactBoardPinIssues } from '../../src/utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const FQBN = 'esp32:esp32:esp32'

function longString(ledCount: number): string {
  const nodes = [
    node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
    // Classic-ESP32 I2S pins: the library defaults are an S3's.
    node('mic', 'MicInput', { i2sSck: 26, i2sWs: 25, i2sSd: 33 }),
    node('audio', 'Audio', { sourceId: 'mic' }),
    node('cells', 'Automaton', { automatonType: 'elementary', rule: 30 }),
    node('color', 'FieldToFrame', { palette: 'ocean' }),
    node('trace', 'Waveform', { style: 'line', gain: 3, palette: 'citrus' }),
    node('out', 'MatrixOutput', { form: 'strip', ledCount, dataPin: 5 }),
  ]
  const edges = [
    edge('cells', 'field', 'color', 'field'),
    edge('color', 'frame', 'trace', 'base'),
    edge('audio', 'audio', 'trace', 'audio'),
    edge('trace', 'frame', 'out', 'frame'),
  ]
  const errors = [
    ...findDeployBlockingErrors(nodes, edges, FQBN),
    ...findBoardPinCompatibility(nodes, FQBN).errors,
    ...findExactBoardPinIssues(nodes).errors,
  ]
  if (errors.length > 0) throw new Error(`string-${ledCount}: the deploy gate refuses it: ${errors.join('; ')}`)
  const sketch = generateCpp(nodes, edges)
  if (!new RegExp(`#define WIDTH\\s+${ledCount}\\b`).test(sketch)) throw new Error(`string-${ledCount}: the string is not ${ledCount} LEDs long`)
  for (const marker of ['// Waveform · line', '// Automaton (elementary)']) {
    if (!sketch.includes(marker)) throw new Error(`string-${ledCount}: missing ${marker}`)
  }
  return sketch
}

const fixtures = { 'string-720': longString(720), 'string-4096': longString(4096) }

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/long-string-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} long-string compile fixtures to ${outputDir}`)
