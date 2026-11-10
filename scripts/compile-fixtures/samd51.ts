/**
 * Generate the SAMD51 board gate: a plain LED sketch and an I2S microphone
 * sketch for the Adafruit Feather M4 Express. They prove FastLED builds on
 * SAMD51 as released, with no patch to the library and no alias in the sketch.
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

const board = () => node('board', 'Board', { profileId: 'adafruit-feather-m4-express' })
const output = () => node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })

const leds = generateCpp([
  board(),
  node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }),
  output(),
], [edge('frame', 'fill', 'frame', 'out', 'frame')])

const mic = generateCpp([
  board(),
  node('mic-module', 'MicInput'),
  node('mic', 'Audio', { sourceId: 'mic-module' }),
  node('fft', 'FFTAnalyzer'),
  node('pulse', 'BassPulse'),
  output(),
], [
  edge('audio', 'mic', 'audio', 'fft', 'audio'),
  edge('bass', 'fft', 'bass', 'pulse', 'bass'),
  edge('frame', 'pulse', 'frame', 'out', 'frame'),
])

if (leds.includes('Adafruit_ZeroI2S')) throw new Error('leds: unexpected microphone capture')
for (const expected of ['#include <Adafruit_ZeroI2S.h>', 'Adafruit_ZeroI2S _i2s', '_audioProcessor->getBassLevel()']) {
  if (!mic.includes(expected)) throw new Error(`mic: missing ${expected}`)
}

const fixtures = { leds, mic }
const outputDir = resolve(process.argv[2] ?? 'backend/sketches/samd51-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} SAMD51 compile fixtures to ${outputDir}`)
