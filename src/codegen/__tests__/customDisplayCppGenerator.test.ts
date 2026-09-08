import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { createDisplayDocument } from '../../state/displayEditor'
import { addDisplayWidget, updateDisplayWidget } from '../../state/displayEditor'
import type { DisplayDocumentRegistry } from '../../state/displayDocument'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, ports: { inputs?: unknown[]; outputs?: unknown[] } = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: ports.inputs ?? [], outputs: ports.outputs ?? [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, target, sourceHandle, targetHandle } as unknown as StudioEdge
}

// One document with a Toggle (drives an LED output's Enabled) and a Text
// (reads a graph string) — enough to exercise both directions of "arbitrary
// scalar/control wiring" without depending on a physical touch panel at all.
function document() {
  let doc = createDisplayDocument('panel', 320, 240)
  doc = addDisplayWidget(doc, 'Toggle')
  doc = addDisplayWidget(doc, 'Text')
  doc = updateDisplayWidget(doc, 'toggle', (widget) => ({ ...widget, bounds: { x: 8, y: 8, width: 64, height: 48 } }))
  doc = updateDisplayWidget(doc, 'text', (widget) => ({ ...widget, bounds: { x: 8, y: 64, width: 200, height: 24 } }))
  return doc
}

const documents: DisplayDocumentRegistry = { panel: document() }

// The panel/document split: a `TransportDisplay` owns the pins, a `Display`
// owns the widgets, and a `customDisplay` wire connects them. Two node ids
// throughout — `tft` for the panel, `screen` for the document — matching the
// pre-split test fixture's single `screen` id for the document side, since
// every widget-runtime C++ symbol (`_cd_screen[...]`, `_cdScreen_screen`) is
// keyed by the document, not the panel.
function panel(id = 'tft', overrides: Record<string, unknown> = {}): StudioNode {
  return node(id, 'TransportDisplay', {
    partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
    sckPin: 18, mosiPin: 23, misoPin: 19, csPin: 5, dcPin: 16, resetPin: 17, backlightPin: 4,
    touchCsPin: 15, touchIrqPin: 2, touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19,
    touchXMin: 200, touchXMax: 3900, touchYMin: 200, touchYMax: 3900,
    enabled: true,
    ...overrides,
  }, {
    inputs: [
      { id: 'display', label: 'Display', dataType: 'display' },
      { id: 'customDisplay', label: 'Custom Display', dataType: 'customdisplay' },
      { id: 'enabled', label: 'Enabled', dataType: 'bool' },
    ],
    outputs: [{ id: 'controls', label: 'Controls', dataType: 'playercontrols' }],
  })
}

function doc(id = 'screen', displayId = 'panel', overrides: Record<string, unknown> = {}): StudioNode {
  return node(id, 'Display', { displayId, ...overrides }, {
    inputs: [{ id: 'widget:text:value', label: 'Title', dataType: 'string' }],
    outputs: [
      { id: 'widget:toggle:out', label: 'Toggle Output', dataType: 'bool' },
      { id: 'customDisplay', label: 'Custom Display', dataType: 'customdisplay' },
    ],
  })
}

function link(docId = 'screen', panelId = 'tft'): StudioEdge {
  return edge(`link-${docId}-${panelId}`, docId, 'customDisplay', panelId, 'customDisplay')
}

const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' })
const title = node('title', 'TextValue', { text: 'Aurora Drift' })

describe('normal-sketch codegen for the custom Display node', () => {
  it('emits nothing for a Display with no document handed in', () => {
    const src = generateCpp([output, panel(), doc()], [link()])
    expect(src).not.toContain('lv_init')
    expect(src).not.toContain('#include <lvgl.h>')
  })

  it('emits nothing when the document is not wired to any panel', () => {
    // A Display document with no customDisplay wire has no physical
    // existence at all — it has no pins of its own.
    const src = generateCpp([output, doc()], [], {}, { displayDocuments: documents })
    expect(src).not.toContain('lv_init')
    expect(src).not.toContain('#include <lvgl.h>')
  })

  it('draws the LVGL screen and its panel driver once a document is supplied', () => {
    const src = generateCpp([output, panel(), doc()], [link()], {}, { displayDocuments: documents })
    expect(src).toContain('#include <lvgl.h>')
    expect(src).toContain('#include <SPI.h>')
    expect(src).toContain('lv_init();')
    expect(src).toContain('_cdDisp_tft = lv_display_create(240, 320);')
    expect(src).toContain('_cdScreen_screen = lv_obj_create(nullptr);')
    // lv_init must precede any object/display creation.
    expect(src.indexOf('lv_init();')).toBeLessThan(src.indexOf('_cdDisp_tft = lv_display_create'))
    expect(src.indexOf('lv_init();')).toBeLessThan(src.indexOf('_cdScreen_screen = lv_obj_create'))
    // The panel is selected as LVGL's default display before its document's
    // widgets are created against it — the call-order the panel/document
    // split now depends on, since the two live on separate node ids.
    expect(src.indexOf('lv_display_set_default(_cdDisp_tft)')).toBeLessThan(src.indexOf('_cdScreen_screen = lv_obj_create'))
    expect(src).toContain('_cdBeginTiming();')
    expect(src).toContain('_cdServiceLvgl();')
    // Touch-capable module: the indev is wired up, keyed by the panel.
    expect(src).toContain('_cdIndev_tft = lv_indev_create();')
    expect(src).toContain('_xptPoint(15, 2, 18, 23, 19,')
  })

  it('wires a graph string into the Text widget and the Toggle output into an LED output input', () => {
    const edges = [
      edge('e-title', 'title', 'text', 'screen', 'widget:text:value'),
      edge('e-frame', 'title', 'text', 'out', 'frame'), // irrelevant wire, keeps `out` reachable trivially; real frame wiring not needed for this assertion
      edge('e-enable', 'screen', 'widget:toggle:out', 'out', 'enabled'),
      link(),
    ]
    const src = generateCpp([output, panel(), doc(), title], edges, {}, { displayDocuments: documents })

    // The widget's `value` role reads the upstream string variable directly.
    expect(src).toContain('_cdSetText(_cd_screen[1], n_title_text);')
    // The widget's `out` role becomes an ordinary declared node output,
    // still keyed by the document node — the panel it happens to be wired
    // to today has no bearing on the wire's own identity.
    expect(src).toMatch(/bool n_screen_widget_toggle_out = _cdBoolOutput\(_cd_screen\[0\]\);/)
    // ...which the LED output reads through the exact same mechanism any
    // other node's bool output would be read through.
    expect(src).toContain('n_screen_widget_toggle_out')
  })

  it('names the finished struct before any function definition, needing no forward declaration for its own panel struct', () => {
    const src = generateCpp([output, panel(), doc()], [link()], {}, { displayDocuments: documents })
    expect(src).toContain('struct CustomDisplayWidgetRuntime;')
    const firstFunctionAt = src.search(/^(?:static\s+)?(?:void|bool|float|int32_t|uint16_t)\s+\w+\s*\(/m)
    expect(src.indexOf('struct CustomDisplayWidgetRuntime;')).toBeLessThan(firstFunctionAt)
    // CustomDisplayPanel is defined but never taken by reference, so it needs
    // no forward declaration — see customDisplayPanelCpp.ts.
    expect(src).not.toMatch(/CustomDisplayPanel\s*&/)
  })

  it('keeps the reachability rule that already protects every other display: a document wired to a panel with no LED output stays emitted', () => {
    // No frame edge into `out` at all. The document itself claims no root any
    // more — the panel/document split retired that special case — but the
    // panel it is wired to is an ordinary output-category terminal, exactly
    // like InfoDisplay/TransportDisplay's own `display` input, and the
    // backward walk from that root follows the customDisplay edge same as
    // any other.
    const src = generateCpp([output, panel(), doc()], [link()], {}, { displayDocuments: documents })
    expect(src).toContain('_cdDisp_tft = lv_display_create')
  })

  it('shares one _xptPoint definition rather than duplicating XPT2046 sampling', () => {
    const src = generateCpp([output, panel(), doc()], [link()], {}, { displayDocuments: documents })
    const occurrences = src.split('static uint16_t _xptRead12').length - 1
    expect(occurrences).toBe(1)
  })

  it('initializes multiple panels with numeric-leading IDs before creating their own screens', () => {
    // Two independent panel+document pairs, each instancing the same saved
    // design onto its own glass — "one document can drive two panels" per
    // the design note, done as two wired instances rather than true fan-out
    // from a single document node (which would collide on one C++ screen).
    const firstPanel = panel('1-first')
    const firstDoc = doc('doc1First')
    const secondPanel = panel('second')
    const secondDoc = doc('docSecond')
    const cpp = generateCpp(
      [output, firstPanel, firstDoc, secondPanel, secondDoc],
      [link('doc1First', '1-first'), link('docSecond', 'second')],
      {}, { displayDocuments: documents },
    )
    for (const [docId, safePanelId] of [
      ['doc1First', '_1_first'],
      ['docSecond', 'second'],
    ]) {
      expect(cpp).toContain(`struct CustomDisplayPanel_${safePanelId} {`)
      expect(cpp.indexOf(`lv_display_set_default(_cdDisp_${safePanelId})`)).toBeLessThan(
        cpp.indexOf(`_cdScreen_${docId} = lv_obj_create`),
      )
    }
  })

  it('samples all widget outputs before scalar feedback and publishes after evaluation', () => {
    const wideDoc = addDisplayWidget(document(), 'Slider')
    const nodes = [panel(), doc(), node('math', 'Math', { mathOp: 'multiply', b: 0.5 }),
      node('format', 'FormatNumber'), output]
    const edges = [link(), edge('a', 'screen', 'widget:slider:out', 'math', 'a'),
      edge('b', 'math', 'result', 'format', 'value'), edge('c', 'format', 'text', 'screen', 'widget:text:value'),
      edge('d', 'math', 'result', 'screen', 'widget:slider:set'), edge('e', 'math', 'result', 'out', 'brightness')]
    // Deliberately stale copied ports: the document remains authoritative.
    const cpp = generateCpp(nodes, edges, {}, { displayDocuments: { panel: wideDoc } })
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    const order = ['lv_indev_read(_cdIndev_tft)', 'float n_screen_widget_slider_out =',
      'float n_math_result =', '_dsFormatNumber(n_format_text,', 'FastLED.show();',
      '_cdSetText(_cd_screen[1], n_format_text);', '_cdServiceLvgl();'].map((text) => loop.indexOf(text))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(loop).toContain('constrain((float)(n_math_result), _cd_screen[2].minimum, _cd_screen[2].maximum)')
    expect(cpp).toContain('lv_indev_set_mode(_cdIndev_tft, LV_INDEV_MODE_EVENT);')
  })

  /*
   * Enabled reached the fixed layouts and stopped at the custom arm, so
   * turning a custom screen off produced byte-for-byte identical firmware.
   * Off now means what it means everywhere else: dark, no touch, outputs at
   * rest — and the panel is still built, so it can be turned back on.
   */
  it('holds a disabled panel dark, untouched and at rest', () => {
    const on = generateCpp([output, panel(), doc()], [link()], {}, { displayDocuments: documents })
    const off = generateCpp([output, panel('tft', { enabled: false }), doc()], [link()], {}, { displayDocuments: documents })
    expect(off).not.toEqual(on)
    expect(off).toContain('static bool _cdPanelOn_tft = false;')
    expect(off).toContain('if (_cdPanel_tft.bl != 255) digitalWrite(_cdPanel_tft.bl, _cdPanelOn_tft ? HIGH : LOW);')
    expect(off).toContain('if (_cdPanelOn_tft) lv_indev_read(_cdIndev_tft);')
    expect(off).toContain('bool n_screen_widget_toggle_out = _cdPanelOn_tft ? (_cdBoolOutput')
    // Still built, so re-enabling has something to switch on.
    expect(off).toContain('lv_init();')
    // An always-on panel pays nothing for the gate.
    expect(on).toContain('static bool _cdPanelOn_tft = true;')
    expect(on).toContain('  lv_indev_read(_cdIndev_tft);')
    expect(on).toContain('bool n_screen_widget_toggle_out = _cdBoolOutput')
  })

  // The wire is the same signal as the property, and reaches the same latch.
  it('takes a wired Enabled as the panel gate', () => {
    const button = node('btn', 'ButtonInput', { pin: 12 }, { outputs: [{ id: 'pressed', label: 'Pressed', dataType: 'bool' }] })
    const src = generateCpp([output, panel(), doc(), button],
      [link(), edge('gate', 'btn', 'pressed', 'tft', 'enabled')], {}, { displayDocuments: documents })
    expect(src).toContain('_cdPanelOn_tft = _cdOn_tft;')
    expect(src).toContain('if (_cdPanelOn_tft) lv_indev_read(_cdIndev_tft);')
    expect(src).toContain('bool n_screen_widget_toggle_out = _cdPanelOn_tft ? (_cdBoolOutput')
  })

  it('keeps one widget snapshot across native output passes and cross-screen feedback', () => {
    const otherPanel = panel('other-tft')
    const otherDoc = doc('other', 'panel')
    const strip = node('strip', 'MatrixOutput', { form: 'strip', ledCount: 16, dataPin: 6 })
    const fill = node('fill', 'SolidColor')
    const edges = [edge('a', 'fill', 'frame', 'out', 'frame'), edge('b', 'fill', 'frame', 'strip', 'frame'),
      edge('c', 'screen', 'widget:toggle:out', 'other', 'widget:toggle:set'),
      edge('d', 'other', 'widget:toggle:out', 'screen', 'widget:toggle:set'),
      link(), link('other', 'other-tft')]
    const cpp = generateCpp([output, strip, panel(), doc(), otherPanel, otherDoc, fill], edges, {}, { displayDocuments: documents })
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    expect(cpp).toContain('static bool n_screen_widget_toggle_out;')
    expect(cpp).toContain('float renderOutputPass(float t) {')
    expect(loop.indexOf('lv_indev_read(_cdIndev_other_tft)')).toBeLessThan(loop.indexOf('n_screen_widget_toggle_out ='))
    expect(loop.indexOf('n_other_widget_toggle_out =')).toBeLessThan(loop.indexOf('renderOutputPass<'))
    expect(loop.indexOf('FastLED.show();')).toBeLessThan(loop.indexOf('_cdServiceLvgl();'))
    expect(loop.match(/n_screen_widget_toggle_out =/g)).toHaveLength(1)
  })

  it('builds one design on one panel, whichever panel it is also wired to', () => {
    // Every symbol a screen emits is keyed by its document, so a second panel
    // showing the same document declared the screen object and every widget
    // global twice — a sketch that cannot compile. Validation refuses the
    // graph; this is what the refused build would contain: one screen, and the
    // spare panel falling back to the fixed layout it can still draw.
    const edges = [link(), link('screen', 'spare-tft')]
    const src = generateCpp([output, panel(), panel('spare-tft'), doc()], edges, {}, { displayDocuments: documents })
    expect(src.match(/_cdScreen_screen = lv_obj_create/g)).toHaveLength(1)
    expect(src.match(/CustomDisplayWidgetRuntime _cd_screen\[/g)).toHaveLength(1)
    expect(src).toContain('_cdPanel_tft')
    expect(src).not.toContain('_cdPanel_spare_tft')
    expect(src).toContain('_tftOn_spare_tft')
  })

  it('reads a design no panel shows as at rest rather than as an undeclared symbol', () => {
    // A document nothing is plugged into builds no widgets, so a wire out of
    // one used to name a variable this sketch never declared. It reads at rest
    // instead — the same answer a disabled panel's controls give, for the same
    // reason. Validation names the wire; this only keeps the C++ well-formed.
    const edges = [
      edge('e-frame', 'title', 'text', 'out', 'frame'),
      edge('e-enable', 'screen', 'widget:toggle:out', 'out', 'enabled'),
    ]
    const src = generateCpp([output, doc(), title], edges, {}, { displayDocuments: documents })
    expect(src).not.toContain('lv_init')
    expect(src).toMatch(/bool n_screen_widget_toggle_out = false;/)
    const loop = src.slice(src.indexOf('void loop() {'))
    expect(loop.indexOf('n_screen_widget_toggle_out = false;'))
      .toBeLessThan(loop.lastIndexOf('n_screen_widget_toggle_out'))
  })
})
