/** Generate real normal sketches used by the wired-Ethernet compile gate. */
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

function output(dataPin = 5): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin })
  result.data.exposedInputs = ['brightness']
  return result
}

const fill = () => node('fill', 'SolidColor', { r: 255, g: 180, b: 60 })
// Classic-ESP32 library defaults: SCLK 25, MOSI 26, MISO 35, SCNn 32, INTn 33, RSTn 27.
const ethernet = (props: Record<string, unknown> = {}) => node('eth', 'EthernetModule', props)

const CLASSIC = 'esp32:esp32:esp32'
const C3 = 'esp32:esp32:esp32c3'
const board = (profileId: string) => node('board', 'Board', { profileId })
/** An SPI colour panel with no touch, so it claims SCK, MOSI, CS, DC, reset and backlight. */
const panel = (props: Record<string, unknown>) => node('panel', 'TransportDisplay', props)

interface Fixture { fqbn: string; nodes: StudioNode[]; edges: StudioEdge[] }

/** Art-Net universe 0, channel 1 as LED-output brightness. */
function artNet(fqbn: string, extra: StudioNode[], dmxProps: Record<string, unknown> = {}, dataPin = 5): Fixture {
  const nodes = [
    ...extra,
    node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0, ...dmxProps }),
    node('ch', 'DMXChannel', { channel: 1 }),
    fill(),
    output(dataPin),
  ]
  const edges = [
    edge('dmx', 'dmx', 'dmx', 'ch', 'dmx'),
    edge('brightness', 'ch', 'value', 'out', 'brightness'),
    edge('frame', 'fill', 'frame', 'out', 'frame'),
  ]
  return { fqbn, nodes, edges }
}

// C3-safe module pins: the Arduino default SPI group (SCK 4, MISO 5, MOSI 6,
// SS 7) plus INTn 10 and RSTn 3. GPIO 5 is MISO, so the LED data moves to 2.
const c3Module = () => ethernet({ sckPin: 4, mosiPin: 6, misoPin: 5, csPin: 7, intPin: 10, resetPin: 3 })

const graphs: Record<string, Fixture> = {
  artnet: artNet(CLASSIC, [ethernet()]),
  // NTP seconds as brightness, so the clock is read every frame.
  ntp: {
    fqbn: CLASSIC,
    nodes: [
      ethernet(),
      node('clock', 'RTCInput', { timeSource: 'NTP', ntpServer: 'pool.ntp.org' }),
      node('seconds', 'MapRange', { inMin: 0, inMax: 59, outMin: 0, outMax: 1, clamp: true }),
      fill(),
      output(),
    ],
    edges: [
      edge('second', 'clock', 'second', 'seconds', 'value'),
      edge('brightness', 'seconds', 'result', 'out', 'brightness'),
      edge('frame', 'fill', 'frame', 'out', 'frame'),
    ],
  },
  static: artNet(CLASSIC, [ethernet()], {
    useDhcp: false,
    staticIp: '192.168.1.60', staticGateway: '192.168.1.1', staticSubnet: '255.255.255.0', staticDns: '192.168.1.1',
  }),
  // A C3 has no HSPI, so the sketch takes the shared-SPI branch.
  c3: artNet(C3, [board('esp32-c3-devkitm-1'), c3Module()], {}, 2),
  // The same module sharing SPI with a colour panel: the panel names the
  // module's SCK and MOSI, as validation requires on a one-host chip, and keeps
  // its own select. Both start the host through the shared helper, so a
  // write-only panel cannot drop the module's MISO.
  'c3-panel': artNet(C3, [
    board('esp32-c3-devkitm-1'),
    c3Module(),
    panel({ sckPin: 4, mosiPin: 6, csPin: 1, dcPin: 0, resetPin: 9, backlightPin: 8 }),
  ], {}, 2),
  // S2 and S3 take the HSPI branch like classic ESP32. Their pins avoid the
  // SPI flash and PSRAM lines that the classic defaults (25-35) fall on.
  s2: artNet('esp32:esp32:esp32s2', [
    board('espressif-esp32-s2-devkitc-1'),
    ethernet({ sckPin: 36, mosiPin: 35, misoPin: 37, csPin: 34, intPin: 33, resetPin: 38 }),
  ]),
  // With a panel on the default SPI pins, so the module's own host is built
  // beside the panel's.
  s3: artNet('esp32:esp32:esp32s3', [
    board('espressif-esp32-s3-devkitc-1'),
    ethernet({ sckPin: 16, mosiPin: 17, misoPin: 18, csPin: 15, intPin: 21, resetPin: 47 }),
    panel({ sckPin: 12, mosiPin: 11, csPin: 10, dcPin: 9, resetPin: 8, backlightPin: 7 }),
  ], {}, 4),
  // Guard: the same graph without the module keeps the renamed Wi-Fi bootstrap.
  wifi: artNet(CLASSIC, []),
}

// Every fixture is a graph the deploy gate would let through for its board.
for (const [name, { fqbn, nodes, edges }] of Object.entries(graphs)) {
  const errors = [
    ...findDeployBlockingErrors(nodes, edges, fqbn),
    ...findBoardPinCompatibility(nodes, fqbn).errors,
    ...findExactBoardPinIssues(nodes).errors,
  ]
  if (errors.length > 0) throw new Error(`${name}: the deploy gate refuses it: ${errors.join('; ')}`)
}

const fixtures = Object.fromEntries(Object.entries(graphs).map(([name, { nodes, edges }]) => [name, generateCpp(nodes, edges)]))
for (const [name, source] of Object.entries(fixtures)) {
  const eth = source.match(/ETH\.begin\(ETH_PHY_W5500, 1, /g)?.length ?? 0
  const radio = source.match(/WiFi\.begin\(/g)?.length ?? 0
  const expected = name === 'wifi' ? [0, 1] : [1, 0]
  if (eth !== expected[0] || radio !== expected[1]) {
    throw new Error(`${name}: expected ETH.begin/WiFi.begin ${expected.join('/')}, found ${eth}/${radio}`)
  }
  if (!source.includes('bool _netConnected()')) throw new Error(`${name}: missing the network bootstrap`)
}
if (!fixtures.static.includes('ETH.config(IPAddress(192, 168, 1, 60)')) throw new Error('static: missing ETH.config')
if (!fixtures.ntp.includes('configTime(')) throw new Error('ntp: missing the NTP sync')
// The network starts in setup. Both clients use the shared host helper, so
// the panel cannot remove Ethernet's MISO regardless of initialization order.
for (const name of ['c3-panel', 's3']) {
  const setup = fixtures[name].slice(fixtures[name].indexOf('void setup() {'))
  const network = setup.indexOf('_netEnsureConnected();')
  if (!fixtures[name].includes('_spiBusBegin(sck, -1, mosi);')) throw new Error(`${name}: missing the panel's SPI bus`)
  if (network < 0 || network > setup.indexOf('\n}\n')) throw new Error(`${name}: setup() does not start the network`)
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/ethernet-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { fqbn: string; bytes: number; sha256: string; ethernet: boolean }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    fqbn: graphs[name].fqbn,
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
    ethernet: source.includes('ETH.begin('),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} Ethernet compile fixtures to ${outputDir}`)
