import { afterEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { webRemoteOutputs } from '../../state/peripherals/webRemote'
import { useNetworkCredentialsStore } from '../../state/peripherals/networkCredentials'
import { buildGraphDiagnostics, findDeployBlockingErrors, validateGraph } from '../validateGraph'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

/*
 * The board gate for the network users: Art-Net, sACN, DDP and NTP need a
 * Wi-Fi radio (or a wired link), which the ESP cores and the UNO R4 WiFi have;
 * the Web Remote needs the ESP cores' web server on top, so it stays refused
 * on the R4.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
    ?? { label: nodeType, category: 'input', inputs: [], outputs: [] }
  const merged = { ...libraryDefaults(nodeType), ...properties }
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category, properties: merged,
    inputs: definition.inputs,
    outputs: nodeType === 'WebRemoteInput' ? webRemoteOutputs(merged.controls) : definition.outputs,
  } } as StudioNode
}
let edgeCount = 0
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `e${++edgeCount}`, source, sourceHandle, target, targetHandle }) as StudioEdge

function artNetGraph() {
  const nodes = [
    node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0 }),
    node('ch', 'DMXChannel', { channel: 1 }),
    node('fill', 'SolidColor'),
    node('fade', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('dmx', 'dmx', 'ch', 'dmx'),
    edge('fill', 'frame', 'fade', 'frame'),
    edge('ch', 'value', 'fade', 'brightness'),
    edge('fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges, user: 'dmx' }
}

function ntpGraph() {
  const nodes = [
    node('rtc', 'RTCInput', { timeSource: 'NTP' }),
    node('fill', 'SolidColor'),
    node('fade', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('fill', 'frame', 'fade', 'frame'),
    edge('rtc', 'secondsOfDay', 'fade', 'brightness'),
    edge('fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges, user: 'rtc' }
}

const GATE = 'Art-Net, sACN, DDP and NTP time sync require'
const REFUSED = ['arduino:avr:uno', 'arduino:renesas_uno:minima']
const ACCEPTED = ['arduino:renesas_uno:unor4wifi', 'esp32:esp32:esp32', 'esp8266:esp8266:d1_mini']

describe('the network board gate', () => {
  afterEach(() => {
    useNetworkCredentialsStore.getState().removeCredentials('dmx')
    useNetworkCredentialsStore.getState().removeCredentials('rtc')
  })

  for (const [name, graph] of [['an Art-Net input', artNetGraph()], ['an NTP clock', ntpGraph()]] as const) {
    it(`refuses ${name} on a board with no radio, in the gate and Graph Health`, () => {
      const { nodes, edges, user } = graph
      for (const fqbn of REFUSED) {
        const blocking = findDeployBlockingErrors(nodes, edges, fqbn)
        expect(blocking.some((error) => error.startsWith(GATE)), fqbn).toBe(true)
        expect(blocking.find((error) => error.startsWith(GATE))).toContain('Arduino UNO R4 WiFi')
        expect(validateGraph(nodes, edges, fqbn).errors.some((error) => error.startsWith(GATE)), fqbn).toBe(true)
        const diagnostic = buildGraphDiagnostics(nodes, edges, { selectedFqbn: fqbn }).find((entry) => entry.id === `${user}-board-network`)
        expect(diagnostic, fqbn).toMatchObject({ severity: 'error', category: 'board', action: 'choose-board', nodeIds: [user] })
        expect(diagnostic?.fix).toContain('Arduino UNO R4 WiFi')
      }
    })

    it(`accepts ${name} on the ESP cores and the UNO R4 WiFi`, () => {
      const { nodes, edges, user } = graph
      useNetworkCredentialsStore.getState().setCredentials(user, { ssid: 'studio', password: 'secret' })
      for (const fqbn of ACCEPTED) {
        expect(findDeployBlockingErrors(nodes, edges, fqbn).filter((error) => error.startsWith(GATE)), fqbn).toEqual([])
        expect(validateGraph(nodes, edges, fqbn).errors.filter((error) => error.startsWith(GATE)), fqbn).toEqual([])
        expect(buildGraphDiagnostics(nodes, edges, { selectedFqbn: fqbn }).find((entry) => entry.id === `${user}-board-network`), fqbn).toBeUndefined()
      }
    })
  }

  it('still refuses the Web Remote on the UNO R4 WiFi, naming the missing server', () => {
    const remote = node('r', 'WebRemoteInput', { controls: [{ id: 'go', type: 'Button', label: 'Go' }] })
    const fill = node('fill', 'SolidColor')
    const out = node('out', 'MatrixOutput', { width: 8, height: 1 })
    const nodes = [remote, fill, out]
    const edges = [edge('fill', 'frame', 'out', 'frame')]
    const fqbn = 'arduino:renesas_uno:unor4wifi'
    const errors = validateGraph(nodes, edges, fqbn).errors
    expect(errors.some((error) => error.startsWith('The Web Remote needs Wi-Fi:'))).toBe(true)
    expect(errors.some((error) => error.startsWith(GATE))).toBe(false)
    const diagnostic = buildGraphDiagnostics(nodes, edges, { selectedFqbn: fqbn }).find((entry) => entry.id === 'r-board-web-remote')
    expect(diagnostic).toMatchObject({ severity: 'error', action: 'choose-board', nodeIds: ['r'] })
    expect(diagnostic?.message).toContain('no web server')
    expect(validateGraph(nodes, edges, 'esp32:esp32:esp32s3').errors.some((error) => error.includes('Web Remote'))).toBe(false)
  })

  it('generates the UNO R4 WiFi branch of the shared network bootstrap', () => {
    const { nodes, edges } = artNetGraph()
    useNetworkCredentialsStore.getState().setCredentials('dmx', { ssid: 'studio', password: 'secret' })
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('#elif defined(ARDUINO_UNOWIFIR4)\n#include <WiFiS3.h>\n#define FLS_NET_SUPPORTED 1\n')
    expect(cpp).toContain('#if !defined(ARDUINO_UNOWIFIR4)\n    WiFi.mode(WIFI_STA);\n#endif')
    expect(cpp).toContain('#if defined(ESP32) || defined(ARDUINO_UNOWIFIR4)\n    WiFi.setHostname(')
    expect(cpp).toContain('WiFi.begin("studio", "secret");')
  })

  it('keeps SNTP on the ESP cores and runs the exchange over WiFiUDP on the UNO R4 WiFi', () => {
    const { nodes, edges } = ntpGraph()
    useNetworkCredentialsStore.getState().setCredentials('rtc', { ssid: 'studio', password: 'secret' })
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('#if defined(ESP32)\n#include <WiFi.h>\n#include <WiFiUdp.h>\n#include <time.h>\n#define FLS_NET_SUPPORTED 1\n#define FLS_NET_SNTP 1')
    expect(cpp).toContain('#elif defined(ARDUINO_UNOWIFIR4)\n#include <WiFiS3.h>\n#define FLS_NET_SUPPORTED 1\n#define FLS_NET_SNTP 0')
    expect(cpp).toContain('#else\n#define FLS_NET_SUPPORTED 0\n#define FLS_NET_SNTP 0\n#endif')
    expect(cpp).toContain('#if FLS_NET_SUPPORTED && FLS_NET_SNTP\n  if (_netConnected() && !_rtcNtpConfigured_rtc) {\n    configTime(0, 0, "pool.ntp.org");')
    expect(cpp).toContain('#elif FLS_NET_SUPPORTED\n')
    expect(cpp).toContain('static WiFiUDP _rtcNtpUdp_rtc;')
    expect(cpp).toContain('_rtcNtpUdp_rtc.begin(2390);')
    expect(cpp).toContain('_rtcNtpUdp_rtc.beginPacket("pool.ntp.org", 123);')
    expect(cpp).toContain('_rtcNtpEpoch_rtc = _rtcNtpSeconds1900_rtc - 2208988800UL;')
    expect(cpp).toContain('_rtcCivilFromDays(_rtcNtpDays_rtc, _rtcNtpYear_rtc, _rtcNtpMonth_rtc, _rtcNtpDay_rtc);')
    expect(cpp).toContain('n_rtc_synced = _netConnected();')
  })

  it('folds the network branches to the chosen board', () => {
    const { nodes, edges } = ntpGraph()
    useNetworkCredentialsStore.getState().setCredentials('rtc', { ssid: 'studio', password: 'secret' })
    const r4 = [...nodes, node('board-root', 'Board', { profileId: 'arduino-uno-r4-wifi' })]
    const r4Cpp = generateCpp(r4, edges)
    expect(r4Cpp).toContain('#include <WiFiS3.h>')
    expect(r4Cpp).not.toContain('configTime(')
    expect(r4Cpp).not.toContain('WiFi.mode(WIFI_STA)')
    expect(r4Cpp).toContain('_rtcNtpUdp_rtc.begin(2390);')
    const esp = [...nodes, node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' })]
    const espCpp = generateCpp(esp, edges)
    expect(espCpp).not.toContain('WiFiS3.h')
    expect(espCpp).not.toContain('_rtcNtpUdp_rtc')
    expect(espCpp).toContain('configTime(')
  })
})
