import { beforeEach, describe, expect, it } from 'vitest'
import {
  rootGraphNodes,
  setBoardLedDriver,
  useGraphStore,
  type StudioEdge,
  type StudioNode,
} from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { buildGraphDiagnostics, findDeployBlockingErrors, validateGraph } from '../validateGraph'
import { ledDriverDiagnostics } from '../ledDriverIssues'
import { estimateWireTime, ledOutputConcurrency, wireTimeFixes } from '../wireTime'
import { ledDriverFacts, selectableLedDrivers } from '../../build/ledDrivers'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: id, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const S3 = 'espressif-esp32-s3-devkitc-1'
const ESP32 = 'esp32-generic-devkit-38pin'
const C6 = 'esp32-c6-devkitc-1'
const board = (profileId: string, ledDriver = 'auto') => node('board', 'Board', { profileId, ledDriver })
const strip = (id: string, chipset = 'WS2812B', ledCount = 300) =>
  node(id, 'MatrixOutput', { form: 'strip', ledCount, chipset, dataPin: 5 })
const hub75 = node('panel', 'MatrixOutput', { form: 'hub75' })
const ids = (nodes: StudioNode[]) => ledDriverDiagnostics(nodes).map((issue) => issue.id)

describe('ledDriverDiagnostics', () => {
  it('says nothing for auto', () => {
    expect(ledDriverDiagnostics([board(S3), strip('a', 'WS2812B'), strip('b', 'SK6812'), hub75])).toEqual([])
  })

  it('blocks LCD_CAM shared with a HUB75 panel on the S3, offering FastLED\'s own driver', () => {
    const nodes = [board(S3, 'LCD_CLOCKLESS'), hub75, strip('a')]
    const [issue] = ledDriverDiagnostics(nodes)
    expect(issue).toMatchObject({
      id: 'led-driver-lcd-cam-hub75', severity: 'error', action: 'set-led-driver',
      repair: { kind: 'set-led-driver', ledDriver: 'auto' },
    })
    expect(findDeployBlockingErrors(nodes, [])).toContain(`${issue.title}. ${issue.fix}`)
    expect(buildGraphDiagnostics(nodes, []).some((d) => d.id === issue.id)).toBe(true)
  })

  it('advises when parallel lanes differ in timing, but not for one timing under two names', () => {
    expect(ids([board(S3, 'LCD_CLOCKLESS'), strip('a', 'WS2812B'), strip('b', 'NEOPIXEL')])).toEqual([])
    const mixed = ledDriverDiagnostics([board(S3, 'LCD_CLOCKLESS'), strip('a', 'WS2812B'), strip('b', 'SK6812')])
    expect(mixed).toMatchObject([{ id: 'led-driver-mixed-timing', severity: 'warning', repair: { ledDriver: 'auto' } }])
    expect(mixed[0].message).toContain('WS2812B, SK6812')
    // RMT times each output on its own.
    expect(ids([board(C6, 'RMT'), strip('a', 'WS2812B'), strip('b', 'SK6812')])).toEqual([])
    // Clocked outputs are not lanes of the clockless driver.
    expect(ids([board(S3, 'LCD_CLOCKLESS'), strip('a', 'WS2812B'), strip('b', 'APA102')])).toEqual([])
  })

  it('names the outputs a channel driver cannot take', () => {
    expect(ids([board(S3, 'LCD_CLOCKLESS'), strip('a', 'WS2816')])).toEqual(['led-driver-unsupported-chipset'])
  })

  it('ignores a driver the board does not offer, as code generation does', () => {
    expect(ids([board(ESP32, 'LCD_CLOCKLESS'), hub75, strip('a')])).toEqual([])
  })

  it('reports its warnings through validateGraph without blocking', () => {
    const nodes = [board(S3, 'LCD_CLOCKLESS'), node('fill', 'SolidColor'), strip('a', 'WS2812B'), strip('b', 'SK6812')]
    const edges = [edge('fa', 'fill', 'frame', 'a', 'frame'), edge('fb', 'fill', 'frame', 'b', 'frame')]
    const result = validateGraph(nodes, edges)
    expect(result.warnings).toContain('Parallel lanes need one LED timing')
    expect(result.errors.join('\n')).not.toContain('LED timing')
  })
})

describe('the chosen driver in the wire-time estimate', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => strip(id, 'WS2812B', 500))

  it('gives a chosen parallel driver its own concurrency', () => {
    const facts = ledDriverFacts('esp32-s3')
    const [lcd] = selectableLedDrivers('esp32-s3')
    expect(ledOutputConcurrency(facts, 'auto', { networkActive: false, reservedWords: 0 })).toBe(4)
    expect(ledOutputConcurrency(facts, lcd, { networkActive: true, reservedWords: 0 })).toBe(16)
    expect(estimateWireTime([board(S3, 'LCD_CLOCKLESS'), ...six], [])).toMatchObject({ driver: 'LCD_CLOCKLESS', concurrency: 16, rmt: null })
    // A value the board does not offer is auto.
    expect(estimateWireTime([board(ESP32, 'LCD_CLOCKLESS'), ...six], [])).toMatchObject({ driver: 'auto', concurrency: 8 })
    // RMT chosen on the C6 is bounded by RMT, not PARLIO.
    expect(estimateWireTime([board(C6, 'RMT'), ...six], [])).toMatchObject({ driver: 'RMT', concurrency: 2 })
  })

  it('appends the parallel-driver fix to a wire-bound S3 graph on auto', () => {
    const estimate = estimateWireTime([board(S3), ...six], [])!
    expect(estimate.wireBound).toBe(true)
    const fix = wireTimeFixes(estimate).find((candidate) => candidate.action === 'set-led-driver')
    expect(fix).toMatchObject({ repair: { kind: 'set-led-driver', ledDriver: 'LCD_CLOCKLESS' } })
    expect(fix?.text).toContain('all 6 outputs at once')
    const chosen = estimateWireTime([board(S3, 'LCD_CLOCKLESS'), ...six], [])!
    expect(wireTimeFixes(chosen).some((candidate) => candidate.action === 'set-led-driver')).toBe(false)
  })
})

describe('setBoardLedDriver and board changes', () => {
  beforeEach(() => useGraphStore.getState().loadGraph([], []))
  const board = () => rootGraphNodes(useGraphStore.getState()).find((n) => n.data.nodeType === 'Board')!

  it('sets an offered driver, refuses one the board lacks, and refuses twice', () => {
    useGraphStore.getState().loadGraph([node('board-root', 'Board', { profileId: S3 })], [])
    expect(setBoardLedDriver('PARLIO')).toMatchObject({ ok: false })
    expect(setBoardLedDriver('LCD_CLOCKLESS')).toEqual({ ok: true, ledDriver: 'LCD_CLOCKLESS' })
    expect(board().data.properties.ledDriver).toBe('LCD_CLOCKLESS')
    expect(setBoardLedDriver('LCD_CLOCKLESS')).toMatchObject({ ok: false, reason: expect.stringContaining('already') })
    expect(setBoardLedDriver('auto')).toEqual({ ok: true, ledDriver: 'auto' })
  })

  it('puts a driver the new board does not offer back to auto', () => {
    useGraphStore.getState().loadGraph([node('board-root', 'Board', { profileId: S3, ledDriver: 'LCD_CLOCKLESS' })], [])
    useGraphStore.getState().selectBoardProfile('board-root', 'lolin-s3-40pin-dual-usbc')
    expect(board().data.properties.ledDriver).toBe('LCD_CLOCKLESS')
    useGraphStore.getState().selectBoardProfile('board-root', ESP32)
    expect(board().data.properties.ledDriver).toBe('auto')
  })
})
