import { beforeEach, describe, expect, it } from 'vitest'
import { clockReadsDs3231, ds3231Clocks, rtcModuleIn } from '../rtcModule'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { ROOT_GRAPH_ID, ensureRootClockNode, rootGraphNodes, useGraphStore, type StudioEdge, type StudioNode } from '../../graphStore'
import { buildGraphDiagnostics, findDeployBlockingErrors, validateGraph } from '../../../utils/validateGraph'
import { buildBoardDiagnostics } from '../../../utils/multiBoardValidation'
import { addRtcModuleToBoard } from '../../../components/Hardware/hardwarePartActions'
import { generateCpp } from '../../../codegen/cppGenerator'
import { boardI2cDefault } from '../../../build/boards/boardI2cDefaults'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const DEVKIT = 'esp32-generic-devkit-38pin'

/** A Clock whose hour sets a fill's brightness, so it is wired and emitted. */
function clockGraph(timeSource: string, extra: StudioNode[] = []) {
  const nodes = [
    node('board-root', 'Board', { profileId: DEVKIT }),
    ...extra,
    node('clock', 'RTCInput', { timeSource }),
    node('hour', 'MapRange', { inMin: 0, inMax: 23, outMin: 0, outMax: 1 }),
    node('fill', 'SolidColor'),
    node('fade', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('clock', 'hour', 'hour', 'value'),
    edge('fill', 'frame', 'fade', 'frame'),
    edge('hour', 'result', 'fade', 'brightness'),
    edge('fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

function load(nodes: StudioNode[], edges: StudioEdge[] = []) {
  useGraphStore.getState().loadGraph(nodes, edges, {
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
  })
}

describe('the Clock and its DS3231 provider', () => {
  beforeEach(() => load([]))

  it('finds the module and the clocks that read it', () => {
    const { nodes } = clockGraph('DS3231', [node('ds3231', 'RtcModule')])
    expect(rtcModuleIn(nodes)?.id).toBe('ds3231')
    expect(ds3231Clocks(nodes).map((entry) => entry.id)).toEqual(['clock'])
    expect(clockReadsDs3231({ timeSource: 'NTP' })).toBe(false)
    expect(clockReadsDs3231({})).toBe(false)
  })

  it('needs no part for Compile Time, Manual or NTP', () => {
    for (const source of ['Compile Time', 'Manual', 'NTP']) {
      const { nodes, edges } = clockGraph(source)
      expect(findDeployBlockingErrors(nodes, edges, 'esp32:esp32:esp32').filter((error) => error.includes('DS3231')), source).toEqual([])
    }
  })

  it('refuses a DS3231 clock with no module, offering to add one', () => {
    const { nodes, edges } = clockGraph('DS3231')
    expect(findDeployBlockingErrors(nodes, edges, 'esp32:esp32:esp32'))
      .toContainEqual(expect.stringContaining('Clock has no DS3231 to read'))
    const card = buildGraphDiagnostics(nodes, edges, { selectedFqbn: 'esp32:esp32:esp32' })
      .find((issue) => issue.id === 'clock-rtc-module')
    expect(card).toMatchObject({
      severity: 'error', action: 'add-rtc-module', repair: { kind: 'add-rtc-module', boardId: 'board-root' },
      nodeIds: ['clock'], propertyKey: 'timeSource',
    })
    // An unwired clock is not built, so it is not refused.
    expect(findDeployBlockingErrors(nodes, [], 'esp32:esp32:esp32').some((error) => error.includes('DS3231'))).toBe(false)

    const withModule = clockGraph('DS3231', [node('ds3231', 'RtcModule')])
    expect(findDeployBlockingErrors(withModule.nodes, withModule.edges, 'esp32:esp32:esp32')
      .some((error) => error.includes('DS3231'))).toBe(false)
  })

  it('warns about a module no Clock reads', () => {
    const { nodes, edges } = clockGraph('NTP', [node('ds3231', 'RtcModule')])
    expect(validateGraph(nodes, edges, 'esp32:esp32:esp32').warnings)
      .toContainEqual(expect.stringContaining('Nothing reads the DS3231'))
    const reading = clockGraph('DS3231', [node('ds3231', 'RtcModule')])
    expect(validateGraph(reading.nodes, reading.edges, 'esp32:esp32:esp32').warnings
      .some((warning) => warning.includes('Nothing reads the DS3231'))).toBe(false)
  })

  it('reads the module\'s pins in firmware, and nothing for an idle module', () => {
    const { nodes, edges } = clockGraph('DS3231', [node('ds3231', 'RtcModule', { sdaPin: 25, sclPin: 26 })])
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('Wire.begin(25, 26);')
    expect(cpp).toContain('_rtcReadDs3231(')
    const idle = clockGraph('Compile Time', [node('ds3231', 'RtcModule', { sdaPin: 25, sclPin: 26 })])
    const idleCpp = generateCpp(idle.nodes, idle.edges)
    expect(idleCpp).not.toContain('Wire.begin(')
    expect(idleCpp).not.toContain('_rtcReadDs3231')
  })

  it('adds the module on the board\'s I2C pair, once, as the repair does', () => {
    const { nodes, edges } = clockGraph('DS3231')
    load(nodes, edges)
    const added = addRtcModuleToBoard('board-root')
    const bus = boardI2cDefault(DEVKIT)!
    expect(added).toMatchObject({ ok: true, label: 'DS3231 RTC module' })
    const module = rootGraphNodes(useGraphStore.getState()).find((entry) => entry.data.nodeType === 'RtcModule')
    expect(module).toMatchObject({ hidden: true })
    expect(module!.data.properties).toMatchObject({
      partId: 'ds3231-rtc-module', sdaPin: bus.sda.arduinoPin, sclPin: bus.scl.arduinoPin,
    })
    expect(module!.data.properties).not.toHaveProperty('boardId')
    expect(addRtcModuleToBoard('board-root')).toMatchObject({ ok: false })
    const state = useGraphStore.getState()
    expect(findDeployBlockingErrors(rootGraphNodes(state), edges, 'esp32:esp32:esp32')
      .some((error) => error.includes('DS3231'))).toBe(false)
  })

  it('adds it to the board the clock runs on, and reads one per board', () => {
    const { nodes, edges } = clockGraph('DS3231')
    const two = [...nodes, node('board-2', 'Board', { profileId: DEVKIT })]
    load(two, edges)
    expect(addRtcModuleToBoard('board-2')).toMatchObject({ ok: true })
    const module = rootGraphNodes(useGraphStore.getState()).find((entry) => entry.data.nodeType === 'RtcModule')
    expect(module!.data.properties).toMatchObject({ boardId: 'board-2' })
    // With the only module on Board 2, the clock runs there and is checked there.
    const diagnostics = buildBoardDiagnostics(rootGraphNodes(useGraphStore.getState()), edges, {
      targets: { 'board-root': 'esp32:esp32:esp32', 'board-2': 'esp32:esp32:esp32' },
    })
    expect(diagnostics.some((issue) => issue.id.endsWith('-rtc-module'))).toBe(false)
  })

  it('brings a Clock with the first module only when the graph has none', () => {
    expect(ensureRootClockNode('DS3231')).not.toBeNull()
    const clocks = () => rootGraphNodes(useGraphStore.getState()).filter((entry) => entry.data.nodeType === 'RTCInput')
    expect(clocks()).toHaveLength(1)
    expect(clocks()[0].data.properties).toMatchObject({ timeSource: 'DS3231' })
    expect(clocks()[0].data.label).toBe('Clock')
    expect(ensureRootClockNode('DS3231')).toBeNull()
    expect(clocks()).toHaveLength(1)
  })

  it('drops the Clock\'s old DS3231 wiring when a save from before is loaded', () => {
    load([
      node('board-root', 'Board'),
      { ...node('clock', 'RTCInput'), data: { ...node('clock', 'RTCInput').data, properties: {
        ...libraryDefaults('RTCInput'), timeSource: 'DS3231', partId: 'ds3231-rtc-module', sdaPin: 21, sclPin: 22,
        boardId: 'board-root', assignedPins: { sdaPin: 21, sclPin: 22 },
      } } },
    ])
    const clock = rootGraphNodes(useGraphStore.getState()).find((entry) => entry.id === 'clock')!
    for (const key of ['partId', 'sdaPin', 'sclPin', 'boardId', 'assignedPins']) expect(clock.data.properties).not.toHaveProperty(key)
    expect(clock.data.properties).toMatchObject({ timeSource: 'DS3231' })
    expect(clock.data.label).toBe('Clock')
  })
})
