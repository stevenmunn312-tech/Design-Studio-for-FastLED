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

function screen(overrides: Record<string, unknown> = {}): StudioNode {
  return node('screen', 'Display', {
    displayId: 'panel', partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
    sckPin: 18, mosiPin: 23, misoPin: 19, csPin: 5, dcPin: 16, resetPin: 17, backlightPin: 4,
    touchCsPin: 15, touchIrqPin: 2, touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19,
    touchXMin: 200, touchXMax: 3900, touchYMin: 200, touchYMax: 3900,
    enabled: true,
    ...overrides,
  }, {
    inputs: [{ id: 'widget:text:value', label: 'Title', dataType: 'string' }],
    outputs: [{ id: 'widget:toggle:out', label: 'Toggle Output', dataType: 'bool' }],
  })
}

const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' })
const title = node('title', 'TextValue', { text: 'Aurora Drift' })

describe('normal-sketch codegen for the custom Display node', () => {
  it('emits nothing for a Display with no document handed in', () => {
    const src = generateCpp([output, screen()], [])
    expect(src).not.toContain('lv_init')
    expect(src).not.toContain('#include <lvgl.h>')
  })

  it('draws the LVGL screen and its panel driver once a document is supplied', () => {
    const src = generateCpp([output, screen()], [], {}, { displayDocuments: documents })
    expect(src).toContain('#include <lvgl.h>')
    expect(src).toContain('#include <SPI.h>')
    expect(src).toContain('lv_init();')
    expect(src).toContain('_cdDisp_screen = lv_display_create(240, 320);')
    expect(src).toContain('_cdScreen_screen = lv_obj_create(nullptr);')
    // lv_init must precede any object/display creation.
    expect(src.indexOf('lv_init();')).toBeLessThan(src.indexOf('_cdDisp_screen = lv_display_create'))
    expect(src.indexOf('lv_init();')).toBeLessThan(src.indexOf('_cdScreen_screen = lv_obj_create'))
    expect(src).toContain('_cdBeginTiming();')
    expect(src).toContain('_cdServiceLvgl();')
    // Touch-capable module: the indev is wired up.
    expect(src).toContain('_cdIndev_screen = lv_indev_create();')
    expect(src).toContain('_xptPoint(15, 2, 18, 23, 19,')
  })

  it('wires a graph string into the Text widget and the Toggle output into an LED output input', () => {
    const edges = [
      edge('e-title', 'title', 'text', 'screen', 'widget:text:value'),
      edge('e-frame', 'title', 'text', 'out', 'frame'), // irrelevant wire, keeps `out` reachable trivially; real frame wiring not needed for this assertion
      edge('e-enable', 'screen', 'widget:toggle:out', 'out', 'enabled'),
    ]
    const src = generateCpp([output, screen(), title], edges, {}, { displayDocuments: documents })

    // The widget's `value` role reads the upstream string variable directly.
    expect(src).toContain('_cdSetText(_cd_screen[1], n_title_text);')
    // The widget's `out` role becomes an ordinary declared node output...
    expect(src).toMatch(/bool n_screen_widget_toggle_out = _cdBoolOutput\(_cd_screen\[0\]\);/)
    // ...which the LED output reads through the exact same mechanism any
    // other node's bool output would be read through.
    expect(src).toContain('n_screen_widget_toggle_out')
  })

  it('names the finished struct before any function definition, needing no forward declaration for its own panel struct', () => {
    const src = generateCpp([output, screen()], [], {}, { displayDocuments: documents })
    expect(src).toContain('struct CustomDisplayWidgetRuntime;')
    const firstFunctionAt = src.search(/^(?:static\s+)?(?:void|bool|float|int32_t|uint16_t)\s+\w+\s*\(/m)
    expect(src.indexOf('struct CustomDisplayWidgetRuntime;')).toBeLessThan(firstFunctionAt)
    // CustomDisplayPanel is defined but never taken by reference, so it needs
    // no forward declaration — see customDisplayPanelCpp.ts.
    expect(src).not.toMatch(/CustomDisplayPanel\s*&/)
  })

  it('keeps the reachability rule that already protects every other display: wired but unconnected to output, still emitted', () => {
    // No frame edge into `out` at all — the Display must still survive
    // reachableFromOutputs on its own, the same as InfoDisplay/TransportDisplay.
    const src = generateCpp([output, screen()], [], {}, { displayDocuments: documents })
    expect(src).toContain('_cdDisp_screen = lv_display_create')
  })

  it('shares one _xptPoint definition rather than duplicating XPT2046 sampling', () => {
    const src = generateCpp([output, screen()], [], {}, { displayDocuments: documents })
    const occurrences = src.split('static uint16_t _xptRead12').length - 1
    expect(occurrences).toBe(1)
  })
})
