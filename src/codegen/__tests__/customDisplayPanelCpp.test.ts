import { describe, expect, it } from 'vitest'
import {
  CUSTOM_DISPLAY_PANEL_CPP_INCLUDES,
  CUSTOM_DISPLAY_PANEL_BUFFER_LINES,
  customDisplayPanelGlobalCpp,
  customDisplayPanelHelpersCpp,
  customDisplayPanelSetupCpp,
  type CustomDisplayPanelEmit,
} from '../customDisplayPanelCpp'
import { TFT_CONTROLLERS } from '../../state/tftSurface'

function emit(overrides: Partial<CustomDisplayPanelEmit> = {}): CustomDisplayPanelEmit {
  return {
    id: 'screen',
    controller: TFT_CONTROLLERS.ST7789V,
    rotation: '0',
    csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, backlightPin: 4,
    ...overrides,
  }
}

function touchEmit(overrides: Partial<CustomDisplayPanelEmit> = {}): CustomDisplayPanelEmit {
  return emit({
    touch: { csPin: 15, irqPin: 2, sckPin: 18, mosiPin: 23, misoPin: 19, xMin: 200, xMax: 3900, yMin: 200, yMax: 3900 },
    ...overrides,
  })
}

describe('custom display panel driver', () => {
  it('sizes the draw buffer from the mounted, rotated geometry', () => {
    const globals = customDisplayPanelGlobalCpp(emit())
    // ST7789V native 240x320, rotation 0: buffer is width(240) * 20 lines * 2 bytes.
    expect(globals).toContain(`static uint8_t _cdPanelBuf_screen[${240 * CUSTOM_DISPLAY_PANEL_BUFFER_LINES} * 2];`)
    expect(globals).not.toContain('_cdIndev_screen')

    const rotated = customDisplayPanelGlobalCpp(emit({ rotation: '90' }))
    // 90 degrees exchanges the axes: 320 becomes the mounted width.
    expect(rotated).toContain(`static uint8_t _cdPanelBuf_screen[${320 * CUSTOM_DISPLAY_PANEL_BUFFER_LINES} * 2];`)
  })

  it('declares an indev handle only for a touch-capable module', () => {
    expect(customDisplayPanelGlobalCpp(touchEmit())).toContain('static lv_indev_t *_cdIndev_screen = nullptr;')
    expect(customDisplayPanelGlobalCpp(emit())).not.toContain('lv_indev_t')
  })

  it('drives the panel through the same ST7789 register sequence tftDisplayCpp.ts verified', () => {
    const setup = customDisplayPanelSetupCpp(emit()).join('\n')
    expect(setup).toContain('_cdPanelCmd_screen(0x01); delay(150);') // SWRESET
    expect(setup).toContain('_cdPanelCmd_screen(0x11); delay(120);') // SLPOUT
    expect(setup).toContain('uint8_t colmod = 0x55')
    expect(setup).toContain('uint8_t porch[5] = { 0x0C, 0x0C, 0x00, 0x33, 0x33 }')
    expect(setup).toContain('_cdPanelCmd_screen(0x21);') // INVON: both catalogued modules are inverted
    expect(setup).toContain('_cdPanelCmd_screen(0x13); delay(10);') // NORON
    expect(setup).toContain('_cdPanelCmd_screen(0x29); delay(100);') // DISPON
  })

  it('registers the LVGL display with the mounted size and this driver\'s callbacks', () => {
    const setup = customDisplayPanelSetupCpp(emit()).join('\n')
    expect(setup).toContain('_cdDisp_screen = lv_display_create(240, 320);')
    expect(setup).toContain('lv_display_set_color_format(_cdDisp_screen, LV_COLOR_FORMAT_RGB565);')
    expect(setup).toContain('lv_display_set_flush_cb(_cdDisp_screen, _cdFlush_screen);')
    expect(setup).toContain('LV_DISPLAY_RENDER_MODE_PARTIAL')
    expect(setup).not.toContain('lv_indev_create')
  })

  it('adds an indev only when the module has touch, bound to this display', () => {
    const setup = customDisplayPanelSetupCpp(touchEmit()).join('\n')
    expect(setup).toContain('_cdIndev_screen = lv_indev_create();')
    expect(setup).toContain('lv_indev_set_type(_cdIndev_screen, LV_INDEV_TYPE_POINTER);')
    expect(setup).toContain('lv_indev_set_read_cb(_cdIndev_screen, _cdIndevRead_screen);')
    expect(setup).toContain('lv_indev_set_display(_cdIndev_screen, _cdDisp_screen);')
  })

  it('samples touch through the one XPT2046 primitive rather than a second implementation', () => {
    const helpers = customDisplayPanelHelpersCpp(touchEmit())
    expect(helpers).toContain('_xptPoint(15, 2, 18, 23, 19, 200, 3900, 200, 3900, 240, 320, 0, x, y, rawX, rawY)')
    expect(helpers).toContain('data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;')
    expect(customDisplayPanelHelpersCpp(emit())).not.toContain('_xptPoint')
  })

  it('flushes a band by reading logical RGB565 values and letting SPI.transfer16 handle wire order', () => {
    const helpers = customDisplayPanelHelpersCpp(emit())
    expect(helpers).toContain('const uint16_t *pixels = (const uint16_t *)px_map;')
    expect(helpers).toContain('SPI.transfer16(pixels[i]);')
    expect(helpers).toContain('lv_display_flush_ready(disp);')
  })

  it('addresses controller RAM from the rotation-derived window origin, not always zero', () => {
    // ST7789 (240x240 visible, 240x320 RAM) needs a nonzero row offset once
    // mounted upside down — the well-known case tftSurface.ts derives rather
    // than tabulates.
    const setup = customDisplayPanelSetupCpp(emit({ controller: TFT_CONTROLLERS.ST7789, rotation: '180' })).join('\n')
    expect(setup).toContain('_cdPanel_screen.rowStart = 80;')
  })

  it('emits exactly the include a normal sketch needs', () => {
    expect(CUSTOM_DISPLAY_PANEL_CPP_INCLUDES).toBe('#include <SPI.h>')
  })

  it('never passes its panel struct by reference, so it needs no forward declaration', () => {
    // The one thing displayForwardDeclarations.test.ts's derived scan would
    // catch if this stopped being true.
    const helpers = customDisplayPanelHelpersCpp(touchEmit())
    const setup = customDisplayPanelSetupCpp(touchEmit()).join('\n')
    expect(`${helpers}\n${setup}`).not.toMatch(/CustomDisplayPanel\s*&/)
  })
})
