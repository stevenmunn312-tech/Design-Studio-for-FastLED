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
    touch: { csPin: 15, irqPin: 2, sckPin: 18, mosiPin: 23, misoPin: 19, xFrom: 200, xTo: 3900, yFrom: 200, yTo: 3900 },
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
    expect(setup).toContain('#if defined(ESP32)\n  SPI.begin(_cdPanel_screen.sck, -1, _cdPanel_screen.mosi, -1);')
    expect(setup).toContain('#elif defined(ESP8266)\n  SPI.pins(_cdPanel_screen.sck, MISO, _cdPanel_screen.mosi, -1);\n  SPI.begin();')
    expect(setup).toContain('_cdPanelCmd_screen(0x01); delay(150);') // SWRESET
    expect(setup).toContain('_cdPanelCmd_screen(0x11); delay(120);') // SLPOUT
    expect(setup).toContain('uint8_t colmod = 0x55')
    // The ST7789 porch bytes, now from the one table both drivers read
    // (codegen/tftInitSequence.ts) rather than a block copied into each.
    expect(setup).toContain('{ 0x0C, 0x0C, 0x00, 0x33, 0x33 }')
    expect(setup).toContain('_cdPanelCmd_screen(0x20);') // INVOFF: bench-tested ST7789V polarity
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

  it('uses plain input for a CYD touch IRQ on classic ESP32', () => {
    const setup = customDisplayPanelSetupCpp(touchEmit({
      touch: { csPin: 33, irqPin: 36, sckPin: 25, mosiPin: 32, misoPin: 39,
        xFrom: 200, xTo: 3900, yFrom: 200, yTo: 3900 },
    })).join('\n')
    expect(setup).toContain('#if defined(CONFIG_IDF_TARGET_ESP32)\n  pinMode(36, INPUT);')
    expect(setup).toContain('#else\n  pinMode(36, INPUT_PULLUP);')
  })

  it('samples touch through the one XPT2046 primitive rather than a second implementation', () => {
    const helpers = customDisplayPanelHelpersCpp(touchEmit())
    expect(helpers).toContain('_xptPoint(15, 2, 18, 23, 19, 200, 3900, 200, 3900, 240, 320, 0, x, y, rawX, rawY)')
    expect(helpers).toContain('data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;')
    expect(customDisplayPanelHelpersCpp(emit())).not.toContain('_xptPoint')
  })

  it('keeps the last pressed point for the release sample', () => {
    const helpers = customDisplayPanelHelpersCpp(touchEmit())
    expect(helpers).toContain('static int16_t x = 0, y = 0;')
    expect(helpers).not.toContain('int16_t x = 0, y = 0; uint16_t rawX')
  })

  it('streams rate-limited raw samples only in telemetry builds', () => {
    const enabled = touchEmit({ telemetry: true })
    const source = `${customDisplayPanelGlobalCpp(enabled)}\n${customDisplayPanelHelpersCpp(enabled)}`
    expect(source).toContain('static uint32_t _cdTouchSampleMs_screen = 0;')
    expect(source).toContain('FLS_STAT touchx=%u touchy=%u\\n')
    expect(source).toContain('>= 50u')
    expect(customDisplayPanelHelpersCpp(touchEmit())).not.toContain('touchx=%u')
  })

  it('flushes a band by reading logical RGB565 values, high byte first', () => {
    const helpers = customDisplayPanelHelpersCpp(emit())
    // Reading through a uint16_t* recovers each pixel's logical value whatever
    // the host's byte order, so nothing here depends on how LVGL laid the
    // buffer out in memory.
    expect(helpers).toContain('const uint16_t *pixels = (const uint16_t *)px_map;')
    // The pair is written explicitly rather than as one 16-bit transfer,
    // because the byte is what the bus primitive knows how to send on either
    // transport. High byte first is the order the controller reads a pixel in.
    expect(helpers).toContain('_cdWrite8_screen((uint8_t)(pixels[i] >> 8));')
    expect(helpers).toContain('_cdWrite8_screen((uint8_t)pixels[i]);')
    expect(helpers).toContain('lv_display_flush_ready(disp);')
  })

  it('sends ILI9341 silicon its own power-on sequence, not the ST7789 one', () => {
    /*
     * These opcodes are not the same registers on the two controllers: 0xBB and
     * 0xD0 are undefined on an ILI9341, 0xB2 is a different register with a
     * different argument count, and the power, VCOM and gamma set it does need
     * was never sent at all. A panel left unconfigured that way comes up dark,
     * which is indistinguishable from a wiring fault.
     */
    const setup = customDisplayPanelSetupCpp(emit({ controller: TFT_CONTROLLERS.ILI9341 })).join('\n')
    expect(setup).toContain('0xC1')
    expect(setup).toContain('0xC5')
    expect(setup).toContain('0xE0')
    expect(setup).toContain('0xE1')
    expect(setup).not.toContain('0xBB')
    expect(setup).not.toContain('0xD0')
    expect(setup).not.toContain('{ 0x0C, 0x0C, 0x00, 0x33, 0x33 }')
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
