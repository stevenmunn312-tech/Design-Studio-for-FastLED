/**
 * Generate the DMX512 receiver gate: a DMX512 input on the MAX485 transceiver
 * dimming an LED output. One sketch, compiled for each ESP32 UART design.
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

// GPIO 4 and 6 exist on every target; the LED output is on 5.
const source = generateCpp([
  node('board', 'Board', { profileId: 'esp32-devkit-v1' }),
  node('max485', 'DmxTransceiver', { dmxTxPin: 7, dmxRxPin: 4, dmxEnablePin: 6 }),
  node('dmx', 'DMXInput', { inputMode: 'DMX512' }),
  node('level', 'DMXChannel', { channel: 1 }),
  node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }),
  node('fade', 'BrightnessMod'),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
], [
  edge('universe', 'dmx', 'dmx', 'level', 'dmx'),
  edge('fill', 'fill', 'frame', 'fade', 'frame'),
  edge('level', 'level', 'value', 'fade', 'brightness'),
  edge('frame', 'fade', 'frame', 'out', 'frame'),
])

for (const expected of ['static void _dmxIsr(void *) {', '_dmxBegin(_dmxPort_dmx, 4, 6);', '_dmxTake(_dmxData_dmx, &_dmxPacketSeen_dmx)']) {
  if (!source.includes(expected)) throw new Error(`dmx512: missing ${expected}`)
}
if (source.includes('esp_dmx')) throw new Error('dmx512: the receiver needs no library')

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/dmx-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'dmx512.ino'), source, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  dmx512: { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') },
}, null, 2)}\n`, 'utf8')
console.log(`wrote the DMX512 compile fixture to ${outputDir}`)
