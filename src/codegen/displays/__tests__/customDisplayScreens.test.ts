import { describe, expect, it } from 'vitest'
import {
  CUSTOM_DISPLAY_LVGL_NAVIGATION_CPP,
  customDisplayLvglGlobalCpp,
  customDisplayLvglLoopCpp,
  customDisplayLvglSetupCpp,
  customDisplayNeedsNavigation,
} from '../customDisplayLvglCpp'
import { addDisplayScreen, addDisplayWidget, createDisplayDocument, updateDisplayWidget } from '../../../state/displays/displayEditor'
import type { DisplayDocument } from '../../../state/displays/displayDocument'
import { generateCpp } from '../../cppGenerator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function design(): { document: DisplayDocument; second: string } {
  const added = addDisplayScreen(createDisplayDocument('screen', 240, 320), 'Lights')
  let document = addDisplayWidget(added.document, 'Button')
  document = updateDisplayWidget(document, 'button', (widget) => ({ ...widget, properties: { ...widget.properties, goTo: added.screenId! } }))
  document = addDisplayWidget(document, 'Slider', added.screenId!)
  return { document, second: added.screenId! }
}

describe('custom screen designs with several screens', () => {
  it('emits a one-screen design exactly as before, with no navigation', () => {
    let document = createDisplayDocument('screen', 240, 320)
    document = addDisplayWidget(document, 'Button')
    const emit = { id: 'screen', document }
    const all = [customDisplayLvglGlobalCpp(emit), ...customDisplayLvglSetupCpp(emit), ...customDisplayLvglLoopCpp(emit)].join('\n')
    expect(all).toContain('static lv_obj_t *_cdScreen_screen = nullptr;')
    expect(all).not.toContain('_cdScreen_screen_1')
    expect(all).not.toContain('_cdGoTo')
    expect(all).not.toContain('_cdScreens_')
    expect(customDisplayNeedsNavigation(document)).toBe(false)
  })

  it('creates every screen before any widget and draws each widget on its own screen', () => {
    const { document } = design()
    const emit = { id: 'screen', document }
    const setup = customDisplayLvglSetupCpp(emit).join('\n')
    expect(customDisplayLvglGlobalCpp(emit)).toContain('static lv_obj_t *_cdScreen_screen_1 = nullptr;')
    expect(setup.indexOf('_cdScreen_screen_1 = lv_obj_create(nullptr);'))
      .toBeLessThan(setup.indexOf('_cd_screen[0].object = lv_button_create'))
    expect(setup).toContain('_cd_screen[0].object = lv_button_create(_cdScreen_screen);')
    expect(setup).toContain('_cd_screen[1].object = lv_slider_create(_cdScreen_screen_1);')
    // A button goes to its screen on the click; the start screen loads last.
    expect(setup).toContain('lv_obj_add_event_cb(_cd_screen[0].object, _cdGoTo, LV_EVENT_CLICKED, _cdScreen_screen_1);')
    expect(setup.trim().endsWith('lv_screen_load(_cdScreen_screen);')).toBe(true)
    expect(customDisplayNeedsNavigation(document)).toBe(true)
  })

  it('loads the screen a wired Screen input selects, only when the selection changes', () => {
    const { document } = design()
    const emit = { id: 'screen', document, screenExpr: 'n_pick_value' }
    expect(customDisplayLvglGlobalCpp(emit)).toContain('static lv_obj_t *_cdScreens_screen[2] = {};')
    expect(customDisplayLvglSetupCpp(emit)).toContain('  _cdScreens_screen[1] = _cdScreen_screen_1;')
    const loop = customDisplayLvglLoopCpp(emit).join('\n')
    expect(loop).toContain('float _cdScreenValue = (float)(n_pick_value);')
    expect(loop).toContain('constrain((int32_t)lroundf(_cdScreenValue), 0, 1)')
    expect(loop).toContain('if (_cdScreenIndex != _cdScreenLast_screen)')
    // Nothing indexes screens when nothing is wired.
    expect(customDisplayLvglLoopCpp({ id: 'screen', document }).join('\n')).not.toContain('_cdScreenValue')
  })
})

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, ports: { inputs?: unknown[]; outputs?: unknown[] } = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: ports.inputs ?? [], outputs: ports.outputs ?? [] },
  } as unknown as StudioNode
}

describe('normal sketch with a navigating design', () => {
  const { document } = design()
  const panel = node('tft', 'TransportDisplay', {
    partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: 'Custom design', displayId: 'screen',
    sckPin: 18, mosiPin: 23, misoPin: 19, csPin: 5, dcPin: 16, resetPin: 17, backlightPin: 4,
    touchCsPin: 15, touchIrqPin: 2, touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19, enabled: true,
  }, {
    inputs: [
      { id: 'display', label: 'Display', dataType: 'display' },
      { id: 'enabled', label: 'Enabled', dataType: 'bool' },
      { id: 'screen', label: 'Screen', dataType: 'float' },
    ],
  })
  const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' })
  const pick = node('pick', 'Constant', { value: 1 }, { outputs: [{ id: 'value', label: 'Value', dataType: 'float' }] })

  it('emits the navigation helper and the wired Screen input', () => {
    const edges = [{ id: 'e', source: 'pick', sourceHandle: 'value', target: 'tft', targetHandle: 'screen' }] as unknown as StudioEdge[]
    const src = generateCpp([output, pick, panel], edges, {}, { displayDocuments: { screen: document } })
    expect(src).toContain(CUSTOM_DISPLAY_LVGL_NAVIGATION_CPP.trim().split('\n')[1])
    expect(src).toContain('_cdScreens_screen[_cdScreenIndex]')
  })

  it('leaves the Screen input out of a sketch where nothing drives it', () => {
    const src = generateCpp([output, panel], [], {}, { displayDocuments: { screen: document } })
    expect(src).toContain('static void _cdGoTo(lv_event_t *event)')
    expect(src).not.toContain('_cdScreens_screen')
  })
})
