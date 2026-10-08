/** Generate the WT32-ETH01 board gate: Art-Net and NTP over its own LAN8720, with header GPIO elsewhere. */
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

// Art-Net channel 1 dims a strip on IO4, and an NTP clock's seconds fill a
// meter on IO14 whose brightness follows a BH1750 on IO33/IO32, the core's
// default I2C pair. Both network nodes reach the LAN through the board's own
// port, so the sketch never starts Wi-Fi.
const meter = node('meter', 'MatrixOutput', { width: 8, height: 1, dataPin: 14 })
meter.data.exposedInputs = ['brightness']
const source = generateCpp([
  node('board', 'Board', { profileId: 'wt32-eth01' }),
  node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0 }),
  node('channel', 'DMXChannel', { channel: 1 }),
  node('fill', 'SolidColor', { r: 255, g: 120, b: 40 }),
  node('fade', 'BrightnessMod'),
  node('strip', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
  node('clock', 'RTCInput', { timeSource: 'NTP', ntpServer: 'pool.ntp.org' }),
  node('seconds', 'MapRange', { inMin: 0, inMax: 59, outMin: 0, outMax: 1, clamp: true }),
  node('gauge', 'Gauge', { palette: 'heat' }),
  meter,
  node('light', 'LightInput', { partId: 'adafruit-bh1750-light-sensor', sdaPin: 33, sclPin: 32, i2cAddress: '0x23' }),
  node('lux', 'MapRange', { inMin: 0, inMax: 1000, outMin: 0.1, outMax: 1, clamp: true }),
], [
  edge('dmx-channel', 'dmx', 'dmx', 'channel', 'dmx'),
  edge('fill-frame', 'fill', 'frame', 'fade', 'frame'),
  edge('channel-level', 'channel', 'value', 'fade', 'brightness'),
  edge('strip-frame', 'fade', 'frame', 'strip', 'frame'),
  edge('clock-seconds', 'clock', 'second', 'seconds', 'value'),
  edge('seconds-level', 'seconds', 'result', 'gauge', 'value'),
  edge('meter-frame', 'gauge', 'frame', 'meter', 'frame'),
  edge('lux-level', 'light', 'lux', 'lux', 'value'),
  edge('meter-brightness', 'lux', 'result', 'meter', 'brightness'),
])

for (const expected of [
  'ETH.begin(ETH_PHY_LAN8720, 1, 23, 18, 16, ETH_CLOCK_GPIO0_IN)',
  'Wire.begin(33, 32)',
  '#define DATA_PIN_strip 4',
  '#define DATA_PIN_meter 14',
]) {
  if (!source.includes(expected)) throw new Error(`wt32-eth01: missing ${expected}`)
}
for (const refused of ['WiFi.begin(', 'ETH_PHY_W5500', '#include <SPI.h>']) {
  if (source.includes(refused)) throw new Error(`wt32-eth01: unexpected ${refused}`)
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/wt32-eth01-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'wt32-eth01.ino'), source, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  'wt32-eth01': {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
  },
}, null, 2)}\n`, 'utf8')
console.log(`wrote WT32-ETH01 compile fixture to ${outputDir}`)
