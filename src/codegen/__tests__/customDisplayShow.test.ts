import { describe, expect, it } from 'vitest'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { createDisplayDocument, addDisplayWidget } from '../../state/displayEditor'
import type { DisplayDocument, DisplayDocumentRegistry } from '../../state/displayDocument'
import { customDisplayAssetRequests } from '../../state/customDisplayResources'
import { generateShowSketch } from '../showGenerator'
import { showControlRouting } from '../showControlRouting'
import { buildGraphDiagnostics, findOutputRuntimeIssues, findDisplayGeneratorIssues } from '../../utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge
const root = [node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow'),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 })]
const routing = [edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame')]
const groups = { pattern: { nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')], edges: [edge('fill', 'frame', 'end', 'frame')] } }

// Panel/document split: the document (`screen`) has no pins of its own; a
// `TransportDisplay` panel carries them, wired through `customDisplay`. See
// docs/development/design/large-displays-and-control-routing.md.
const screen = (id = 'screen', properties: Record<string, unknown> = {}) => node(id, 'Display', { displayId: id, ...properties })
const panel = (id: string, properties: Record<string, unknown> = {}) => node(id, 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', ...properties,
})
const link = (docId: string, panelId: string) => edge(docId, 'customDisplay', panelId, 'customDisplay')

function document(id = 'screen'): DisplayDocument {
  let doc = createDisplayDocument(id, 240, 320)
  for (const type of ['Slider', 'Toggle', 'Numeric Readout', 'Text'] as const) doc = addDisplayWidget(doc, type)
  return doc
}
const generate = (nodes: StudioNode[], edges: StudioEdge[], documents: DisplayDocumentRegistry) =>
  generateShowSketch([...root, ...nodes], [...routing, ...edges], groups, { displayDocuments: documents })

describe('custom displays in generative shows', () => {
  it('samples touch before scalar feedback, renders LEDs, then updates widgets and flushes LVGL', () => {
    const doc = document()
    const numberId = doc.widgets.find((widget) => widget.type === 'Numeric Readout')!.id
    const nodes = [screen(), panel('tft'), node('math', 'Math', { mathOp: 'add', b: 0.25 }), node('controls', 'PlayerControls'), node('format', 'FormatNumber')]
    const edges = [link('screen', 'tft'), edge('screen', 'widget:slider:out', 'math', 'a'), edge('math', 'result', 'screen', 'widget:slider:set'),
      edge('math', 'result', 'screen', `widget:${numberId}:value`), edge('math', 'result', 'format', 'value'),
      edge('format', 'text', 'screen', 'widget:text:value'), edge('math', 'result', 'controls', 'brightness'),
      edge('controls', 'controls', 'out', 'controls'), edge('screen', 'widget:toggle:out', 'out', 'enabled')]
    const cpp = generate(nodes, edges, { screen: doc })
    expect(showControlRouting([...root, ...nodes], [...routing, ...edges], { screen: doc }).errors).toEqual([])
    const setup = cpp.slice(cpp.indexOf('void setup() {'), cpp.indexOf('void loop() {'))
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    expect(setup.indexOf('lv_init();')).toBeLessThan(setup.indexOf('lv_display_create'))
    expect(setup.indexOf('lv_display_set_default(_cdDisp_tft)')).toBeLessThan(setup.indexOf('_cdScreen_screen = lv_obj_create'))
    expect(setup).toContain('lv_indev_set_mode(_cdIndev_tft, LV_INDEV_MODE_EVENT);')
    const ordered = ['lv_indev_read(_cdIndev_tft);', 'float n_screen_widget_slider_out = _cdFloatOutput',
      'float n_math_result = (n_screen_widget_slider_out) + (0.25);', 'n_controls_controls.brightness',
      'if (!((n_screen_widget_toggle_out) && _ledOn_out))', 'FastLED.show();', '_cdSetText(_cd_screen[3], n_format_text);', '_cdServiceLvgl();']
    const positions = ordered.map((part) => loop.indexOf(part))
    expect(positions.every((position) => position >= 0), loop).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(loop).toContain('constrain((float)(n_math_result), _cd_screen[0].minimum, _cd_screen[0].maximum)')
    expect(loop.match(/float n_math_result =/g)).toHaveLength(1)
    expect(cpp.match(/static void _dsFormatNumber\(/g)).toHaveLength(1)
    expect(loop).not.toContain('String(')
  })

  it('snapshots both screens before cross-screen feedback and uses distinct panel types', () => {
    const cpp = generate([screen('1-first'), panel('tft1'), screen('second'), panel('tft2')], [
      link('1-first', 'tft1'), link('second', 'tft2'),
      edge('1-first', 'widget:slider:out', 'second', 'widget:slider:set'),
      edge('second', 'widget:slider:out', '1-first', 'widget:slider:set'),
    ], { '1-first': document('1-first'), second: document('second') })
    expect(cpp).toContain('struct CustomDisplayPanel_tft1 {')
    expect(cpp).toContain('struct CustomDisplayPanel_tft2 {')
    expect(cpp.match(/lv_init\(\);/g)).toHaveLength(1)
    expect(cpp.match(/static uint16_t _xptRead12/g)).toHaveLength(1)
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    expect(loop.indexOf('lv_indev_read(_cdIndev_tft2)')).toBeLessThan(loop.indexOf('float n_1_first_widget_slider_out'))
    expect(loop.indexOf('float n_second_widget_slider_out')).toBeLessThan(loop.indexOf('constrain((float)(n_1_first_widget_slider_out)'))
    expect(cpp.indexOf('lv_display_set_default(_cdDisp_tft2)')).toBeLessThan(cpp.indexOf('_cdScreen_second = lv_obj_create'))
  })

  it('composes scalar brightness with the Controls latch and supports HUB75', () => {
    const nodes = [screen(), panel('tft'), node('controls', 'PlayerControls')]
    const edges = [link('screen', 'tft'), edge('screen', 'widget:slider:out', 'out', 'brightness'), edge('controls', 'controls', 'out', 'controls')]
    const cpp = generate(nodes, edges, { screen: document() })
    expect(cpp).toContain('constrain(n_screen_widget_slider_out, 0.0f, 1.0f) * _ledLevel_out')
    const hubNodes = [...root.filter((n) => n.id !== 'out'), node('out', 'MatrixOutput', { chipset: 'HUB75', width: 64, height: 32 }), ...nodes]
    const hub = generateShowSketch(hubNodes, [...routing, ...edges], groups, { displayDocuments: { screen: document() } })
    expect(hub).toContain('constrain(n_screen_widget_slider_out, 0.0f, 1.0f) * _ledLevel_out')
    expect(hub).toContain('setBrightness8')
  })

  /*
   * Off means the same thing here as in a normal sketch: dark, no touch,
   * outputs at rest. It used to mean "not in the firmware at all", which made
   * Enabled a build switch in this generator and a runtime one in the other,
   * and left a wired Enabled with nothing to switch.
   */
  it('builds a disabled display but holds it dark, untouched and at rest', () => {
    const cpp = generate(
      [screen('screen'), panel('tft', { enabled: false })],
      [link('screen', 'tft'), edge('screen', 'widget:slider:out', 'out', 'brightness')],
      { screen: document() },
    )
    expect(cpp).toContain('static bool _cdPanelOn_tft = false;')
    expect(cpp).toContain('float n_screen_widget_slider_out = _cdPanelOn_tft ? (_cdFloatOutput')
    expect(cpp).toContain('if (_cdPanel_tft.bl != 255) digitalWrite(_cdPanel_tft.bl, _cdPanelOn_tft ? HIGH : LOW);')
    expect(cpp).toContain('if (_cdPanelOn_tft) lv_indev_read(_cdIndev_tft);')
    expect(cpp).toContain('lv_init();')
  })

  // A wire is the same signal as the property, so it reaches the same latch —
  // this template used to refuse it outright while a normal sketch honoured it.
  it('takes a wired Enabled as the panel gate', () => {
    const cpp = generate(
      [screen('screen'), panel('tft'), node('toggle', 'ButtonInput', { pin: 12 })],
      [link('screen', 'tft'), edge('toggle', 'pressed', 'tft', 'enabled')],
      { screen: document() },
    )
    expect(cpp).toContain('_cdPanelOn_tft = _cdOn_tft;')
    expect(cpp).toContain('if (_cdPanelOn_tft) lv_indev_read(_cdIndev_tft);')
  })

  it('requires prepared assets and emits their actual PROGMEM bytes', () => {
    const doc = addDisplayWidget(document(), 'Image/Icon')
    const art = doc.widgets.at(-1)!
    art.properties = { assetId: 'icon:power', tint: true }
    art.bounds = { x: 0, y: 0, width: 2, height: 1 }
    const request = customDisplayAssetRequests(doc)[0]
    expect(() => generate([screen(), panel('tft')], [link('screen', 'tft')], { screen: doc })).toThrow('has not been baked')
    const cpp = generateShowSketch([...root, screen(), panel('tft')], [...routing, link('screen', 'tft')], groups, { displayDocuments: { screen: doc },
      customDisplayAssets: { screen: [{ ...request, data: new Uint8Array([4, 8]) }] } })
    expect(cpp).toContain('_cdAsset_screen_0_map[] PROGMEM')
    expect(cpp).toContain('0x04, 0x08,')
    expect(cpp).toContain('lv_image_set_src(')
  })

  it('reports missing documents and unsupported sources through both validation and generation', () => {
    expect(() => generate([screen(), panel('tft')], [link('screen', 'tft')], {})).toThrow('screen document is missing')
    expect(findDisplayGeneratorIssues([...root, screen(), panel('tft')], [...routing, link('screen', 'tft')]).errors)
      .toEqual([expect.stringContaining('screen document is missing')])
    const nodes = [...root, screen(), panel('tft'), node('wave', 'Wave')]
    const edges = [...routing, link('screen', 'tft'), edge('wave', 'value', 'screen', 'widget:slider:set')]
    const documents = { screen: document() }
    expect(findOutputRuntimeIssues(nodes, edges, documents).errors.join(' ')).toContain('unsupported')
    expect(buildGraphDiagnostics(nodes, edges, { displayDocuments: documents })).toContainEqual(expect.objectContaining({ message: expect.stringContaining('widget input') }))
    expect(() => generateShowSketch(nodes, edges, groups, { displayDocuments: documents })).toThrow('unsupported')
  })

  it('refuses stale handles, unsupported colour/pattern ports, wrong types and identifier collisions', () => {
    const doc = addDisplayWidget(addDisplayWidget(document(), 'Colour Swatch'), 'Pattern Browser')
    for (const target of ['widget:deleted:value', ...doc.widgets.filter((w) => ['Colour Swatch', 'Pattern Browser'].includes(w.type)).map((w) => `widget:${w.id}:value`)]) {
      expect(() => generate(
        [screen(), panel('tft'), node('text', 'TextValue')],
        [link('screen', 'tft'), edge('text', 'text', 'screen', target)],
        { screen: doc },
      )).toThrow('show cannot evaluate')
    }
    expect(() => generate(
      [screen(), panel('tft')],
      [link('screen', 'tft'), edge('screen', 'widget:toggle:out', 'screen', 'widget:slider:set')],
      { screen: document() },
    )).toThrow('requires float')
    expect(() => generate(
      [screen('a-b'), panel('tftA'), screen('a_b'), panel('tftB')],
      [link('a-b', 'tftA'), link('a_b', 'tftB')],
      { 'a-b': document('a-b'), a_b: document('a_b') },
    )).toThrow('identifiers collide')
  })

  // A widget is a control source like a button on a pin: the same bundle, the
  // same destination. What was missing was the destination — a Player Controls
  // chain addressed to the slideshow reached nothing the generator emitted.
  it('browses the collection from a Button widget', () => {
    const doc = addDisplayWidget(createDisplayDocument('screen', 240, 320), 'Button')
    const buttonId = doc.widgets.at(-1)!.id
    const nodes = [screen(), panel('tft'), node('controls', 'PlayerControls')]
    const edges = [link('screen', 'tft'),
      edge('screen', `widget:${buttonId}:out`, 'controls', 'patternNext'),
      edge('controls', 'controls', 'show', 'controls')]
    expect(showControlRouting([...root, ...nodes], [...routing, ...edges], { screen: doc }).errors).toEqual([])
    const cpp = generate(nodes, edges, { screen: doc })
    expect(cpp).toContain(`bool n_screen_widget_${buttonId}_out = _cdBoolOutput(`)
    expect(cpp).toContain(`_pcE_controls_patternNext.update(n_screen_widget_${buttonId}_out`)
    expect(cpp).toContain('_selUpdate(_sel_show, PATTERN_COUNT, millis(), n_controls_controls.patternSteps,')
  })
})
