import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { customDisplayMountPlan } from '../../state/mountedDisplays'
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

const documents: DisplayDocumentRegistry = { screen: document() }

// One node: a `TransportDisplay` owns its pins and the screen drawn on it.
// The panel node is `tft` and the design it holds is `screen`, matching the
// pre-split test fixture's single `screen` id for the document side, since
// every widget-runtime C++ symbol (`_cd_screen[...]`, `_cdScreen_screen`) is
// keyed by the document, not the panel.
/*
 * One node, not two.
 *
 * A panel owns the screen drawn on it, so its widget ports are its own and
 * there is no document node to wire across. `displayId` stays 'screen' rather
 * than following the panel's node id, because every widget-runtime C++ symbol
 * (`_cd_screen[...]`, `_cdScreen_screen`) is keyed by the document id and the
 * assertions below name those symbols.
 */
function panel(id = 'tft', overrides: Record<string, unknown> = {}): StudioNode {
  return node(id, 'TransportDisplay', {
    partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
    displayId: 'screen',
    sckPin: 18, mosiPin: 23, misoPin: 19, csPin: 5, dcPin: 16, resetPin: 17, backlightPin: 4,
    touchCsPin: 15, touchIrqPin: 2, touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19,
    touchXMin: 200, touchXMax: 3900, touchYMin: 200, touchYMax: 3900,
    enabled: true,
    ...overrides,
  }, {
    inputs: [
      { id: 'display', label: 'Display', dataType: 'display' },
      { id: 'enabled', label: 'Enabled', dataType: 'bool' },
      { id: 'widget:text:value', label: 'Title', dataType: 'string' },
    ],
    outputs: [{ id: 'widget:toggle:out', label: 'Toggle Output', dataType: 'bool' }],
  })
}

const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' })
const title = node('title', 'TextValue', { text: 'Aurora Drift' })

describe('normal-sketch codegen for the custom Display node', () => {
  it('emits nothing for a Display with no document handed in', () => {
    const src = generateCpp([output, panel()], [])
    expect(src).not.toContain('lv_init')
    expect(src).not.toContain('#include <lvgl.h>')
  })

  it('emits nothing when the document is not wired to any panel', () => {
    // A Display document with no customDisplay wire has no physical
    // existence at all — it has no pins of its own.
    const src = generateCpp([output], [], {}, { displayDocuments: documents })
    expect(src).not.toContain('lv_init')
    expect(src).not.toContain('#include <lvgl.h>')
  })

  it('draws the LVGL screen and its panel driver once a document is supplied', () => {
    const src = generateCpp([output, panel()], [], {}, { displayDocuments: documents })
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
      edge('e-title', 'title', 'text', 'tft', 'widget:text:value'),
      edge('e-frame', 'title', 'text', 'out', 'frame'), // irrelevant wire, keeps `out` reachable trivially; real frame wiring not needed for this assertion
      edge('e-enable', 'tft', 'widget:toggle:out', 'out', 'enabled'),
      ]
    const src = generateCpp([output, panel(), title], edges, {}, { displayDocuments: documents })

    // The widget's `value` role reads the upstream string variable directly.
    expect(src).toContain('_cdSetText(_cd_screen[1], n_title_text);')
    // The widget's `out` role becomes an ordinary declared node output,
    // still keyed by the document node — the panel it happens to be wired
    // to today has no bearing on the wire's own identity.
    expect(src).toMatch(/bool n_tft_widget_toggle_out = _cdBoolOutput\(_cd_screen\[0\]\);/)
    // ...which the LED output reads through the exact same mechanism any
    // other node's bool output would be read through.
    expect(src).toContain('n_tft_widget_toggle_out')
  })

  it('names the finished struct before any function definition, needing no forward declaration for its own panel struct', () => {
    const src = generateCpp([output, panel()], [], {}, { displayDocuments: documents })
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
    const src = generateCpp([output, panel()], [], {}, { displayDocuments: documents })
    expect(src).toContain('_cdDisp_tft = lv_display_create')
  })

  it('shares one _xptPoint definition rather than duplicating XPT2046 sampling', () => {
    const src = generateCpp([output, panel()], [], {}, { displayDocuments: documents })
    const occurrences = src.split('static uint16_t _xptRead12').length - 1
    expect(occurrences).toBe(1)
  })

  it('initializes multiple panels with numeric-leading IDs before creating their own screens', () => {
    // Two panels, each with a screen of its own. Nothing is shared and nothing
    // needs to be: a design belongs to the panel it was drawn on, so two
    // panels are two designs with two sets of symbols.
    const firstPanel = panel('1-first', { displayId: 'doc1First' })
    const secondPanel = panel('second', { displayId: 'docSecond' })
    const cpp = generateCpp(
      [output, firstPanel, secondPanel],
      [],
      {}, { displayDocuments: { doc1First: document(), docSecond: document() } },
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
    const nodes = [panel(), node('math', 'Math', { mathOp: 'multiply', b: 0.5 }),
      node('format', 'FormatNumber'), output]
    const edges = [edge('a', 'tft', 'widget:slider:out', 'math', 'a'),
      edge('b', 'math', 'result', 'format', 'value'), edge('c', 'format', 'text', 'tft', 'widget:text:value'),
      edge('d', 'math', 'result', 'tft', 'widget:slider:set'), edge('e', 'math', 'result', 'out', 'brightness')]
    // Deliberately stale copied ports: the document remains authoritative.
    const cpp = generateCpp(nodes, edges, {}, { displayDocuments: { screen: wideDoc } })
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    const order = ['lv_indev_read(_cdIndev_tft)', 'float n_tft_widget_slider_out =',
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
    const on = generateCpp([output, panel()], [], {}, { displayDocuments: documents })
    const off = generateCpp([output, panel('tft', { enabled: false })], [], {}, { displayDocuments: documents })
    expect(off).not.toEqual(on)
    expect(off).toContain('static bool _cdPanelOn_tft = false;')
    expect(off).toContain('if (_cdPanel_tft.bl != 255) digitalWrite(_cdPanel_tft.bl, _cdPanelOn_tft ? HIGH : LOW);')
    expect(off).toContain('if (_cdPanelOn_tft) lv_indev_read(_cdIndev_tft);')
    expect(off).toContain('bool n_tft_widget_toggle_out = _cdPanelOn_tft ? (_cdBoolOutput')
    // Still built, so re-enabling has something to switch on.
    expect(off).toContain('lv_init();')
    // An always-on panel pays nothing for the gate.
    expect(on).toContain('static bool _cdPanelOn_tft = true;')
    expect(on).toContain('  lv_indev_read(_cdIndev_tft);')
    expect(on).toContain('bool n_tft_widget_toggle_out = _cdBoolOutput')
  })

  // The wire is the same signal as the property, and reaches the same latch.
  it('takes a wired Enabled as the panel gate', () => {
    const button = node('btn', 'ButtonInput', { pin: 12 }, { outputs: [{ id: 'pressed', label: 'Pressed', dataType: 'bool' }] })
    const src = generateCpp([output, panel(), button],
      [edge('gate', 'btn', 'pressed', 'tft', 'enabled')], {}, { displayDocuments: documents })
    expect(src).toContain('_cdPanelOn_tft = _cdOn_tft;')
    expect(src).toContain('if (_cdPanelOn_tft) lv_indev_read(_cdIndev_tft);')
    expect(src).toContain('bool n_tft_widget_toggle_out = _cdPanelOn_tft ? (_cdBoolOutput')
  })

  it('keeps one widget snapshot across native output passes and cross-screen feedback', () => {
    const otherPanel = panel('other-tft', { displayId: 'other' })
    const strip = node('strip', 'MatrixOutput', { form: 'strip', ledCount: 16, dataPin: 6 })
    const fill = node('fill', 'SolidColor')
    const edges = [edge('a', 'fill', 'frame', 'out', 'frame'), edge('b', 'fill', 'frame', 'strip', 'frame'),
      edge('c', 'tft', 'widget:toggle:out', 'other-tft', 'widget:toggle:set'),
      edge('d', 'other-tft', 'widget:toggle:out', 'tft', 'widget:toggle:set')]
    const cpp = generateCpp([output, strip, panel(), otherPanel, fill], edges, {},
      { displayDocuments: { screen: document(), other: document() } })
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    expect(cpp).toContain('static bool n_tft_widget_toggle_out;')
    expect(cpp).toContain('float renderOutputPass(float t) {')
    expect(loop.indexOf('lv_indev_read(_cdIndev_other_tft)')).toBeLessThan(loop.indexOf('n_tft_widget_toggle_out ='))
    expect(loop.indexOf('n_other_tft_widget_toggle_out =')).toBeLessThan(loop.indexOf('renderOutputPass<'))
    expect(loop.indexOf('FastLED.show();')).toBeLessThan(loop.indexOf('_cdServiceLvgl();'))
    expect(loop.match(/n_tft_widget_toggle_out =/g)).toHaveLength(1)
  })

  /*
   * The two shapes that used to need refusing, and can no longer be drawn.
   *
   * When a design lived on a node of its own it could be wired to two panels
   * (declaring every widget symbol twice — a sketch that cannot link) or to
   * none (wires reading a control that was never built). Both needed detecting,
   * refusing and a fixture to prove the refused build was still valid C++.
   * A panel owning its design makes them unsayable: this asserts that, so the
   * machinery that policed them stays deleted.
   */
  it('cannot share a design between panels or leave one unmounted', () => {
    const plan = customDisplayMountPlan([panel(), panel('second', { displayId: 'other' }), output])
    // Two panels, two designs. The plan has no other shape to describe: the
    // fields that reported a shared or unmounted design are gone with the
    // states they reported.
    expect(plan.mounted.map((mount) => mount.documentId)).toEqual(['screen', 'other'])
    expect(Object.keys(plan)).toEqual(['mounted'])
  })

  it('emits no screen for a panel that has no design', () => {
    const cpp = generateCpp([output, panel('bare', { displayId: '' })], [], {}, { displayDocuments: documents })
    expect(cpp).not.toContain('lv_obj_create')
    expect(cpp).not.toContain('#include <lvgl.h>')
  })
})
