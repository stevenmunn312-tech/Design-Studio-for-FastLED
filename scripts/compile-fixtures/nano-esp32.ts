/** Generate the Arduino Nano ESP32 board gate: header GPIO numbers under the core's GPIO numbering. */
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

// D6 (GPIO9) and D12 (GPIO47) drive LEDs, A0 (GPIO1) reads a pot, and the
// BH1750 sits on A4/A5 (GPIO11/12), the board's default I2C pair.
const strip = node('strip', 'MatrixOutput', { width: 8, height: 8, dataPin: 9 })
strip.data.exposedInputs = ['brightness']
const source = generateCpp([
  node('board', 'Board', { profileId: 'arduino-nano-esp32' }),
  node('light', 'LightInput', { partId: 'adafruit-bh1750-light-sensor', sdaPin: 11, sclPin: 12, i2cAddress: '0x23' }),
  node('lux', 'MapRange', { inMin: 0, inMax: 1000, outMin: 0, outMax: 1, clamp: true }),
  node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }),
  strip,
  node('pot', 'PotInput', { pin: 1 }),
  node('gauge', 'Gauge', { palette: 'heat' }),
  node('meter', 'MatrixOutput', { width: 8, height: 1, dataPin: 47 }),
], [
  edge('lux-level', 'light', 'lux', 'lux', 'value'),
  edge('brightness', 'lux', 'result', 'strip', 'brightness'),
  edge('frame', 'fill', 'frame', 'strip', 'frame'),
  edge('level', 'pot', 'value', 'gauge', 'value'),
  edge('meter-frame', 'gauge', 'frame', 'meter', 'frame'),
])

for (const expected of ['Wire.begin(11, 12)', '#define DATA_PIN_strip 9', '#define DATA_PIN_meter 47', 'analogRead(1)']) {
  if (!source.includes(expected)) throw new Error(`nano-esp32: missing ${expected}`)
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/nano-esp32-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'nano-esp32.ino'), source, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  'nano-esp32': {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
  },
}, null, 2)}\n`, 'utf8')
console.log(`wrote Nano ESP32 compile fixture to ${outputDir}`)
