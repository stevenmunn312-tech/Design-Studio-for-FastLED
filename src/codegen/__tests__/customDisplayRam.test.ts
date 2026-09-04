import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../../state/graphStore'
import { addDisplayWidget, createDisplayDocument } from '../../state/displayEditor'
import { DISPLAY_DOCUMENT_LIMITS } from '../../state/displayDocument'
import { TFT_CONTROLLERS } from '../../state/tftSurface'
import { buildGraphDiagnostics, estimateFirmwareRam, validateGraph } from '../../utils/validateGraph'
import { customDisplayPanelGlobalCpp } from '../customDisplayPanelCpp'
import { CUSTOM_DISPLAY_LVGL_HEAP_BYTES, CUSTOM_DISPLAY_WIDGET_RAM_BYTES } from '../customDisplayLvglCpp'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as StudioNode
}

const output = node('leds', 'MatrixOutput', { width: 4, height: 4 })
function screen(id: string, rotation = '0'): StudioNode {
  return node(id, 'Display', { displayId: id, partId: 'st7789v-xpt2046-touch-240x320', tftRotation: rotation })
}

describe('custom display firmware RAM', () => {
  it('counts the helper heap once while each physical screen adds its own buffer and caches', () => {
    const document = addDisplayWidget(createDisplayDocument('a'), 'Text')
    const documents = { a: document, b: { ...document, displayId: 'b' } }
    const one = estimateFirmwareRam([output, screen('a')], [], documents)!
    const two = estimateFirmwareRam([output, screen('a'), screen('b')], [], documents)!
    // One screen: 32-byte driver allowance, 20 RGB565 rows, one 160-byte cache.
    const screenBytes = 32 + 240 * 20 * 2 + 160
    expect(one.displayBytes).toBe(65536 + 4 + screenBytes)
    expect(two.displayBytes - one.displayBytes).toBe(screenBytes)
    expect(one.internalBytes).toBe(48 + one.displayBytes)
    expect(estimateFirmwareRam([output], [], documents)!.displayBytes).toBe(0)
  })

  it('prices the same rotated pixel buffer emitted into the sketch, even with a stale document size', () => {
    const documents = { a: createDisplayDocument('a') }
    const portrait = estimateFirmwareRam([output, screen('a')], [], documents)!
    const landscape = estimateFirmwareRam([output, screen('a', '90')], [], documents)!
    expect(landscape.displayBytes - portrait.displayBytes).toBe((320 - 240) * 20 * 2)
    const globals = customDisplayPanelGlobalCpp({
      id: 'a', controller: TFT_CONTROLLERS.ST7789V, rotation: '90',
      csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, backlightPin: 4,
    })
    const pixels = Number(globals.match(/_cdPanelBuf_a\[(\d+) \* 2\]/)?.[1])
    expect(pixels).toBe(320 * 20)
    expect(landscape.displayBytes).toBe(65536 + 4 + 32 + pixels * 2 + 160)
  })

  it('tracks passive widget additions and reserves the maximum when a document is unavailable', () => {
    const empty = createDisplayDocument('a')
    const one = addDisplayWidget(empty, 'Text')
    const two = addDisplayWidget(one, 'Image/Icon')
    const estimate = (document = empty) => estimateFirmwareRam([output, screen('a')], [], { a: document })!.displayBytes
    expect(estimate(empty)).toBe(estimate(one)) // C++ retains one slot for an empty screen.
    expect(estimate(two) - estimate(one)).toBe(CUSTOM_DISPLAY_WIDGET_RAM_BYTES)
    const unknown = estimateFirmwareRam([output, screen('a')], [])!.displayBytes
    expect(unknown - estimate(empty)).toBe((DISPLAY_DOCUMENT_LIMITS.widgetsPerDocument - 1) * CUSTOM_DISPLAY_WIDGET_RAM_BYTES)
  })

  it('keeps custom display allocations internal with PSRAM enabled and assets in flash', () => {
    const document = createDisplayDocument('a')
    const documents = { a: document }
    const nodes = [node('leds', 'MatrixOutput', { width: 4, height: 4, usePsram: true }), screen('a')]
    const ram = estimateFirmwareRam(nodes, [], documents)!
    expect(ram.internalBytes).toBe(48 + ram.displayBytes)
    expect(ram.psramBytes).toBe(0)
    expect(buildGraphDiagnostics(nodes, [], { displayDocuments: documents }))
      .toContainEqual(expect.objectContaining({ category: 'memory', severity: 'warning' }))
    expect(validateGraph(nodes, [], '', documents).warnings)
      .toContainEqual(expect.stringContaining('display allocations remain internal'))
    const withImage = { ...document, theme: { ...document.theme, background: { kind: 'image' as const, assetId: 'background:01-neon-orbit:320x240' } } }
    expect(estimateFirmwareRam(nodes, [], { a: withImage })!.displayBytes).toBe(ram.displayBytes)
  })

  it('matches the heap reserved by the pinned build-helper configuration', () => {
    const backend = readFileSync('backend/app.py', 'utf8')
    const kib = Number(backend.match(/#define LV_MEM_SIZE \((\d+) \* 1024U\)/)?.[1])
    expect(kib * 1024).toBe(CUSTOM_DISPLAY_LVGL_HEAP_BYTES)
  })
})
