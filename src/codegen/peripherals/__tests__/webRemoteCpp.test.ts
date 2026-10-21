import { afterEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../cppGenerator'
import { generateShowSketch } from '../../showGenerator'
import { specializeCpp } from '../../cppSpecialize'
import { controlGraphCpp, createControlGraph } from '../../controlGraph'
import { WEB_REMOTE_HOLD_TIMEOUT_MS, webRemoteFirmware } from '../webRemoteCpp'
import { usesNetwork } from '../networkCpp'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { normalizeWebRemoteControls, webRemoteOutputs } from '../../../state/peripherals/webRemote'
import { webRemotePageHtml } from '../../../state/peripherals/webRemotePage'
import { resetWebRemoteRuntime, writeWebRemoteControl } from '../../../state/peripherals/webRemoteRuntime'
import { useNetworkCredentialsStore } from '../../../state/peripherals/networkCredentials'
import { buildGraphDiagnostics, validateGraph } from '../../../utils/validateGraph'
import type { GroupRegistry } from '../../../state/evaluator/types'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

/*
 * The Web Remote's firmware, held against the page and preview it shares
 * rules with: the server exists only for a graph with a remote, each platform
 * gets its core library, every request input is bounded, and only what a
 * remote's controls use is emitted.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
    ?? { label: nodeType, category: 'pattern', inputs: [], outputs: [] }
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

const CONTROLS = [
  { id: 'go', type: 'Button', label: 'Go' },
  { id: 'level', type: 'Slider', label: 'Level', properties: { min: 0, max: 1, step: 0.01, initial: 0.6 } },
  { id: 'tint', type: 'Colour Picker', label: 'Tint', properties: { initial: 200 } },
]

function remoteGraph(controls: unknown[] = CONTROLS) {
  const remote = node('r', 'WebRemoteInput', { title: 'Shelf "lights"', wifiHostname: 'Shelf Lights', controls })
  const fill = node('fill', 'SolidColor')
  const dim = node('dim', 'BrightnessMod')
  const out = node('out', 'MatrixOutput', { width: 8, height: 1 })
  return {
    nodes: [remote, fill, dim, out],
    edges: [
      edge('r', 'remote:tint', 'fill', 'color'),
      edge('fill', 'frame', 'dim', 'frame'),
      edge('r', 'remote:level', 'dim', 'brightness'),
      edge('dim', 'frame', 'out', 'frame'),
    ],
  }
}

/** The PROGMEM page read back out of the sketch, C escapes undone. */
function embeddedPage(cpp: string, id: string): string {
  const start = cpp.indexOf(`static const char _wrPage_${id}[] PROGMEM =`)
  const end = cpp.indexOf(';\n', start)
  const literals = cpp.slice(start, end).split('\n').slice(1)
  return literals.map((line) => {
    const body = line.trim().slice(1, -1)
    return body.replace(/\\(.)/g, (_, escaped: string) => (escaped === 'n' ? '\n' : escaped === 'r' ? '\r' : escaped))
  }).join('')
}

afterEach(() => {
  resetWebRemoteRuntime()
  resetEvaluatorState()
})

describe('normal sketch', () => {
  it('serves the exact page the preview shows, from PROGMEM', () => {
    const { nodes, edges } = remoteGraph()
    const cpp = generateCpp(nodes, edges)
    const page = webRemotePageHtml('Shelf "lights"', normalizeWebRemoteControls(CONTROLS))
    expect(embeddedPage(cpp, 'r')).toBe(page)
    expect(cpp).toContain('_wrServer_r.send_P(200, "text/html", _wrPage_r);')
  })

  it('emits the server only for a graph with a Web Remote', () => {
    const { nodes, edges } = remoteGraph()
    expect(usesNetwork(nodes[0])).toBe(true)
    expect(generateCpp(nodes, edges)).toContain('_wrServer_r.handleClient();')
    const plain = generateCpp(
      [node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 1 })],
      [edge('fill', 'frame', 'out', 'frame')],
    )
    expect(plain).not.toContain('WebServer')
    expect(plain).not.toContain('_wr')
  })

  it('uses each platform\'s core server and mDNS', () => {
    const { nodes, edges } = remoteGraph()
    const cpp = generateCpp(nodes, edges)
    const esp32 = specializeCpp(cpp, { ESP32: true, ESP8266: false })
    expect(esp32).toContain('#include <WebServer.h>')
    expect(esp32).toContain('#include <ESPmDNS.h>')
    expect(esp32).toContain('static WebServer _wrServer_r(80);')
    expect(esp32).not.toContain('ESP8266WebServer')
    const esp8266 = specializeCpp(cpp, { ESP32: false, ESP8266: true })
    expect(esp8266).toContain('#include <ESP8266WebServer.h>')
    expect(esp8266).toContain('#include <ESP8266mDNS.h>')
    expect(esp8266).toContain('static ESP8266WebServer _wrServer_r(80);')
    expect(esp8266).toContain('MDNS.update();')
    expect(esp8266).not.toContain('<WebServer.h>')
    expect(cpp).toContain('if (MDNS.begin("shelf-lights")) MDNS.addService("http", "tcp", 80);')
  })

  it('joins the shared Wi-Fi with the node\'s own credentials and starts the server once it is up', () => {
    useNetworkCredentialsStore.getState().setCredentials('r', { ssid: 'Home "net"', password: 'p\\w' })
    try {
      const { nodes, edges } = remoteGraph()
      const cpp = generateCpp(nodes, edges)
      expect(cpp).toContain('WiFi.begin("Home \\"net\\"", "p\\\\w");')
      expect(cpp.match(/^void _netEnsureConnected\(\) \{/gm)).toHaveLength(1)
      expect(cpp).toContain('  if (_netConnected()) {\n    if (!_wrStarted_r) {\n      _wrServer_r.begin();')
    } finally {
      useNetworkCredentialsStore.getState().removeCredentials('r')
    }
  })

  it('bounds the index and value of every set before reading them', () => {
    const { nodes, edges } = remoteGraph()
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('if (text.length() < 1 || text.length() > 2) return -1;')
    expect(cpp).toContain('if (digit < \'0\' || digit > \'9\') return -1;')
    expect(cpp).toContain('return index < 3 ? index : -1;')
    expect(cpp).toContain('if (i < 0 || raw.length() == 0 || raw.length() > 16 || !isfinite(v)) {')
    expect(cpp).toContain('case 1: _wrVal_r[1] = _wrQuantize_r(v, 0.0f, 1.0f, 0.01f); break;')
    expect(cpp).toContain('case 2: _wrVal_r[2] = _wrQuantize_r(v, 0.0f, 360.0f, 1.0f); break;')
    expect(cpp).toContain('_wrServer_r.on("/set", HTTP_POST, _wrHandleSet_r);')
  })

  it('times out a Button whose release was lost', () => {
    const { nodes, edges } = remoteGraph()
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('if (v >= 0.5f) _wrHeldMs_r_0 = millis();')
    expect(cpp).toContain(`if (_wrVal_r[0] >= 0.5f && (uint32_t)(millis() - _wrHeldMs_r_0) > ${WEB_REMOTE_HOLD_TIMEOUT_MS}u) _wrVal_r[0] = 0.0f;`)
  })

  it('declares each output at the control\'s start value and feeds the graph from it', () => {
    const { nodes, edges } = remoteGraph()
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('static float _wrVal_r[3] = { 0.0f, 0.6f, 200.0f };')
    expect(cpp).toContain('float n_r_remote_level = _wrVal_r[1];')
    expect(cpp).toContain('CRGB n_r_remote_tint = CRGB(_wrHueRgb_r(_wrVal_r[2], 1.0f, 1.0f));')
    // The unwired Button's output is declared by the emitter and then pruned
    // with every other unread local; the page still sets its state.
    expect(webRemoteFirmware('r', { controls: CONTROLS }, 'x').loop).toContain('  bool n_r_remote_go = _wrVal_r[0] >= 0.5f;')
  })

  it('emits only the helpers its controls use', () => {
    const toggleOnly = webRemoteFirmware('r', { controls: [{ id: 't', type: 'Toggle', label: 'T' }] }, 'x')
    const text = [toggleOnly.globals, ...toggleOnly.loop].join('\n')
    expect(text).not.toContain('_wrQuantize_r')
    expect(text).not.toContain('_wrHueRgb_r')
    expect(text).not.toContain('_wrHeldMs_r')
    const full = webRemoteFirmware('r', { controls: CONTROLS }, 'x')
    expect(full.globals).toContain('static float _wrQuantize_r(')
    expect(full.globals).toContain('static uint32_t _wrHueRgb_r(')
  })

  it('carries labels into C++ only as escaped comments and string literals', () => {
    const firmware = webRemoteFirmware('r', {
      title: 'a\nb',
      controls: [{ id: 's', type: 'Slider', label: 'x */ evil(); //' }],
    }, 'x')
    expect(firmware.globals).toContain('// Web Remote "a b": a phone control page served over Wi-Fi.')
    for (const line of firmware.globals.split('\n').filter((entry) => entry.trimStart().startsWith('"'))) {
      expect(line.trim(), line).toMatch(/^"(?:[^"\\]|\\.)*";?$/)
    }
  })
})

describe('preview', () => {
  it('reports the controls at their start values and follows the runtime', () => {
    const { nodes, edges } = remoteGraph()
    const first = evaluateGraphFull(nodes, edges, 0, 8, 1, {}, true, true).outputs.get('r')
    expect(first?.['remote:level']).toBe(0.6)
    expect(first?.['remote:go']).toBe(false)
    expect(first?.['remote:tint']).toEqual({ r: 0, g: 170, b: 255 })
    writeWebRemoteControl('r', 'level', 0.25)
    writeWebRemoteControl('r', 'go', true)
    const next = evaluateGraphFull(nodes, edges, 1, 8, 1, {}, true, true).outputs.get('r')
    expect(next?.['remote:level']).toBe(0.25)
    expect(next?.['remote:go']).toBe(true)
  })
})

describe('templates', () => {
  const groups = {
    g0: {
      nodes: [node('sc', 'SolidColor'), node('go', 'GroupOutput')],
      edges: [edge('sc', 'frame', 'go', 'frame')],
    },
  } as unknown as GroupRegistry
  const show = [
    node('pc', 'PatternCollection', { patternIds: ['g0'] }),
    node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
    node('out', 'MatrixOutput', { width: 8, height: 8 }),
  ]
  const showEdges = [edge('pc', 'patternset', 'pm', 'patternset'), edge('pm', 'frame', 'out', 'frame')]

  it('drives a show through the bounded control graph, with the network and server', () => {
    const remote = node('r', 'WebRemoteInput', { controls: [{ id: 'speed', type: 'Slider', label: 'Speed', properties: { min: 0, max: 2, step: 0.1, initial: 1 } }] })
    const speed = node('speed', 'MasterSpeed', { speed: 1 })
    const cpp = generateShowSketch([...show, remote, speed], [...showEdges, edge('r', 'remote:speed', 'speed', 'speed')], groups)
    expect(cpp).toContain('float n_r_remote_speed = _wrVal_r[0];')
    expect(cpp).toContain('_showAnimSpeed = constrain(n_r_remote_speed, 0.0f, 4.0f);')
    expect(cpp).toContain('_wrServer_r.handleClient();')
    expect(cpp.match(/^void _netEnsureConnected\(\) \{/gm)).toHaveLength(1)
    expect(cpp).toContain('static const char _wrPage_r[] PROGMEM =')
  })

  it('offers a Colour Picker to the control graph as a self-contained colour', () => {
    const remote = node('r', 'WebRemoteInput', { controls: CONTROLS })
    const graph = createControlGraph([remote], [])
    expect(graph.resolve('r', 'remote:tint', 'color')).toEqual({ nodeId: 'r', port: 'remote:tint', type: 'color' })
    expect(graph.resolve('r', 'remote:go', 'bool')).not.toBeNull()
    expect(graph.errors.size).toBe(0)
    const emitted = controlGraphCpp(graph)
    expect(emitted.loop).toContain('  CRGB n_r_remote_tint = CRGB(_wrHueRgb_r(_wrVal_r[2], 1.0f, 1.0f));')
    expect(emitted.includes.some((include) => include.includes('#include <ESP8266WebServer.h>'))).toBe(true)
    // A colour where a number is wanted is refused by name, not emitted.
    const refused = createControlGraph([remote], [])
    expect(refused.resolve('r', 'remote:tint', 'float')).toBeNull()
    expect([...refused.errors][0]).toContain('remote:tint: control graph requires float')
  })
})

describe('validation', () => {
  it('names a board with no Wi-Fi and offers the fix', () => {
    const { nodes, edges } = remoteGraph()
    const errors = validateGraph(nodes, edges, 'arduino:avr:uno').errors
    expect(errors.some((error) => error.startsWith('The Web Remote needs Wi-Fi:')
      && error.includes('selected board (arduino:avr:uno)')
      && error.includes('Choose an ESP32'))).toBe(true)
    // Only the remote's own sentence, not the generic Art-Net one.
    expect(errors.some((error) => error.includes('Art-Net, sACN, DDP and NTP'))).toBe(false)
    expect(validateGraph(nodes, edges, 'esp32:esp32:esp32h2').errors.some((error) => error.startsWith('The Web Remote needs Wi-Fi'))).toBe(true)
    for (const fqbn of ['esp32:esp32:esp32s3', 'esp8266:esp8266:nodemcuv2']) {
      expect(validateGraph(nodes, edges, fqbn).errors.some((error) => error.includes('Web Remote')), fqbn).toBe(false)
    }
    const diagnostic = buildGraphDiagnostics(nodes, edges, { selectedFqbn: 'arduino:avr:uno' })
      .find((entry) => entry.id === 'r-board-web-remote')
    expect(diagnostic).toMatchObject({ severity: 'error', action: 'choose-board', nodeIds: ['r'] })
  })

  it('refuses a second remote and warns about an empty one', () => {
    const { nodes, edges } = remoteGraph()
    const second = node('r2', 'WebRemoteInput')
    const result = validateGraph([...nodes, second], edges, 'esp32:esp32:esp32s3')
    expect(result.errors.some((error) => error.startsWith('Only one Web Remote can be served'))).toBe(true)
    expect(result.warnings.some((warning) => warning.includes('has no controls'))).toBe(true)
  })

  it('asks for the Wi-Fi name like every other network user', () => {
    const { nodes, edges } = remoteGraph()
    expect(validateGraph(nodes, edges, 'esp32:esp32:esp32s3').warnings.some((warning) => warning.includes('missing its Wi-Fi SSID'))).toBe(true)
  })
})
