import { afterEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../cppGenerator'
import { generateShowSketch } from '../../showGenerator'
import { generatePlayerSketch } from '../../playerSketchGenerator'
import { playerControlGraph } from '../../player/playerControlGraph'
import { specializeCpp } from '../../cppSpecialize'
import { boardPartition } from '../../../build/boardPartition'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { useBoardLinkKeyStore } from '../../../state/peripherals/boardLinkKey'
import { webRemoteOutputs } from '../../../state/peripherals/webRemote'
import { parseTelemetryLine } from '../../../state/upload/deviceTelemetry'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

/*
 * Board links in the three generators (docs/design/board-links.md): a
 * partition with no link node emits nothing of the link, a board that only
 * sends has no receive path, text and press code only where a slot needs it,
 * one platform branch survives specialisation, and no user text reaches the
 * C++ outside a comment.
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
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: [source, sourceHandle, target, targetHandle].join('-'), source, sourceHandle, target, targetHandle }) as StudioEdge

const on2 = { boardId: 'board-2' }
const LINK_ID = '0a1b2c3d'
const ESP32 = { ESP32: true, ESP8266: false }
const ESP8266 = { ESP32: false, ESP8266: true }

/** Board 1 drives the LEDs; Board 2 has the controls. */
function controlsGraph(extra: { nodes?: StudioNode[]; edges?: StudioEdge[] } = {}) {
  const nodes = [
    node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'),
    node('fill', 'SolidColor'), node('dim', 'BrightnessMod'), node('out', 'MatrixOutput', { width: 8, height: 1 }),
    node('enc', 'EncoderInput', on2),
    ...(extra.nodes ?? []),
  ]
  const edges = [
    edge('fill', 'frame', 'dim', 'frame'), edge('dim', 'frame', 'out', 'frame'),
    edge('enc', 'position', 'dim', 'brightness'),
    ...(extra.edges ?? []),
  ]
  return { nodes, edges }
}

function sketches(graph: { nodes: StudioNode[]; edges: StudioEdge[] }) {
  const one = boardPartition(graph.nodes, graph.edges, 'board-root')
  const two = boardPartition(graph.nodes, graph.edges, 'board-2')
  return { one: generateCpp(one.nodes, one.edges), two: generateCpp(two.nodes, two.edges) }
}

afterEach(() => {
  useBoardLinkKeyStore.setState({ byLinkId: {} })
})

describe('board link — the normal sketch', () => {
  it('emits nothing of the link for one board, or two boards no wire crosses', () => {
    const single = generateCpp(
      [node('board-root', 'Board'), node('fill', 'SolidColor'), node('enc', 'EncoderInput'), node('dim', 'BrightnessMod'), node('out', 'MatrixOutput')],
      [edge('fill', 'frame', 'dim', 'frame'), edge('dim', 'frame', 'out', 'frame'), edge('enc', 'position', 'dim', 'brightness')],
    )
    expect(single).not.toMatch(/_lnk|esp_now|FLLK/)
    const apart = controlsGraph()
    const unlinked = sketches({ nodes: apart.nodes, edges: apart.edges.filter((e) => e.source !== 'enc') })
    expect(unlinked.one).not.toMatch(/_lnk|esp_now/)
    expect(unlinked.two).not.toMatch(/_lnk|esp_now/)
  })

  it('sends from a board that only sends, with no receive path', () => {
    const { two } = sketches(controlsGraph())
    expect(two).toContain('_lnkStageWord(0, 0, _lnkBits(n_enc_position));')
    expect(two).toContain('_lnkTransmit();')
    expect(two).toContain(`static const uint32_t LNK_LINK_ID = 0x${LINK_ID}u;`)
    for (const receivePart of ['_lnkReceive', '_lnkRing', '_lnkOnRecv', 'register_recv_cb', '_lnkAccept', 'schema mismatch']) {
      expect(two).not.toContain(receivePart)
    }
    // No press and no text slot, so neither helper.
    expect(two).not.toContain('_lnkStagePress')
    expect(two).not.toContain('_lnkStageText')
  })

  it('reads before the graph on a board that only receives, with no send path', () => {
    const { one } = sketches(controlsGraph())
    const loop = one.slice(one.indexOf('void loop() {'))
    expect(loop.indexOf('_lnkReceive();')).toBeGreaterThan(-1)
    expect(loop.indexOf('_lnkReceive();')).toBeLessThan(loop.indexOf('_lnkFloat(_lnkW1[0])'))
    expect(one).toContain('float n_board_link_in_enc_position_value = _lnkFloat(_lnkW1[0]);')
    expect(one).toContain('Serial.println("link schema mismatch");')
    for (const sendPart of ['_lnkBuild', '_lnkTransmit', '_lnkStage', 'esp_now_add_peer', '_lnkTxCounter']) {
      expect(one).not.toContain(sendPart)
    }
  })

  it('counts presses only where a slot is a press', () => {
    const { one, two } = sketches(controlsGraph({
      nodes: [node('btn', 'ButtonInput', on2)],
      edges: [edge('btn', 'pressed', 'out', 'enabled')],
    }))
    expect(two).toContain('_lnkStagePress(')
    expect(one).toMatch(/bool n_board_link_in_btn_pressed_value = _lnkPO1\[0\];/)
    // One true pass per counted press, and presses made while the link was down are not replayed.
    expect(one).toContain('_lnkPQ1[i]--; _lnkPO1[i] = true;')
    expect(one).toContain('if (fresh || !_lnkUp1)')
  })

  it('carries text only when a slot is text', () => {
    const remote = node('remote', 'WebRemoteInput', {
      ...on2, controls: [{ id: 'msg', type: 'Text Entry', label: 'Message', properties: { initial: 'hi' } }],
    })
    const { one, two } = sketches(controlsGraph({
      nodes: [remote, node('words', 'Text')],
      edges: [edge('remote', 'remote:msg', 'words', 'text'), edge('words', 'frame', 'out', 'frame')],
    }))
    expect(two).toContain('_lnkStageText(')
    expect(two).toContain('static char _lnkTxText[1][64];')
    expect(one).toMatch(/const char \* n_board_link_in_remote_remote_msg_value = _lnkT1\[0\];/)
    expect(one).toContain('if (len > 63 || at + len > n) return;')
    // The text sender joins the remote's Wi-Fi, so it rides the access point's channel.
    expect(specializeCpp(two, ESP32)).toContain('WiFi.setSleep(false);')
    expect(specializeCpp(two, ESP32)).not.toContain('esp_wifi_set_channel')
    expect(specializeCpp(one, ESP32)).toContain('esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);')
  })

  it('keeps exactly one platform branch after specialisation', () => {
    const { one, two } = sketches(controlsGraph())
    const esp32 = specializeCpp(one, ESP32)
    expect(esp32).toContain('#include <esp_now.h>')
    expect(esp32).toContain('#include <mbedtls/md.h>')
    expect(esp32).toContain('portENTER_CRITICAL(&_lnkMux);')
    // The receive callback's signature is chosen by the core, which generation does not know.
    expect(esp32).toContain('#if ESP_ARDUINO_VERSION_MAJOR >= 3')
    expect(esp32).toContain('static void _lnkOnRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len)')
    expect(esp32).not.toMatch(/espnow\.h|bearssl|noInterrupts/)
    const esp8266 = specializeCpp(one, ESP8266)
    expect(esp8266).toContain('#include <espnow.h>')
    expect(esp8266).toContain('#include <bearssl/bearssl_hmac.h>')
    expect(esp8266).toContain('noInterrupts();')
    expect(esp8266).toContain('esp_now_set_self_role(ESP_NOW_ROLE_COMBO);')
    expect(esp8266).not.toMatch(/esp_now\.h|mbedtls|portMUX|ESP_ARDUINO_VERSION_MAJOR/)
    expect(specializeCpp(two, ESP8266)).toContain('esp_now_add_peer((uint8_t *)_lnkBroadcast, ESP_NOW_ROLE_COMBO, 1, NULL, 0)')
  })

  it('writes the key from the store as bytes, and a zero key without one', () => {
    expect(sketches(controlsGraph()).two).toContain('static const uint8_t _lnkKey[16] = { 0x00, 0x00')
    useBoardLinkKeyStore.setState({ byLinkId: { [LINK_ID]: '00112233445566778899aabbccddeeff' } })
    const { two } = sketches(controlsGraph())
    expect(two).toContain('static const uint8_t _lnkKey[16] = { 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff };')
    expect(two).not.toContain('#error')
  })

  it('names nodes only in comments', () => {
    const odd = 'enc"*/\\x'
    const graph = controlsGraph()
    const nodes = graph.nodes.map((n) => (n.id === 'enc' ? { ...n, id: odd } : n))
    const edges = graph.edges.map((e) => (e.source === 'enc' ? { ...e, source: odd } : e))
    const { two } = sketches({ nodes, edges })
    const named = two.split('\n').filter((line) => line.includes('enc"'))
    expect(named.length).toBeGreaterThan(0)
    // On each line that names it, the id comes after the comment opens.
    for (const line of named) {
      expect(line.indexOf('//')).toBeGreaterThan(-1)
      expect(line.indexOf('//')).toBeLessThan(line.indexOf('enc"'))
    }
  })

  it('reports frames received, dropped and the last frame\'s age with telemetry on', () => {
    const graph = controlsGraph()
    const nodes = graph.nodes.map((n) => (n.id === 'board-root'
      ? node('board-root', 'Board', { linkId: LINK_ID, reportTelemetry: true, profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }) : n))
    const part = boardPartition(nodes, graph.edges, 'board-root')
    const cpp = generateCpp(part.nodes, part.edges)
    expect(cpp).toContain('FLS_STAT')
    expect(cpp).toContain('lnkrx=%lu lnkid=%lu lnkhash=%lu lnktag=%lu lnkold=%lu lnkring=%lu')
    expect(cpp).toContain('if (_lnkHeardAny) Serial.printf(" lnkms=%lu"')
    expect(cpp).toContain('_lnkDropRing++;')
  })
})

describe('board link — telemetry line', () => {
  it('reads the link keys back, and leaves them out of a board without a link', () => {
    const base = 'FLS_STAT uptime=4 heap=1000 minheap=900 fps=60.0'
    expect(parseTelemetryLine(base)).not.toHaveProperty('link')
    expect(parseTelemetryLine(`${base} lnkrx=12 lnkid=1 lnkhash=2 lnktag=3 lnkold=4 lnkring=5 lnkms=40`)!.link).toEqual({
      framesReceived: 12, dropped: { id: 1, hash: 2, tag: 3, stale: 4, ring: 5 }, msSinceFrame: 40,
    })
    expect(parseTelemetryLine(`${base} lnkrx=0 lnkid=0 lnkhash=0 lnktag=0 lnkold=0 lnkring=0`)!.link!.msSinceFrame).toBeNull()
  })
})

const tftPanel = (id: string, layout: string, extra: Record<string, unknown> = {}) => node(id, 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: layout,
  sckPin: 18, mosiPin: 23, misoPin: 19, csPin: 5, dcPin: 16, resetPin: 17, backlightPin: 4, ...extra,
})
const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })
const patternGroups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
}

describe('board link — a Music Player on one board, its screen on another', () => {
  const nodes = [
    node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'),
    node('master', 'PatternMaster'), node('card', 'SDCard'), node('amp', 'Amplifier'),
    node('collection', 'PatternCollection', { patternIds: ['pattern'] }), output,
    tftPanel('tft', 'Fixed Transport', on2), node('enc', 'EncoderInput', on2), node('controls', 'ControlMap'),
  ]
  const edges = [
    edge('collection', 'patternset', 'master', 'patternset'),
    edge('master', 'frame', 'out', 'frame'),
    edge('card', 'storage', 'master', 'storage'),
    edge('master', 'audio', 'amp', 'audio'),
    edge('master', 'display', 'tft', 'display'),
    edge('enc', 'pressed', 'controls', 'next'),
    edge('controls', 'controls', 'master', 'controls'),
  ]

  it('sends the fields the remote panel draws from the player sketch, and reads the press', () => {
    const one = boardPartition(nodes, edges, 'board-root')
    const routing = playerControlGraph(one.nodes, one.edges, {}, 'master')
    expect(routing.errors).toEqual([])
    const src = generatePlayerSketch({}, undefined, { controlGraph: routing, patternNames: { master: ['Aurora'] } })
    expect(src).toContain('_lnkStageText(0, 0, songTitle);')
    expect(src).toContain('_lnkStageWord(1, 0, ((songPlaying()) ? 1u : 0u));')
    expect(src).toContain('_lnkStageText(3, 1, _patNameStr_player(_sel_player.active));')
    expect(src).toContain('bool n_board_link_in_enc_pressed_value = _lnkPO1[0];')
    const loop = src.slice(src.indexOf('void loop() {'))
    expect(loop.indexOf('_lnkReceive();')).toBeLessThan(loop.indexOf('_lnkPO1[0]'))
    expect(loop.indexOf('_lnkTransmit();')).toBeGreaterThan(loop.indexOf('FastLED.show();'))
  })

  it('draws the arriving fields on the remote panel, and its waiting screen while the link is lost', () => {
    const two = boardPartition(nodes, edges, 'board-2')
    const cpp = generateCpp(two.nodes, two.edges)
    expect(cpp).toContain('bool _tftAbsent_tft = !_lnkUp0;')
    expect(cpp).toContain('const char *_tftTitle_tft = (_lnkUp0 ? (const char *)_lnkT0[0] : "");')
    expect(cpp).toContain('WAITING FOR A SIGNAL')
    // The press it sends; the picture it never does.
    expect(cpp).toContain('_lnkStagePress(0, 0, n_enc_pressed);')
    expect(cpp.slice(cpp.indexOf('void loop() {'))).not.toContain('_tftPicture(')
  })
})

describe('board link — a slideshow on one board, its screen on another', () => {
  const nodes = [
    node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'),
    node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
    node('show', 'PatternSlideshow'), output,
    tftPanel('tft', 'Show Status', on2), node('btn', 'ButtonInput', on2), node('controls', 'ControlMap'),
  ]
  const edges = [
    edge('collection', 'patternset', 'show', 'patternset'),
    edge('show', 'frame', 'out', 'frame'),
    edge('show', 'display', 'tft', 'display'),
    edge('btn', 'pressed', 'controls', 'patternNext'),
    edge('controls', 'controls', 'show', 'controls'),
  ]

  it('stages the running pattern after the frame and reads the remote button before the graph', () => {
    const one = boardPartition(nodes, edges, 'board-root')
    const src = generateShowSketch(one.nodes, one.edges, patternGroups, { patternNames: { show: ['Aurora'] } })
    expect(src).toContain('_lnkStageText(0, 0, _patNameStr_show(_sel_show.active));')
    expect(src).toContain('_lnkStageWord(1, 0, _lnkBits(((float)(showPatternIndex + 1))));')
    expect(src).toContain('bool n_board_link_in_btn_pressed_value = _lnkPO1[0];')
    const loop = src.slice(src.indexOf('void loop() {'))
    expect(loop.indexOf('_lnkReceive();')).toBeLessThan(loop.indexOf('_lnkPO1[0]'))
    expect(loop.indexOf('_lnkTransmit();')).toBeGreaterThan(loop.indexOf('FastLED.show();'))
  })

  it('shows the arriving pattern on a Show Status panel in the normal sketch', () => {
    const two = boardPartition(nodes, edges, 'board-2')
    const cpp = generateCpp(two.nodes, two.edges)
    expect(cpp).toContain('const char *_tftPattern_tft = (_lnkUp0 ? (const char *)_lnkT0[0] : "");')
    expect(cpp).toMatch(/_tftWhole\(\(\(_lnkUp0 \? _lnkFloat\(_lnkW0\[0\]\) : 0\.0f\) - 1\.0f\)\)/)
  })
})
