import { afterEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../cppGenerator'
import { generateShowSketch } from '../../showGenerator'
import { generatePlayerSketch } from '../../playerSketchGenerator'
import { playerControlGraph } from '../../player/playerControlGraph'
import { specializeCpp } from '../../cppSpecialize'
import { boardPartition } from '../../../build/boardPartition'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { useBoardLinkKeyStore } from '../../../state/peripherals/boardLinkKey'
import { useNetworkCredentialsStore } from '../../../state/peripherals/networkCredentials'
import { webRemoteOutputs } from '../../../state/peripherals/webRemote'
import { parseTelemetryLine } from '../../../state/upload/deviceTelemetry'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { applyDisplayTemplate } from '../../../state/displays/displayTemplates'
import { createDisplayDocument } from '../../../state/displays/displayEditor'
import { displayWidgetSources } from '../../../state/displays/displayRegistry'
import { CUSTOM_DESIGN_LAYOUT } from '../../../state/displays/transportDisplay'

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

describe('board link — a Touch Screen on one board driving a Music Player on another', () => {
  // Board 2's panel is the transport: its Touch Screen's one Controls wire
  // runs to Board 1's Music Player, exactly as it would on one board.
  const touch = {
    ...node('touch', 'TouchInput', { panelId: 'tft', ...on2 }),
  } as StudioNode
  touch.data.outputs = [
    { id: 'controls', label: 'Controls', dataType: 'playercontrols' },
    { id: 'previous', label: 'Previous', dataType: 'bool' },
    { id: 'playPause', label: 'Play / Pause', dataType: 'bool' },
    { id: 'next', label: 'Next', dataType: 'bool' },
    { id: 'volume', label: 'Volume', dataType: 'float' },
  ]
  const nodes = [
    node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'),
    node('master', 'PatternMaster'), node('card', 'SDCard'), node('amp', 'Amplifier'),
    node('collection', 'PatternCollection', { patternIds: ['pattern'] }), output,
    tftPanel('tft', 'Fixed Transport', on2), touch,
  ]
  const edges = [
    edge('collection', 'patternset', 'master', 'patternset'),
    edge('master', 'frame', 'out', 'frame'),
    edge('card', 'storage', 'master', 'storage'),
    edge('master', 'audio', 'amp', 'audio'),
    edge('master', 'display', 'tft', 'display'),
    edge('touch', 'controls', 'master', 'controls'),
  ]

  it('carries the Controls wire as the presses and levels the panel can make', () => {
    const one = boardPartition(nodes, edges, 'board-root')
    const linkIn = one.nodes.find((entry) => entry.data.nodeType === 'BoardLinkIn' && entry.data.properties.dataType === 'playercontrols')
    expect(linkIn).toBeDefined()
    expect((linkIn!.data.properties.fields as { id: string; kind: string }[]).map((field) => [field.id, field.kind])).toEqual([
      ['playPause', 'press'], ['previous', 'press'], ['next', 'press'], ['volume', 'float'], ['volumeSet', 'bool'],
    ])
    // The wire keeps its own id and lands on the player's Controls.
    expect(one.edges.find((entry) => entry.id === 'touch-controls-master-controls')?.source).toBe(linkIn!.id)
  })

  it('rebuilds the bundle in the player sketch for the Music Player to read', () => {
    const one = boardPartition(nodes, edges, 'board-root')
    const routing = playerControlGraph(one.nodes, one.edges, {}, 'master')
    expect(routing.errors).toEqual([])
    const src = generatePlayerSketch({}, undefined, { controlGraph: routing, patternNames: { master: ['Aurora'] } })
    expect(src).toContain('PlayerControlsValue')
    // Each press is the link's counted press, with no debounce of its own.
    expect(src).toMatch(/_pcE_\w+_playPause\.update\(_lnkPO1\[0\], _pcNow_\w+, false, 0u/)
    expect(src).toMatch(/_pcE_\w+_next\.update\(_lnkPO1\[2\]/)
    // The volume commands only once a finger has set it on Board 2.
    expect(src).toMatch(/if \(\(_lnkUp1 && \(_lnkW1\[1\] != 0u\)\)\) \{/)
    // And the volume Board 2's panel reads back is on the scale it was set on:
    // read out of 21 while set out of 18, a synced slider fell to zero.
    expect(src).toContain('_lnkBits((PLAYER_MAX_VOLUME ? audio.getVolume() / (float)PLAYER_MAX_VOLUME : 0.0f))')
  })

  it('sends the finished bundle from the panel board', () => {
    const two = boardPartition(nodes, edges, 'board-2')
    const cpp = specializeCpp(generateCpp(two.nodes, two.edges), ESP32)
    expect(cpp).toContain('PlayerControlsValue n_touch_controls;')
    expect(cpp).toContain('_lnkStagePress(0, 0, n_touch_controls.playPause);')
    expect(cpp).toContain('_lnkStagePress(2, 2, n_touch_controls.next);')
    expect(cpp).toMatch(/_lnkStageWord\(3, 0, _lnkBits\(\(\[&\]\(\) \{ static float held = 0\.0f; if \(n_touch_controls\.hasVolume\)/)
    // Board 2 receives too, but only the screen's readings: no press comes back.
    expect(cpp).not.toMatch(/_lnkPO/)
  })
})

describe('board link — a Touch Screen on one board driving another board\'s LEDs', () => {
  it('rebuilds the bundle in a normal sketch for the LED output to latch', () => {
    const touch = node('touch', 'TouchInput', { panelId: 'tft', ...on2 })
    touch.data.outputs = [
      { id: 'controls', label: 'Controls', dataType: 'playercontrols' },
      { id: 'ledToggle', label: 'LED On / Off', dataType: 'bool' },
      { id: 'brightness', label: 'Brightness', dataType: 'float' },
    ]
    const nodes = [
      node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'),
      node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 1 }),
      tftPanel('tft', 'Fixed Transport', on2), touch,
    ]
    const edges = [edge('fill', 'frame', 'out', 'frame'), edge('touch', 'controls', 'out', 'controls')]
    const one = boardPartition(nodes, edges, 'board-root')
    const cpp = specializeCpp(generateCpp(one.nodes, one.edges), ESP32)
    expect(cpp).toContain('PlayerControlsValue n_board_link_in_touch_controls_value;')
    expect(cpp).toMatch(/_pcE_\w+_ledToggle\.update\(_lnkPO1\[0\]/)
    expect(cpp).toContain('n_board_link_in_touch_controls_value.hasBrightness = true;')
    // The LED output latches the rebuilt bundle, as it would a local one.
    expect(cpp).toContain('if (n_board_link_in_touch_controls_value.ledToggle) _ledOn_out = !_ledOn_out;')
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    const built = loop.indexOf('PlayerControlsValue n_board_link_in_touch_controls_value;')
    expect(built).toBeGreaterThan(-1)
    expect(loop.indexOf('n_board_link_in_touch_controls_value.ledToggle)')).toBeGreaterThan(built)
  })
})

describe('board link — a screen design on one board showing another board\'s Music Player', () => {
  it('holds its synced volume slider while the player\'s board is not heard', () => {
    // The D-13 bench: a Music Player on Board 1, a CYD on Board 2 whose design
    // binds a Slider to the player's volume. A track change keeps Board 1 from
    // sending for over a second, and the reading's lost value is 0.
    const design = applyDisplayTemplate(createDisplayDocument('remote-screen', 240, 320), 'minimal-transport')
    const panel = tftPanel('tft', CUSTOM_DESIGN_LAYOUT, {
      ...on2, displayId: design.displayId, widgetSources: displayWidgetSources(design),
    })
    const nodes = [
      node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'),
      node('master', 'PatternMaster'), node('card', 'SDCard'), node('amp', 'Amplifier'),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }), output, panel,
    ]
    const edges = [
      edge('collection', 'patternset', 'master', 'patternset'),
      edge('master', 'frame', 'out', 'frame'),
      edge('card', 'storage', 'master', 'storage'),
      edge('master', 'audio', 'amp', 'audio'),
      edge('master', 'display', 'tft', 'display'),
    ]
    const two = boardPartition(nodes, edges, 'board-2')
    const cpp = generateCpp(two.nodes, two.edges, {}, { displayDocuments: { [design.displayId]: design } })
    expect(cpp).toMatch(/if \(_cdSyncTakes\(_cd_\w+\[\d+\], _lnkUp0\)\) \{\n\s+_cd_\w+\[\d+\]\.floatValue = constrain\(\(float\)\(\(_lnkUp0 \? _lnkFloat/)
  })
})

describe('board link — a board off Wi-Fi beside one on it', () => {
  afterEach(() => {
    useNetworkCredentialsStore.getState().removeCredentials('remote')
  })
  const remote = (extra: Record<string, unknown> = {}) => node('remote', 'WebRemoteInput', {
    controls: [{ id: 'level', type: 'Slider', label: 'Level', properties: {} }], ...extra,
  })

  it('scans for the network the other board joins, and takes its channel', () => {
    // The D-13 bench: Board 2 joins the network, Board 1 joins none.
    useNetworkCredentialsStore.getState().setCredentials('remote', { ssid: 'Studio "B"', password: 'secret-pass' })
    const nodes = [
      node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'),
      node('fill', 'SolidColor'), node('dim', 'BrightnessMod'), node('out', 'MatrixOutput', { width: 8, height: 1 }),
      remote(on2),
    ]
    const edges = [
      edge('fill', 'frame', 'dim', 'frame'), edge('dim', 'frame', 'out', 'frame'),
      edge('remote', 'remote:level', 'dim', 'brightness'),
    ]
    const { one, two } = sketches({ nodes, edges })
    const follower = specializeCpp(one, ESP32)
    expect(follower).toContain('static const char _lnkFollowSsid[] = "Studio \\"B\\"";')
    expect(follower).toContain('WiFi.scanNetworks(true, true, false, 120, 0, _lnkFollowSsid) == WIFI_SCAN_RUNNING;')
    // Started at once, looked at every pass, and the radio put back on the channel found.
    expect(follower).toContain('  _lnkScanStart(millis());')
    expect(follower).toContain('  _lnkFollow(now);')
    expect(follower).toContain('esp_wifi_set_channel(_lnkChannel, WIFI_SECOND_CHAN_NONE);')
    expect(follower).toContain('if ((uint32_t)(now - _lnkHeardMs) < 3000u) return;')
    expect(specializeCpp(one, ESP8266)).toContain('wifi_set_channel(_lnkChannel);')
    // The name only: the follower never joins, so the password stays out.
    expect(one).not.toContain('secret-pass')
    // The board on the network rides its router's channel and scans for nothing.
    expect(two).not.toContain('_lnkFollow')
  })

  it('looks again now and then from a board that only sends', () => {
    useNetworkCredentialsStore.getState().setCredentials('remote', { ssid: 'studio', password: 'x' })
    const { nodes, edges } = controlsGraph({
      nodes: [remote(), node('dim2', 'BrightnessMod')],
      edges: [edge('remote', 'remote:level', 'dim2', 'brightness')],
    })
    const rewired = edges.map((entry) => (entry.id === 'dim-frame-out-frame'
      ? edge('dim', 'frame', 'dim2', 'frame')
      : entry))
    rewired.push(edge('dim2', 'frame', 'out', 'frame'))
    const { two } = sketches({ nodes, edges: rewired })
    const sender = specializeCpp(two, ESP8266)
    expect(sender).toContain('_lnkFollowSsid[] = "studio";')
    expect(sender).toContain('if ((uint32_t)(now - _lnkScanAtMs) < 60000u) return;')
    expect(sender).toContain('esp_now_set_peer_channel((uint8_t *)_lnkBroadcast, _lnkChannel);')
    const transmit = sender.slice(sender.indexOf('static void _lnkTransmit() {'))
    expect(transmit.indexOf('_lnkFollow(millis());')).toBeGreaterThan(-1)
  })

  it('follows nothing when no linked board joins a network', () => {
    const { one, two } = sketches(controlsGraph())
    expect(one + two).not.toContain('_lnkFollow')
  })
})

describe('board link — a Controls bundle and a direct action from the same board', () => {
  it('builds the arriving bundle before the Music Player merges a direct press into it', () => {
    const touch = node('touch', 'TouchInput', { panelId: 'tft', ...on2 })
    touch.data.outputs = [
      { id: 'controls', label: 'Controls', dataType: 'playercontrols' },
      { id: 'next', label: 'Next', dataType: 'bool' },
    ]
    const back = node('back', 'WebRemoteInput', {
      ...on2, controls: [{ id: 'back', type: 'Button', label: 'Back', properties: {} }],
    })
    const nodes = [
      node('board-root', 'Board', { linkId: LINK_ID }), node('board-2', 'Board'),
      node('master', 'PatternMaster'), node('card', 'SDCard'), node('amp', 'Amplifier'),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }), output,
      tftPanel('tft', 'Fixed Transport', on2), touch, back,
    ]
    const edges = [
      edge('collection', 'patternset', 'master', 'patternset'),
      edge('master', 'frame', 'out', 'frame'),
      edge('card', 'storage', 'master', 'storage'),
      edge('master', 'audio', 'amp', 'audio'),
      edge('master', 'display', 'tft', 'display'),
      edge('touch', 'controls', 'master', 'controls'),
      edge('back', 'remote:back', 'master', 'previous'),
    ]
    const one = boardPartition(nodes, edges, 'board-root')
    const routing = playerControlGraph(one.nodes, one.edges, {}, 'master')
    expect(routing.errors).toEqual([])
    const src = generatePlayerSketch({}, undefined, { controlGraph: routing, patternNames: { master: ['Aurora'] } })
    const declared = src.indexOf('PlayerControlsValue n_board_link_in_touch_controls_controls;')
    const merged = src.indexOf('n_master_direct_controls = n_board_link_in_touch_controls_controls;')
    expect(declared).toBeGreaterThan(-1)
    expect(merged).toBeGreaterThan(declared)
  })
})

describe('board link — a sender that restarts', () => {
  it('holds only hand-set values, and takes readings and pots at once', () => {
    const remote = node('remote', 'WebRemoteInput', {
      ...on2, controls: [{ id: 'level', type: 'Slider', label: 'Level', properties: {} }],
    })
    const { nodes, edges } = controlsGraph({
      nodes: [remote, node('pot', 'PotInput', { ...on2, pin: 34 }), node('dim2', 'BrightnessMod'), node('dim3', 'BrightnessMod')],
      edges: [edge('remote', 'remote:level', 'dim2', 'brightness'), edge('pot', 'value', 'dim3', 'brightness')],
    })
    const chained = edges.filter((entry) => entry.id !== 'dim-frame-out-frame')
      .concat([edge('dim', 'frame', 'dim2', 'frame'), edge('dim2', 'frame', 'dim3', 'frame'), edge('dim3', 'frame', 'out', 'frame')])
    const two = boardPartition(nodes, chained, 'board-2')
    const table = two.nodes.find((entry) => entry.data.nodeType === 'BoardLinkOut')!.data.properties.link as { frames: Record<string, { index: number; hold?: boolean }[]> }
    // The encoder and the remote slider are set by hand; the pot is not.
    expect(table.frames['board-2'].filter((entry) => entry.hold)).toHaveLength(2)
    const { one } = sketches({ nodes, edges: chained })
    expect(one).toContain('static bool _lnkHold1(uint8_t h, uint32_t v) {')
    expect(one).toContain('if (_lnkHeard1 && session != _lnkSess1) for (uint8_t i = 0; i < 2; i++) { _lnkHH1[i] = true; _lnkHB1[i] = false; }')
  })
})
