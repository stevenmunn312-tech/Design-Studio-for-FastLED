import { describe, expect, it } from 'vitest'
import {
  customDisplayLvglGlobalCpp,
  customDisplayLvglLoopCpp,
  customDisplayLvglSetupCpp,
} from '../customDisplayLvglCpp'
import { addDisplayWidget, createDisplayDocument, updateDisplayWidget } from '../../../state/displays/displayEditor'
import {
  displayChartIntervalMs,
  displayChartPoints,
  displayChartUnit,
  displaySpectrumHeights,
  displayWidgetPorts,
} from '../../../state/displays/displayRegistry'
import { useDisplayRuntimeStore } from '../../../state/displays/displayRuntimeStore'
import { generateCpp } from '../../cppGenerator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function chartDocument(style = 'line') {
  let document = createDisplayDocument('screen', 240, 320)
  document = addDisplayWidget(document, 'Chart')
  document = updateDisplayWidget(document, 'chart', (widget) => ({
    ...widget, properties: { ...widget.properties, min: -10, max: 10, points: 20, interval: 2, style },
  }))
  return addDisplayWidget(document, 'Spectrum')
}

describe('Chart and Spectrum widgets', () => {
  it('take a number and live audio', () => {
    expect(displayWidgetPorts({ id: 'c', type: 'Chart', label: 'C' }).map((port) => port.dataType)).toEqual(['float'])
    expect(displayWidgetPorts({ id: 's', type: 'Spectrum', label: 'S' }).map((port) => port.dataType)).toEqual(['audio'])
  })

  it('reads its window and pace from bounded properties', () => {
    expect(displayChartPoints({ properties: { points: 999 } })).toBe(64)
    expect(displayChartPoints({ properties: {} })).toBe(32)
    expect(displayChartIntervalMs({ properties: { interval: 0.001 } })).toBe(50)
    expect(displayChartUnit(5, -10, 10)).toBe(0.75)
    expect(displayChartUnit(99, -10, 10)).toBe(1)
    expect(displayChartUnit(Number.NaN, 0, 1)).toBeNull()
  })

  it('folds 32 bins into bars by the firmware loop', () => {
    const spectrum = Array.from({ length: 32 }, (_, bin) => bin / 31)
    const four = displaySpectrumHeights(spectrum, 4)
    expect(four).toHaveLength(4)
    expect(four[0]).toBeCloseTo((0 + 1 + 2 + 3 + 4 + 5 + 6 + 7) / 8 / 31)
    // 32 into 12: each bar covers two or three bins, never none.
    expect(displaySpectrumHeights(spectrum, 12).every((height) => height >= 0 && height <= 1)).toBe(true)
    expect(displaySpectrumHeights([], 6)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('takes a chart reading by the clock, keeping the newest window', () => {
    const store = useDisplayRuntimeStore.getState()
    store.resetDisplayRuntime()
    store.sampleDisplayChart('p', 'c', 1, 1000, 500, 3)
    store.sampleDisplayChart('p', 'c', 2, 1200, 500, 3) // too soon
    store.sampleDisplayChart('p', 'c', null, 1500, 500, 3)
    store.sampleDisplayChart('p', 'c', 3, 2000, 500, 3)
    store.sampleDisplayChart('p', 'c', 4, 2500, 500, 3)
    expect(store.readDisplayWidget('p', 'c')?.history).toEqual([null, 3, 4])
  })

  it('builds an lv_chart per widget and samples only what is bound', () => {
    const document = chartDocument()
    const emit = {
      id: 'screen',
      document,
      bindings: {
        chart: [{ role: 'value' as const, expression: 'n_temp_value' }],
        spectrum: [{ role: 'value' as const, expression: '_audioSpectrum' }],
      },
    }
    expect(customDisplayLvglGlobalCpp(emit)).toContain('// FLS-LVGL-WIDGETS:chart')
    const setup = customDisplayLvglSetupCpp(emit).join('\n')
    expect(setup).toContain('_cd_screen[0].object = lv_chart_create(_cdScreen_screen);')
    expect(setup).toContain('lv_chart_set_type(_cd_screen[0].object, LV_CHART_TYPE_LINE);')
    expect(setup).toContain('lv_chart_set_point_count(_cd_screen[0].object, 20);')
    expect(setup).toContain('lv_chart_set_update_mode(_cd_screen[0].object, LV_CHART_UPDATE_MODE_SHIFT);')
    expect(setup).toContain('lv_chart_set_type(_cd_screen[1].object, LV_CHART_TYPE_BAR);')
    expect(setup).toContain('lv_chart_set_point_count(_cd_screen[1].object, 16);')
    expect(customDisplayLvglLoopCpp(emit)).toEqual([
      '  _cdChartSample(_cd_screen[0], (float)(n_temp_value), -10.0f, 10.0f, 2000u);',
      '  _cdSpectrumSample(_cd_screen[1], _audioSpectrum, 16);',
    ])
    expect(customDisplayLvglLoopCpp({ id: 'screen', document })).toEqual([])
  })

  it('draws bars when asked and adds no chart module without a chart', () => {
    const emit = { id: 'screen', document: chartDocument('bar') }
    expect(customDisplayLvglSetupCpp(emit).join('\n')).toContain('lv_chart_set_type(_cd_screen[0].object, LV_CHART_TYPE_BAR);')
    const plain = { id: 'screen', document: addDisplayWidget(createDisplayDocument('screen'), 'Text') }
    expect(customDisplayLvglGlobalCpp(plain)).not.toContain('FLS-LVGL-WIDGETS')
  })
})

describe('normal sketch with a Chart and a Spectrum', () => {
  const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}, ports: { inputs?: unknown[]; outputs?: unknown[] } = {}) => ({
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: ports.inputs ?? [], outputs: ports.outputs ?? [] },
  }) as unknown as StudioNode
  const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
    ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge
  const panel = node('tft', 'TransportDisplay', {
    partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: 'Custom design', displayId: 'screen',
    sckPin: 18, mosiPin: 23, misoPin: 19, csPin: 5, dcPin: 16, resetPin: 17, backlightPin: 4,
    touchCsPin: 15, touchIrqPin: 2, touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19, enabled: true,
  }, {
    inputs: [{ id: 'display', label: 'Display', dataType: 'display' }, { id: 'enabled', label: 'Enabled', dataType: 'bool' },
      { id: 'widget:chart:value', label: 'Chart', dataType: 'float' }, { id: 'widget:spectrum:value', label: 'Spectrum', dataType: 'audio' }],
  })
  const board = node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' })
  const mic = node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 })
  const audio = node('audio', 'Audio', { sourceId: 'mic' }, { outputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }] })
  const level = node('level', 'Math', { mathOp: 'add', a: 1, b: 2 }, { outputs: [{ id: 'result', label: 'Result', dataType: 'float' }] })
  const out = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' })

  it('plots the wired value and the live spectrum', () => {
    const src = generateCpp([board, mic, audio, level, out, panel], [
      edge('a', 'audio', 'audio', 'tft', 'widget:spectrum:value'),
      edge('b', 'level', 'result', 'tft', 'widget:chart:value'),
    ], {}, { displayDocuments: { screen: chartDocument() } })
    expect(src).toContain('_cdSpectrumSample(_cd_screen[1], _audioSpectrum, 16);')
    expect(src).toContain('static bool _cdSpectrumSample(')
    expect(src).toContain('_cdChartSample(_cd_screen[0], (float)(n_level_result), -10.0f, 10.0f, 2000u);')
    expect(src).toContain('static bool _cdChartSample(')
  })

  it('leaves an unwired chart empty and emits neither helper', () => {
    const src = generateCpp([out, panel], [], {}, { displayDocuments: { screen: chartDocument() } })
    expect(src).toContain('lv_chart_create')
    expect(src).not.toContain('_cdChartSample')
    expect(src).not.toContain('_cdSpectrumSample')
  })
})
