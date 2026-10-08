import { describe, expect, it } from 'vitest'
import { libraryDefaults, transportDisplayPinKeysForProps, xptTouchPinsForProps } from '../../state/nodeLibrary'
import { partPinLabelForProperty } from '../../build/parts/partCatalogue'
import { CYD_TOUCH_DISPLAY } from '../../build/boards/integratedBoardHardware'
import { customDisplayPanelFromProps, customDisplayPanelSetupCpp, customDisplayPanelHelpersCpp } from '../displays/customDisplayPanelCpp'
import { tftTouchSetupCpp, tftTouchServiceCpp } from '../displays/tftTouchCpp'
import { touchCalibrationTargetFor, generateTouchCalibrationSketch } from '../sketches/touchCalibrationSketch'
import { buildGraphDiagnostics, findDeployBlockingErrors, findDisplayGeneratorIssues } from '../../utils/validateGraph'
import type { StudioNode } from '../../state/graphStore'

const partId = 'ili9341-xpt2046-touch-320x240'
const props = {
  ...libraryDefaults('TransportDisplay'), partId,
  sckPin: 12, mosiPin: 11, misoPin: 13, touchCsPin: 6, touchIrqPin: 5,
  // Stale hidden properties must not change a module's physical wiring.
  touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19,
}

describe('shared XPT2046 bus', () => {
  it('claims only the module pads that exist and resolves their printed names', () => {
    expect(transportDisplayPinKeysForProps(props)).toEqual([
      'sckPin', 'mosiPin', 'csPin', 'dcPin', 'resetPin', 'backlightPin',
      'misoPin', 'touchCsPin', 'touchIrqPin',
    ])
    expect(partPinLabelForProperty(partId, 'touchCsPin')).toBe('TOUCH_CS')
    expect(partPinLabelForProperty(partId, 'touchIrqPin')).toBe('INT')
    expect(xptTouchPinsForProps(props)).toEqual({
      csPin: 6, irqPin: 5, sckPin: 12, mosiPin: 11, misoPin: 13, sharesPanelBus: true,
    })
  })

  it('keeps CYD touch independent but recognizes a jumpered ST7789V touch header', () => {
    expect(xptTouchPinsForProps(CYD_TOUCH_DISPLAY.panelProperties).sharesPanelBus).toBe(false)
    expect(xptTouchPinsForProps({
      ...props, partId: 'st7789v-xpt2046-touch-240x320',
      touchSckPin: 12, touchMosiPin: 11, touchMisoPin: 13,
    }).sharesPanelBus).toBe(true)
  })

  it('uses the hardware sampler for fixed, LVGL and calibration screens without taking SPI pins back', () => {
    const panel = customDisplayPanelFromProps('panel', { ...props, tftRotation: '90' })
    const fixed = {
      id: 'panel', controller: panel.controller, rotation: panel.rotation,
      layout: 'Diagnostics' as const, enabledExpr: 'true', touch: panel.touch!,
    }
    const calibration = generateTouchCalibrationSketch(touchCalibrationTargetFor(props, panel.controller, '90'))
    for (const source of [
      [...tftTouchSetupCpp(fixed), ...tftTouchServiceCpp(fixed)].join('\n'),
      [...customDisplayPanelSetupCpp(panel), customDisplayPanelHelpersCpp(panel)].join('\n'),
      calibration,
    ]) {
      expect(source).toContain('_spiBusBegin(12, 13, 11);')
      expect(source).toContain('_xptPoint(6, 5, 255, 255, 255,')
      for (const pin of [12, 11, 13]) expect(source).not.toContain(`pinMode(${pin},`)
    }
    expect(calibration).toContain('240, 320, 1, x, y, rawX, rawY)')
  })

  it('does not configure the absent interrupt pin', () => {
    const panel = customDisplayPanelFromProps('panel', { ...props, touchIrqPin: 255 })
    expect(customDisplayPanelSetupCpp(panel).join('\n')).not.toContain('pinMode(255,')
  })

  it.each([
    { touchSckPin: 12, touchMosiPin: 23 },
    { touchSckPin: 18, touchMosiPin: 11 },
  ])('refuses partial sharing of the host outputs: %o', (pins) => {
    const panel = {
      id: 'panel', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: 'Touch panel', nodeType: 'TransportDisplay', category: 'output', inputs: [], outputs: [],
        properties: { ...props, partId: 'st7789v-xpt2046-touch-240x320', ...pins } },
    } as StudioNode
    const message = 'Touch panel: touch shares only part of the panel\'s SPI bus. Share both SCK and MOSI, or give touch its own SCK and MOSI pins.'
    expect(findDisplayGeneratorIssues([panel], []).errors).toContain(message)
    expect(findDeployBlockingErrors([panel], [], 'esp32:esp32:esp32s3')).toContain(message)
    expect(buildGraphDiagnostics([panel], [], { selectedFqbn: 'esp32:esp32:esp32s3' }))
      .toEqual(expect.arrayContaining([expect.objectContaining({
        id: expect.stringMatching(/^display-generator-error-/), severity: 'error', nodeIds: ['panel'],
      })]))
  })
})
