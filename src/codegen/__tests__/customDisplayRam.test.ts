import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { addDisplayWidget, createDisplayDocument } from '../../state/displayEditor'
import { DISPLAY_DOCUMENT_LIMITS } from '../../state/displayDocument'
import { TFT_CONTROLLERS } from '../../state/tftSurface'
import { buildGraphDiagnostics, estimateFirmwareRam, findFirmwareRamBudgetIssue, validateGraph } from '../../utils/validateGraph'
import { customDisplayPanelGlobalCpp } from '../customDisplayPanelCpp'
import { TFT_PANEL_RAM_BYTES } from '../tftDisplayCpp'
import { CUSTOM_DISPLAY_LVGL_HEAP_BYTES, CUSTOM_DISPLAY_WIDGET_RAM_BYTES } from '../customDisplayLvglCpp'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as StudioNode
}

const output = node('leds', 'MatrixOutput', { width: 4, height: 4 })
/**
 * A design and the panel showing it. The module and its rotation live on the
 * panel, not the document — that is what the sketch emits its draw buffer
 * from, so it is what this has to be priced from.
 */
function screen(id: string, rotation = '0') {
  return {
    nodes: [
      node(id, 'Display', { displayId: id }),
      node(`${id}-panel`, 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftRotation: rotation }),
    ],
    edges: [{ id: `${id}-mount`, source: id, sourceHandle: 'customDisplay',
      target: `${id}-panel`, targetHandle: 'customDisplay' } as unknown as StudioEdge],
  }
}
/** Every node and wire in a graph holding the given screens beside one output. */
function graph(...screens: ReturnType<typeof screen>[]) {
  return {
    nodes: [output, ...screens.flatMap((one) => one.nodes)],
    edges: screens.flatMap((one) => one.edges),
  }
}

describe('custom display firmware RAM', () => {
  it('counts the helper heap once while each physical screen adds its own buffer and caches', () => {
    const document = addDisplayWidget(createDisplayDocument('a'), 'Text')
    const documents = { a: document, b: { ...document, displayId: 'b' } }
    const single = graph(screen('a')), pair = graph(screen('a'), screen('b'))
    const one = estimateFirmwareRam(single.nodes, single.edges, documents)!
    const two = estimateFirmwareRam(pair.nodes, pair.edges, documents)!
    // One screen: 32-byte driver allowance, 20 RGB565 rows, one 160-byte cache.
    // The panel showing a document is not also charged the fixed-layout field
    // caches it never emits.
    const screenBytes = 32 + 240 * 20 * 2 + 160
    expect(one.displayBytes).toBe(65536 + 4 + screenBytes)
    expect(two.displayBytes - one.displayBytes).toBe(screenBytes)
    expect(one.internalBytes).toBe(48 + one.displayBytes)
    expect(estimateFirmwareRam([output], [], documents)!.displayBytes).toBe(0)
  })

  it('charges nothing for a design no panel shows, and nothing twice for one on two', () => {
    const documents = { a: addDisplayWidget(createDisplayDocument('a'), 'Text') }
    const mounted = graph(screen('a'))
    const priced = estimateFirmwareRam(mounted.nodes, mounted.edges, documents)!.displayBytes
    // Unplugged: no draw buffer, no widget caches, and no LVGL heap either —
    // the whole helper is absent from a sketch with no mounted screen. The
    // panel is still there, and is priced as the fixed layout it now shows.
    expect(estimateFirmwareRam(mounted.nodes, [], documents)!.displayBytes).toBe(TFT_PANEL_RAM_BYTES)
    // One document on two panels is refused by validation; the estimate agrees
    // with the sketch that would be built rather than double-counting it.
    const second = node('a-panel-2', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320' })
    const shared = estimateFirmwareRam(
      [...mounted.nodes, second],
      [...mounted.edges, { id: 'm2', source: 'a', sourceHandle: 'customDisplay',
        target: second.id, targetHandle: 'customDisplay' } as unknown as StudioEdge],
      documents,
    )!.displayBytes
    // The spare panel is priced as the fixed-layout screen it falls back to.
    expect(shared - priced).toBe(TFT_PANEL_RAM_BYTES)
  })

  it('prices the same rotated pixel buffer emitted into the sketch, even with a stale document size', () => {
    const documents = { a: createDisplayDocument('a') }
    const upright = graph(screen('a')), turned = graph(screen('a', '90'))
    const portrait = estimateFirmwareRam(upright.nodes, upright.edges, documents)!
    const landscape = estimateFirmwareRam(turned.nodes, turned.edges, documents)!
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
    const mounted = graph(screen('a'))
    const estimate = (document = empty) => estimateFirmwareRam(mounted.nodes, mounted.edges, { a: document })!.displayBytes
    expect(estimate(empty)).toBe(estimate(one)) // C++ retains one slot for an empty screen.
    expect(estimate(two) - estimate(one)).toBe(CUSTOM_DISPLAY_WIDGET_RAM_BYTES)
    const unknown = estimateFirmwareRam(mounted.nodes, mounted.edges)!.displayBytes
    expect(unknown - estimate(empty)).toBe((DISPLAY_DOCUMENT_LIMITS.widgetsPerDocument - 1) * CUSTOM_DISPLAY_WIDGET_RAM_BYTES)
  })

  it('keeps custom display allocations internal with PSRAM enabled and assets in flash', () => {
    const document = createDisplayDocument('a')
    const documents = { a: document }
    const mounted = screen('a')
    const nodes = [node('leds', 'MatrixOutput', { width: 4, height: 4, usePsram: true }), ...mounted.nodes]
    const edges = mounted.edges
    const ram = estimateFirmwareRam(nodes, edges, documents)!
    expect(ram.internalBytes).toBe(48 + ram.displayBytes)
    expect(ram.psramBytes).toBe(0)
    expect(buildGraphDiagnostics(nodes, edges, { displayDocuments: documents }))
      .toContainEqual(expect.objectContaining({ category: 'memory', severity: 'warning' }))
    expect(validateGraph(nodes, edges, '', documents).warnings)
      .toContainEqual(expect.stringContaining('display allocations remain internal'))
    const withImage = { ...document, theme: { ...document.theme, background: { kind: 'image' as const, assetId: 'background:01-neon-orbit:320x240' } } }
    expect(estimateFirmwareRam(nodes, edges, { a: withImage })!.displayBytes).toBe(ram.displayBytes)
  })

  it('blocks a declared board budget and names the largest internal allocation', () => {
    const document = createDisplayDocument('a')
    const mounted = graph(screen('a'))
    const classic = node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin' })
    const nodes = [...mounted.nodes, classic]
    const issue = findFirmwareRamBudgetIssue(nodes, mounted.edges, { a: document })

    expect(issue).toMatchObject({
      profile: { id: 'esp32-generic-devkit-38pin' },
      budgetBytes: 48 * 1024,
      largestContributor: { label: 'display allocations' },
    })
    expect(issue!.largestContributor.bytes).toBe(issue!.estimate.displayBytes)
    expect(issue!.message).toContain('Largest contributor: display allocations')
    expect(validateGraph(nodes, mounted.edges, '', { a: document }).errors).toContain(issue!.message)
    expect(buildGraphDiagnostics(nodes, mounted.edges, { displayDocuments: { a: document } }))
      .toContainEqual(expect.objectContaining({
        severity: 'error',
        category: 'memory',
        message: issue!.message,
      }))
  })

  it('does not apply the flat fallback warning below a declared S3 budget', () => {
    const document = createDisplayDocument('a')
    const mounted = graph(screen('a'))
    const s3 = node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' })
    const nodes = [...mounted.nodes, s3]

    expect(findFirmwareRamBudgetIssue(nodes, mounted.edges, { a: document })).toBeNull()
    const result = validateGraph(nodes, mounted.edges, '', { a: document })
    expect(result.errors.some((message) => message.includes('Estimated internal RAM'))).toBe(false)
    expect(result.warnings.some((message) => message.includes('internal RAM'))).toBe(false)
  })

  it('keeps the flat warning fallback when the board declares no budget', () => {
    const document = createDisplayDocument('a')
    const mounted = graph(screen('a'))
    const undeclared = node('board', 'Board', { profileId: 'lolin-s2-mini' })
    const nodes = [...mounted.nodes, undeclared]

    expect(findFirmwareRamBudgetIssue(nodes, mounted.edges, { a: document })).toBeNull()
    const result = validateGraph(nodes, mounted.edges, '', { a: document })
    expect(result.errors.some((message) => message.includes('Estimated internal RAM'))).toBe(false)
    expect(result.warnings).toContainEqual(expect.stringContaining('large for many boards'))
  })

  it('matches the heap reserved by the pinned build-helper configuration', () => {
    const backend = readFileSync('backend/app.py', 'utf8')
    const kib = Number(backend.match(/#define LV_MEM_SIZE \((\d+) \* 1024U\)/)?.[1])
    expect(kib * 1024).toBe(CUSTOM_DISPLAY_LVGL_HEAP_BYTES)
  })
})
