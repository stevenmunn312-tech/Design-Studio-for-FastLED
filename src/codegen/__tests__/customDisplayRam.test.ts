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
  // One node: the panel owns the screen drawn on it, so there is nothing to
  // mount and no wire to draw.
  return {
    nodes: [
      node(`${id}-panel`, 'TransportDisplay', {
        partId: 'st7789v-xpt2046-touch-240x320', tftRotation: rotation, displayId: id,
      }),
    ],
    edges: [] as StudioEdge[],
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

  /*
   * The unpriceable states are gone rather than handled.
   *
   * A design used to be able to hang off no panel (priced at nothing) or two
   * (priced once, not twice). Both were cases this estimate had to know about.
   * A panel owning its design leaves only the honest question: a panel with a
   * screen costs its buffer and caches, and a panel without one costs what its
   * fixed layout costs.
   */
  it('prices a panel with a design, and a bare panel as its fixed layout', () => {
    const documents = { a: addDisplayWidget(createDisplayDocument('a'), 'Text') }
    const mounted = graph(screen('a'))
    const priced = estimateFirmwareRam(mounted.nodes, mounted.edges, documents)!.displayBytes
    expect(priced).toBeGreaterThan(TFT_PANEL_RAM_BYTES)

    const bare = node('bare-panel', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320' })
    const withBare = estimateFirmwareRam([...mounted.nodes, bare], mounted.edges, documents)!.displayBytes
    expect(withBare - priced).toBe(TFT_PANEL_RAM_BYTES)
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

  /*
   * Three screens, where this used to use one.
   *
   * At the old 48 KiB budget a single empty design was over, so one screen
   * made the point. The classic-ESP32 budget was raised to 96 KiB on
   * 2026-09-22 because a custom screen was measured running on that chip with
   * 238,564 bytes of heap free — so one screen is now something the gate
   * should *admit*, and the case below asserts exactly that. Three panels each
   * carrying their own design is over by a clear margin (the LVGL heap is
   * charged once, the per-screen buffers three times), and display allocations
   * are still the largest contributor, which is what this test is really for.
   */
  it('blocks a declared board budget and names the largest internal allocation', () => {
    const documents = {
      a: createDisplayDocument('a'), b: createDisplayDocument('b'), c: createDisplayDocument('c'),
    }
    // A 64x64 matrix rather than the 4x4 the other cases share: three screens
    // alone come to 94,964 bytes and slip under, and a build with three panels
    // but sixteen LEDs is not the thing anyone is protected from.
    const leds = node('leds', 'MatrixOutput', { width: 64, height: 64 })
    const panels = [screen('a'), screen('b'), screen('c')]
    const mounted = { nodes: [leds, ...panels.flatMap((one) => one.nodes)], edges: [] as StudioEdge[] }
    const classic = node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin' })
    const nodes = [...mounted.nodes, classic]
    const issue = findFirmwareRamBudgetIssue(nodes, mounted.edges, documents)

    expect(issue).toMatchObject({
      profile: { id: 'esp32-generic-devkit-38pin' },
      budgetBytes: 96 * 1024,
      largestContributor: { label: 'display allocations' },
    })
    expect(issue!.largestContributor.bytes).toBe(issue!.estimate.displayBytes)
    expect(issue!.message).toContain('Largest contributor: display allocations')
    expect(validateGraph(nodes, mounted.edges, '', documents).errors).toContain(issue!.message)
    expect(buildGraphDiagnostics(nodes, mounted.edges, { displayDocuments: documents }))
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
