/** Generate real normal sketches used by the wired-Ethernet compile gate. */
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
      label: nodeType,
      nodeType,
      category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness']
  return result
}

const fill = () => node('fill', 'SolidColor', { r: 255, g: 180, b: 60 })
// Classic-ESP32 library defaults: SCLK 25, MOSI 26, MISO 35, SCNn 32, INTn 33, RSTn 27.
const ethernet = (props: Record<string, unknown> = {}) => node('eth', 'EthernetModule', props)

/** Art-Net universe 0, channel 1 as LED-output brightness. */
function artNet(extra: StudioNode[], dmxProps: Record<string, unknown> = {}) {
  const nodes = [
    ...extra,
    node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0, ...dmxProps }),
    node('ch', 'DMXChannel', { channel: 1 }),
    fill(),
    output(),
  ]
  const edges = [
    edge('dmx', 'dmx', 'dmx', 'ch', 'dmx'),
    edge('brightness', 'ch', 'value', 'out', 'brightness'),
    edge('frame', 'fill', 'frame', 'out', 'frame'),
  ]
  return generateCpp(nodes, edges)
}

const artnet = artNet([ethernet()])
const staticAddress = artNet([ethernet()], {
  useDhcp: false,
  staticIp: '192.168.1.60', staticGateway: '192.168.1.1', staticSubnet: '255.255.255.0', staticDns: '192.168.1.1',
})
// A C3 has no HSPI, so the sketch takes the shared-SPI branch; pins are ones
// the C3 has.
const c3 = artNet([ethernet({ sckPin: 4, mosiPin: 6, misoPin: 5, csPin: 7, intPin: 10, resetPin: 3 })])
// Guard: the same graph without the module keeps the renamed Wi-Fi bootstrap.
const wifi = artNet([])

// NTP seconds as brightness, so the clock is read every frame.
const ntp = generateCpp([
  ethernet(),
  node('clock', 'RTCInput', { timeSource: 'NTP', ntpServer: 'pool.ntp.org' }),
  node('seconds', 'MapRange', { inMin: 0, inMax: 59, outMin: 0, outMax: 1, clamp: true }),
  fill(),
  output(),
], [
  edge('second', 'clock', 'second', 'seconds', 'value'),
  edge('brightness', 'seconds', 'result', 'out', 'brightness'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
])

const fixtures = { artnet, ntp, static: staticAddress, c3, wifi }
for (const [name, source] of Object.entries(fixtures)) {
  const eth = source.match(/ETH\.begin\(ETH_PHY_W5500, 1, /g)?.length ?? 0
  const radio = source.match(/WiFi\.begin\(/g)?.length ?? 0
  const expected = name === 'wifi' ? [0, 1] : [1, 0]
  if (eth !== expected[0] || radio !== expected[1]) {
    throw new Error(`${name}: expected ETH.begin/WiFi.begin ${expected.join('/')}, found ${eth}/${radio}`)
  }
  if (!source.includes('bool _netConnected()')) throw new Error(`${name}: missing the network bootstrap`)
}
if (!staticAddress.includes('ETH.config(IPAddress(192, 168, 1, 60)')) throw new Error('static: missing ETH.config')
if (!ntp.includes('configTime(')) throw new Error('ntp: missing the NTP sync')

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/ethernet-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string; ethernet: boolean }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
    ethernet: source.includes('ETH.begin('),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} Ethernet compile fixtures to ${outputDir}`)
