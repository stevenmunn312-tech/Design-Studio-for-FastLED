import { describe, expect, it } from 'vitest'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { createDisplayDocument, addDisplayWidget } from '../../state/displayEditor'
import { customDisplayAssetRequests } from '../../state/customDisplayResources'
import { buildShowPlayer, buildShowPlayerForMeasurement, buildShowPayload } from '../../utils/showUpload'
import { buildGraphDiagnostics, findDisplayGeneratorIssues, findOutputRuntimeIssues } from '../../utils/validateGraph'
import { playerControlGraph } from '../playerControlGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge
const root = [node('player', 'PatternMaster'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
  node('sd', 'SDCard'), node('amp', 'Amplifier', { maxVolume: 6 })]
const route = [edge('player', 'frame', 'out', 'frame')]
const groups = { pattern: { nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')], edges: [edge('fill', 'frame', 'end', 'frame')] } }
const screen = (id = 'screen', properties = {}) => node(id, 'Display', {
  displayId: id, partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', ...properties,
})
function document(id = 'screen') {
  let doc = createDisplayDocument(id, 240, 320)
  for (const type of ['Slider', 'Button', 'Text', 'Progress', 'Timecode'] as const) doc = addDisplayWidget(doc, type)
  return doc
}
const docs = { screen: document() }
const generate = (nodes: StudioNode[], edges: StudioEdge[], collection = true) => buildShowPlayer([...root, ...nodes], [...route, ...edges], groups, {
  patternSet: collection ? ['pattern'] : [], bakedAudio: false, genericPlayer: collection, preferredTrack: '', displayDocuments: docs,
})

describe('custom displays in SD-player firmware', () => {
  it.each([false, true])('runs widget controls and publishes track readouts with or without collection renderers (%s)', (collection) => {
    const nodes = [screen(), node('controls', 'PlayerControls', { debounceMs: 0 }), node('math', 'Math', { mathOp: 'multiply', b: 0.5 })]
    const edges = [edge('screen', 'widget:slider:out', 'math', 'a'), edge('math', 'result', 'controls', 'brightness'),
      edge('screen', 'widget:button:out', 'controls', 'playPause'), edge('controls', 'controls', 'player', 'controls'),
      edge('player', 'title', 'screen', 'widget:text:value'), edge('player', 'progress', 'screen', 'widget:progress:value'),
      edge('player', 'elapsed', 'screen', 'widget:timecode:value')]
    const cpp = generate(nodes, edges, collection)
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    expect(cpp).toContain('lv_display_set_default(_cdDisp_screen);')
    expect(cpp.indexOf('lv_display_set_default(_cdDisp_screen)')).toBeLessThan(cpp.indexOf('_cdScreen_screen = lv_obj_create'))
    expect(cpp).toContain('static char songTitle[SONG_FIELD_BYTES]')
    expect(cpp).toContain('songResetFromFile(')
    expect(loop).toContain('char n_player_title[64]; _dsCopy(n_player_title, songTitle);')
    expect(loop).toContain('float n_player_progress = songProgress();')
    expect(loop).toContain('float n_player_elapsed = songElapsedSec();')
    expect(loop).not.toContain('n_player_album')
    const ordered = ['if (provTransferring) return;', 'lv_indev_read(_cdIndev_screen)', 'float n_screen_widget_slider_out',
      'float n_math_result', 'n_controls_controls.hasBrightness = true;', 'if (n_controls_controls.playPause && audio.pauseResume())', 'audio.loop();']
    const offsets = ordered.map((part) => loop.indexOf(part))
    expect(offsets.every((offset) => offset >= 0)).toBe(true)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    expect(loop.lastIndexOf('_cdSetText(_cd_screen[2], n_player_title);')).toBeGreaterThan(loop.lastIndexOf('FastLED.show();'))
    expect(loop.lastIndexOf('_cdServiceLvgl();')).toBeGreaterThan(loop.lastIndexOf('FastLED.show();'))
    if (collection) {
      const eof = loop.slice(loop.indexOf('if (GENERIC_PLAYER && audioEnded)'), loop.indexOf('// getAudioCurrentTime()'))
      expect(eof.indexOf('_cdServiceLvgl();')).toBeLessThan(eof.indexOf('return;'))
    }
    expect(findDisplayGeneratorIssues([...root, ...nodes], [...route, ...edges], docs).errors).toEqual([])
    expect(findOutputRuntimeIssues([...root, ...nodes], [...route, ...edges], docs).errors).toEqual([])
  })

  it('keeps synchronized volume normalized to the player control setting under an amplifier cap', () => {
    const cpp = generate([screen(), node('controls', 'PlayerControls')], [
      edge('screen', 'widget:slider:out', 'controls', 'volume'), edge('controls', 'controls', 'player', 'controls'),
      edge('player', 'volume', 'screen', 'widget:slider:set'),
    ])
    expect(cpp).toContain('lroundf(playerVolume * 6)')
    expect(cpp).toContain('float n_player_volume = playerVolume;')
    expect(cpp).toContain('constrain((float)(n_player_volume), _cd_screen[0].minimum, _cd_screen[0].maximum)')
    expect(cpp.indexOf('float n_player_volume = playerVolume;')).toBeLessThan(cpp.indexOf('playerVolume = constrain((n_controls_controls.hasVolume'))
  })

  it('shares scalar computations between widget readouts, fixed screens and chained controls', () => {
    const nodes = [screen(), node('map', 'MapRange'), node('format', 'FormatNumber'), node('first', 'PlayerControls'),
      node('last', 'PlayerControls', { debounceMs: 55 }), node('button', 'ButtonInput', { pin: 12, pullup: false }),
      node('fixed', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport' })]
    const edges = [edge('screen', 'widget:slider:out', 'map', 'value'), edge('map', 'result', 'format', 'value'),
      edge('format', 'text', 'screen', 'widget:text:value'), edge('format', 'text', 'fixed', 'title'),
      edge('map', 'result', 'first', 'volume'), edge('fixed', 'controls', 'first', 'controlsIn'),
      edge('first', 'controls', 'last', 'controlsIn'), edge('button', 'pressed', 'last', 'next'),
      edge('last', 'controls', 'player', 'controls')]
    const cpp = generate(nodes, edges)
    expect(cpp.match(/float n_map_result =/g)).toHaveLength(1)
    expect(cpp.match(/static void _dsFormatNumber\(/g)).toHaveLength(1)
    expect(cpp.match(/static uint16_t _xptRead12/g)).toHaveLength(1)
    expect(cpp).toContain('n_first_controls = n_fixed_controls;')
    expect(cpp).toContain('n_last_controls = n_first_controls;')
    expect(cpp).toContain('digitalRead(12) == HIGH')
    expect(cpp).toContain('.update(n_button_pressed, _pcNow_last, false, 55u,')
    expect(cpp).toContain('if (n_last_controls.next) changePlayerTrack(1);')
  })

  it('rejects unsupported sources, wrong types and output wires before code generation', () => {
    const nodes = [...root, screen(), node('wave', 'Wave'), node('controls', 'PlayerControls')]
    const edges = [...route, edge('wave', 'value', 'controls', 'brightness'), edge('controls', 'controls', 'player', 'controls')]
    const issues = playerControlGraph(nodes, edges, docs).errors
    expect(issues.join(' ')).toContain('an SD player cannot evaluate')
    expect(() => buildShowPlayer(nodes, edges, {}, { bakedAudio: false, preferredTrack: '', displayDocuments: docs })).toThrow('unsupported')
    expect(buildGraphDiagnostics(nodes, edges, { displayDocuments: docs })).toContainEqual(expect.objectContaining({ message: expect.stringContaining('cannot evaluate') }))
    expect(() => generate([screen()], [edge('player', 'title', 'screen', 'widget:slider:set')])).toThrow('requires float')
    expect(() => generate([screen()], [edge('screen', 'widget:slider:out', 'out', 'brightness')])).toThrow('Player Controls')
  })

  it('uses identical prepared asset bytes for measurement and the actual upload payload', () => {
    const doc = addDisplayWidget(document(), 'Image/Icon'), art = doc.widgets.at(-1)!
    art.properties = { assetId: 'icon:power', tint: true }
    art.bounds = { x: 0, y: 0, width: 2, height: 1 }
    const asset = { ...customDisplayAssetRequests(doc)[0], data: new Uint8Array([0x12, 0x34]) }
    const options = { displayDocuments: { screen: doc }, customDisplayAssets: { screen: [asset] } }
    const nodes = [...root, screen()]
    const measured = buildShowPlayerForMeasurement(nodes, route, {}, '', false, '', options)
    const uploaded = buildShowPayload(nodes, route, [], {}, options)?.player
    expect(measured).toBe(uploaded)
    expect(uploaded).toContain('_cdAsset_screen_0_map[] PROGMEM')
    expect(uploaded).toContain('0x12, 0x34,')
    expect(() => buildShowPlayerForMeasurement(nodes, route, {}, '', false, '', { displayDocuments: { screen: doc } })).toThrow('has not been baked')
  })
})
