/**
 * Generate the Arduino UNO R4 WiFi network gate: the sketches that reach the
 * network through WiFiS3 instead of an ESP core.
 *
 * WiFiS3 has the socket but no SNTP client and no `configTime`, so an NTP
 * Clock runs the sketch's own SNTP exchange and applies its zone with
 * `_rtcTzOffset`. Its `config` takes DNS second and its hostname call differs,
 * which a static address and a named board reach. None of this has compiled
 * before; the names are assumed from the core.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { useNetworkCredentialsStore } from '../../src/state/peripherals/networkCredentials'
import { UNO_R4_WIFI_FQBN } from '../../src/state/peripherals/networkCapability'
import { findBoardPinCompatibility, findDeployBlockingErrors, findExactBoardPinIssues } from '../../src/utils/validateGraph'

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

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

// The Board's own credentials, seeded the way a user enters them in its
// network settings.
useNetworkCredentialsStore.getState().setCredentials('board', { ssid: 'studio-bench', password: 'studio-bench-key' })

const board = (properties: Record<string, unknown> = {}) =>
  node('board', 'Board', { profileId: 'arduino-uno-r4-wifi', ...properties })
// 64 LEDs on D6: the board has 32 KB of RAM.
function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 6 })
  result.data.exposedInputs = ['brightness', 'enabled']
  return result
}
const fill = () => node('fill', 'SolidColor', { r: 255, g: 180, b: 60 })
const seconds = () => node('seconds', 'MapRange', { inMin: 0, inMax: 59, outMin: 0, outMax: 1, clamp: true })

const graphs: Record<string, { nodes: StudioNode[]; edges: StudioEdge[] }> = {
  // NTP seconds as brightness, in a zone with daylight saving so the build
  // carries its rule.
  'ntp-zone': {
    nodes: [
      board(),
      node('clock', 'RTCInput', { timeSource: 'NTP', ntpServer: 'pool.ntp.org', timeZone: 'Europe/Paris' }),
      seconds(), fill(), output(),
    ],
    edges: [
      edge('clock', 'second', 'seconds', 'value'),
      edge('seconds', 'result', 'out', 'brightness'),
      edge('fill', 'frame', 'out', 'frame'),
    ],
  },
  // Art-Net channel 1 as brightness beside an NTP clock that gates the
  // output, on a named board at a static address.
  'artnet-static': {
    nodes: [
      board({
        wifiHostname: 'studio-r4', useDhcp: false,
        staticIp: '192.168.1.61', staticGateway: '192.168.1.1', staticSubnet: '255.255.255.0', staticDns: '192.168.1.1',
      }),
      node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0 }),
      node('ch', 'DMXChannel', { channel: 1 }),
      node('clock', 'RTCInput', { timeSource: 'NTP', ntpServer: 'pool.ntp.org', timeZone: 'UTC' }),
      fill(), output(),
    ],
    edges: [
      edge('dmx', 'dmx', 'ch', 'dmx'),
      edge('ch', 'value', 'out', 'brightness'),
      edge('clock', 'synced', 'out', 'enabled'),
      edge('fill', 'frame', 'out', 'frame'),
    ],
  },
}

// Every fixture is a graph the deploy gate lets through for this board.
for (const [name, { nodes, edges }] of Object.entries(graphs)) {
  const errors = [
    ...findDeployBlockingErrors(nodes, edges, UNO_R4_WIFI_FQBN),
    ...findBoardPinCompatibility(nodes, UNO_R4_WIFI_FQBN).errors,
    ...findExactBoardPinIssues(nodes).errors,
  ]
  if (errors.length > 0) throw new Error(`${name}: the deploy gate refuses it: ${errors.join('; ')}`)
}

const fixtures = Object.fromEntries(Object.entries(graphs).map(([name, { nodes, edges }]) => [name, generateCpp(nodes, edges)]))

// The board is known, so pruning keeps the WiFiS3 branch alone.
const required: Record<string, string[]> = {
  'ntp-zone': ['#include <WiFiS3.h>', '_rtcTzOffset(', 'void _netEnsureConnected()'],
  'artnet-static': ['#include <WiFiS3.h>', 'WiFi.config(IPAddress(192, 168, 1, 61)', 'WiFi.setHostname(', 'void _netEnsureConnected()'],
}
for (const [name, symbols] of Object.entries(required)) {
  const missing = symbols.filter((symbol) => !fixtures[name].includes(symbol))
  if (missing.length) throw new Error(`${name}: missing ${missing.join(', ')}`)
  for (const foreign of ['#include <WiFi.h>', '#include <ESP8266WiFi.h>', 'configTzTime(']) {
    if (fixtures[name].includes(foreign)) throw new Error(`${name}: an ESP network branch survived (${foreign})`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/uno-r4-wifi-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} UNO R4 WiFi compile fixtures to ${outputDir}`)
