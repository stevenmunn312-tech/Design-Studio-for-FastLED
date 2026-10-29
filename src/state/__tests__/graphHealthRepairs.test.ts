/*
 * The repairs Graph Health performs rather than describes. Each one has to
 * leave the graph in the state its card promised, and the card has to go away
 * once it has.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPatternCollectionTo,
  connectShowOutput,
  disconnectTouchControls,
  movePartPinToFree,
  moveI2cPartsToBoardPins,
  rootGraphNodes,
  ROOT_GRAPH_ID,
  setBoardFrameRate,
  setBoardLedDriver,
  setOutputDataRate,
  splitOutputAcrossPins,
  useGraphStore,
  type StudioEdge,
  type StudioNode,
} from '../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { useUploadStore } from '../upload/uploadStore'
import { buildGraphDiagnostics } from '../../utils/validateGraph'
import { buildBoardDiagnostics } from '../../utils/multiBoardValidation'
import { boardPartition } from '../../build/boardPartition'
import { collectPinUses } from '../../build/hardwareManifest'
import { createDisplayDocument } from '../displays/displayEditor'
import { applyDisplayTemplate } from '../displays/displayTemplates'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const diagnostics = () => {
  const s = useGraphStore.getState()
  return buildGraphDiagnostics(s.nodes, s.edges, { selectedFqbn: useUploadStore.getState().selectedFqbn })
}

beforeEach(() => {
  useGraphStore.getState().loadGraph([], [])
  useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
})

describe('Move I2C hardware to board pins', () => {
  afterEach(() => vi.useRealTimers())
  const parts = () => [
    node('board-root', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
    node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 8, sclPin: 9 }),
    node('oled', 'InfoDisplay', { partId: 'ssd1306-oled-096-128x64-i2c', sdaPin: 7, sclPin: 10 }),
  ]

  it('repairs root hardware from a group and restores both pins with one undo', () => {
    vi.useFakeTimers()
    const original = parts()
    useGraphStore.setState({
      activeGraphId: 'pattern', nodes: [], edges: [],
      graphData: { [ROOT_GRAPH_ID]: { nodes: original, edges: [] } },
    })
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
    expect(moveI2cPartsToBoardPins()).toEqual({ ok: true, pins: { sdaPin: 8, sclPin: 9 } })
    expect(useGraphStore.getState().activeGraphId).toBe('pattern')
    expect(useGraphStore.getState().nodes).toEqual([])
    expect(rootGraphNodes(useGraphStore.getState()).find((part) => part.id === 'oled')?.data.properties)
      .toMatchObject({ sdaPin: 8, sclPin: 9 })
    vi.advanceTimersByTime(400)
    expect(useGraphStore.temporal.getState().pastStates).toHaveLength(1)
    useGraphStore.temporal.getState().undo()
    expect(rootGraphNodes(useGraphStore.getState())).toEqual(original)
  })

  it('refuses occupied board pins without changing any hardware', () => {
    useGraphStore.getState().loadGraph([...parts(), node('button', 'ButtonInput', { pin: 8 })], [])
    const before = rootGraphNodes(useGraphStore.getState())
    expect(moveI2cPartsToBoardPins()).toMatchObject({ ok: false, reason: expect.stringContaining('GPIO 8') })
    expect(rootGraphNodes(useGraphStore.getState())).toBe(before)
  })

  it('leaves inactive RTC and SPI displays alone and reports an already repaired bus', () => {
    useGraphStore.getState().loadGraph([
      ...parts(), node('clock', 'RTCInput', { timeSource: 'NTP', sdaPin: 3, sclPin: 4 }),
      node('spi', 'InfoDisplay', { partId: 'sh1106-oled-128x64', sdaPin: 5, sclPin: 6 }),
    ], [])
    expect(moveI2cPartsToBoardPins().ok).toBe(true)
    expect(rootGraphNodes(useGraphStore.getState()).find((part) => part.id === 'clock')?.data.properties)
      .toMatchObject({ sdaPin: 3, sclPin: 4 })
    expect(rootGraphNodes(useGraphStore.getState()).find((part) => part.id === 'spi')?.data.properties)
      .toMatchObject({ sdaPin: 5, sclPin: 6 })
    expect(moveI2cPartsToBoardPins()).toMatchObject({ ok: false, reason: expect.stringContaining('already') })
  })
})

describe('Move to a free pin', () => {
  it('moves a part off a pin the board does not bring out, onto a free one, and the card goes', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'seeed-xiao-esp32s3' }),
      node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }),
    ], [])
    const card = diagnostics().find((d) => d.repair?.kind === 'move-pin')
    expect(card?.repair).toMatchObject({ kind: 'move-pin', nodeId: 'mic' })
    const { propertyKey } = card!.repair as { propertyKey: string }

    const result = movePartPinToFree('mic', propertyKey)
    expect(result.ok).toBe(true)
    const mic = useGraphStore.getState().nodes.find((n) => n.id === 'mic')!
    const moved = (mic.data.properties as Record<string, number>)[propertyKey]
    expect(result.ok && moved).toBe(result.ok ? result.pin : false)
    expect(diagnostics().some((d) => d.repair?.kind === 'move-pin'
      && (d.repair as { propertyKey: string }).propertyKey === propertyKey)).toBe(false)
  })

  it('changes nothing, and says so, when the pin has already been changed', () => {
    useGraphStore.getState().loadGraph([node('mic', 'MicInput', {})], [])
    expect(movePartPinToFree('mic', 'notAPin')).toEqual({ ok: false, reason: expect.stringMatching(/already changed/) })
  })
})

describe('Connect it', () => {
  it('wires a show with nowhere to go into the only LED output', () => {
    useGraphStore.getState().loadGraph([
      node('gen', 'PerformanceGenerator'),
      node('col', 'PatternCollection'),
      node('out', 'MatrixOutput', { form: 'strip', ledCount: 30 }),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier'),
    ], [edge('set', 'col', 'patternset', 'gen', 'patternset')])
    const card = diagnostics().find((d) => d.title === 'The show is not going anywhere')
    expect(card?.repair).toEqual({ kind: 'connect-show-output', engineId: 'gen', outputId: 'out' })
    expect(connectShowOutput('gen', 'out')).toBe(true)
    expect(diagnostics().some((d) => d.title === 'The show is not going anywhere')).toBe(false)
  })
})

describe('Add a collection', () => {
  it('gives a Music Player a new, wired Pattern Collection', () => {
    useGraphStore.getState().loadGraph([
      node('player', 'PatternMaster'), node('out', 'MatrixOutput', { form: 'strip', ledCount: 30 }),
      node('sd', 'SDCard'), node('amp', 'Amplifier'),
    ], [edge('f', 'player', 'frame', 'out', 'frame')])
    expect(diagnostics().find((d) => d.title === 'Music Player has no patterns')?.action).toBe('add-pattern-collection')
    expect(addPatternCollectionTo('player')).toBe('added')
    const s = useGraphStore.getState()
    const collection = s.nodes.find((n) => n.data.nodeType === 'PatternCollection')
    expect(collection).toBeTruthy()
    expect(s.edges.some((e) => e.source === collection!.id && e.target === 'player' && e.targetHandle === 'patternset')).toBe(true)
    expect(diagnostics().some((d) => d.title === 'Music Player has no patterns')).toBe(false)
  })

  it('connects a collection that is already on the canvas rather than adding a second', () => {
    useGraphStore.getState().loadGraph([node('player', 'PatternMaster'), node('col', 'PatternCollection')], [])
    expect(addPatternCollectionTo('player')).toBe('connected')
    expect(useGraphStore.getState().nodes.filter((n) => n.data.nodeType === 'PatternCollection')).toHaveLength(1)
  })

  it('leaves a collection already feeding something else alone', () => {
    useGraphStore.getState().loadGraph([
      node('player', 'PatternMaster'), node('other', 'PatternSlideshow'), node('col', 'PatternCollection'),
    ], [edge('busy', 'col', 'patternset', 'other', 'patternset')])
    expect(addPatternCollectionTo('player')).toBe('added')
  })
})

describe('Open Board settings', () => {
  it('is offered for a large fixture with no power cap', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { powerLimit: false }),
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 32, height: 32 }),
    ], [edge('f', 'sc', 'frame', 'out', 'frame')])
    expect(diagnostics().find((d) => d.category === 'power')?.action).toBe('open-board-settings')
  })
})

describe('Disconnect Controls', () => {
  // A screen design whose widgets were all deleted, with the Touch node's
  // Controls wire still running to the LED output: the wire carries nothing.
  const load = (withControls: boolean) => {
    const blank = createDisplayDocument('screen', 240, 320)
    const document = withControls ? applyDisplayTemplate(blank, 'led-performance') : blank
    useGraphStore.getState().loadGraph([
      node('juggle', 'Juggle'),
      node('out', 'MatrixOutput'),
      node('panel', 'TransportDisplay', {
        partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Custom design', displayId: 'screen',
      }),
      node('panel-touch', 'TouchInput', { panelId: 'panel' }),
    ], [
      edge('frame', 'juggle', 'frame', 'out', 'frame'),
      edge('ctl', 'panel-touch', 'controls', 'out', 'controls'),
    ])
    useGraphStore.setState({ displayDocuments: { screen: document } })
  }
  const card = () => {
    const s = useGraphStore.getState()
    return buildGraphDiagnostics(s.nodes, s.edges, { displayDocuments: s.displayDocuments })
      .find((d) => d.repair?.kind === 'disconnect-touch-controls')
  }

  it('offers to remove the empty wire, removes it, and the card goes', () => {
    load(false)
    const found = card()
    expect(found).toMatchObject({
      severity: 'error',
      action: 'disconnect-touch-controls',
      repair: { kind: 'disconnect-touch-controls', touchId: 'panel-touch' },
      edgeIds: ['ctl'],
    })
    expect(disconnectTouchControls('panel-touch')).toBe(true)
    expect(useGraphStore.getState().edges.map((e) => e.id)).toEqual(['frame'])
    expect(card()).toBeUndefined()
  })

  it('reports already changed rather than acting twice', () => {
    load(false)
    expect(disconnectTouchControls('panel-touch')).toBe(true)
    expect(disconnectTouchControls('panel-touch')).toBe(false)
  })

  it('keeps a wire that carries template controls, and offers nothing', () => {
    load(true)
    expect(card()).toBeUndefined()
    expect(disconnectTouchControls('panel-touch')).toBe(false)
    expect(useGraphStore.getState().edges.some((e) => e.id === 'ctl')).toBe(true)
  })
})

describe('Lower the frame rate', () => {
  const graph = () => [
    node('board-root', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1', frameRate: 60 }),
    node('pattern', 'SolidColor'),
    node('out', 'MatrixOutput', { form: 'matrix', width: 32, height: 32, chipset: 'WS2812B' }),
  ]

  it('sets the Board to the rate the wire reaches, from a group, and refuses a second time', () => {
    useGraphStore.getState().loadGraph(graph(), [edge('feed', 'pattern', 'frame', 'out', 'frame')])
    const card = diagnostics().find((d) => d.repair?.kind === 'set-frame-rate')
    expect(card?.repair).toEqual({ kind: 'set-frame-rate', frameRate: 32 })
    const root = useGraphStore.getState()
    useGraphStore.setState({
      activeGraphId: 'pattern', nodes: [], edges: [],
      graphData: { [ROOT_GRAPH_ID]: { nodes: root.nodes, edges: root.edges } },
    })
    expect(setBoardFrameRate(32)).toEqual({ ok: true, frameRate: 32 })
    expect(rootGraphNodes(useGraphStore.getState()).find((n) => n.id === 'board-root')?.data.properties.frameRate).toBe(32)
    expect(setBoardFrameRate(32)).toMatchObject({ ok: false, reason: expect.stringContaining('already') })
  })

  it('clears its own card', () => {
    useGraphStore.getState().loadGraph(graph(), [edge('feed', 'pattern', 'frame', 'out', 'frame')])
    expect(setBoardFrameRate(32).ok).toBe(true)
    expect(diagnostics().some((d) => d.repair?.kind === 'set-frame-rate')).toBe(false)
  })

  it('clocks a clocked output at the next supported rate, only upward', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1', frameRate: 60 }),
      node('pattern', 'SolidColor'),
      node('out', 'MatrixOutput', { form: 'matrix', width: 32, height: 32, chipset: 'WS2801' }),
    ], [edge('feed', 'pattern', 'frame', 'out', 'frame')])
    const card = diagnostics().find((d) => d.id === 'wire-time-frame-rate')
    expect(card?.moreFixes).toEqual([{ action: 'raise-data-rate', repair: { kind: 'set-data-rate', nodeId: 'out', dataRateMhz: 2 } }])
    expect(setOutputDataRate('out', 2)).toEqual({ ok: true, dataRateMhz: 2 })
    expect(rootGraphNodes(useGraphStore.getState()).find((n) => n.id === 'out')?.data.properties.dataRateMhz).toBe(2)
    expect(setOutputDataRate('out', 2).ok).toBe(false)
    expect(setOutputDataRate('out', 3).ok).toBe(false)
  })
})

describe('split across pins repair', () => {
  it('offers a split on whole rows with free pins, and applies it once', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1', frameRate: 60 }),
      node('pattern', 'SolidColor'),
      node('out', 'MatrixOutput', { form: 'matrix', width: 32, height: 32, chipset: 'WS2812B', dataPin: 4 }),
    ], [edge('feed', 'pattern', 'frame', 'out', 'frame')])
    const card = diagnostics().find((d) => d.id === 'wire-time-frame-rate')
    const split = card?.moreFixes?.find((fix) => fix.action === 'split-across-pins')
    expect(split?.repair).toMatchObject({ kind: 'split-across-pins', nodeId: 'out', dataLanes: 2 })
    if (split?.repair?.kind !== 'split-across-pins') return
    const { dataLanes, lanePins } = split.repair
    expect(lanePins).toHaveLength(1)
    expect(lanePins).not.toContain(4)
    expect(splitOutputAcrossPins('out', dataLanes, lanePins)).toEqual({ ok: true, dataLanes, lanePins })
    const props = rootGraphNodes(useGraphStore.getState()).find((n) => n.id === 'out')?.data.properties
    expect(props).toMatchObject({ dataLanes: 2, lanePins })
    expect(splitOutputAcrossPins('out', 3, [5, 6]).ok).toBe(false)
  })
})

describe('repairs on secondary boards', () => {
  const boards = () => [
    node('board-root', 'Board', { profileId: 'espressif-esp32-devkit-v1', frameRate: 60 }),
    node('board-2', 'Board', { profileId: 'seeed-xiao-esp32s3', frameRate: 60 }),
  ]
  const props = (id: string) => rootGraphNodes(useGraphStore.getState()).find((entry) => entry.id === id)!.data.properties

  it('keeps each board frame-rate repair separate and changes only its target', () => {
    const nodes = [...boards(), node('pattern', 'SolidColor'),
      node('out1', 'MatrixOutput', { width: 32, height: 32 }),
      node('out2', 'MatrixOutput', { width: 32, height: 32, boardId: 'board-2' })]
    const edges = [edge('e1', 'pattern', 'frame', 'out1', 'frame'), edge('e2', 'pattern', 'frame', 'out2', 'frame')]
    useGraphStore.getState().loadGraph(nodes, edges)
    const cards = buildBoardDiagnostics(nodes, edges, { targets: {} }).filter((issue) => issue.repair?.kind === 'set-frame-rate')
    expect(cards).toHaveLength(2)
    expect(new Set(cards.map((card) => card.id)).size).toBe(2)
    const repair = cards.find((card) => card.repair?.kind === 'set-frame-rate' && card.repair.boardId === 'board-2')!.repair!
    if (repair.kind !== 'set-frame-rate') throw new Error('Expected a frame-rate repair')
    useGraphStore.setState({ activeGraphId: 'open-group', nodes: [], edges: [], graphData: { [ROOT_GRAPH_ID]: { nodes, edges } } })
    expect(setBoardFrameRate(repair.frameRate, repair.boardId).ok).toBe(true)
    expect(props('board-root').frameRate).toBe(60)
    expect(props('board-2').frameRate).toBe(repair.frameRate)
    expect(useGraphStore.getState().nodes).toEqual([])
    expect(setBoardLedDriver('LCD_CLOCKLESS', 'board-2').ok).toBe(true)
    expect(props('board-root').ledDriver).not.toBe('LCD_CLOCKLESS')
    expect(props('board-2').ledDriver).toBe('LCD_CLOCKLESS')
    expect(setBoardFrameRate(10, 'removed-board').ok).toBe(false)
    expect(setBoardLedDriver('auto', 'removed-board').ok).toBe(false)
    expect(props('board-root').frameRate).toBe(60)
  })

  it('moves only the secondary board I2C parts using its own bus pins', () => {
    useGraphStore.getState().loadGraph([...boards(),
      node('rtc1', 'RTCInput', { timeSource: 'DS3231', sdaPin: 21, sclPin: 22 }),
      node('rtc2', 'RTCInput', { timeSource: 'DS3231', sdaPin: 3, sclPin: 4, boardId: 'board-2' }),
      node('button', 'ButtonInput', { pin: 5 }),
    ], [])
    expect(moveI2cPartsToBoardPins('board-2')).toEqual({ ok: true, pins: { sdaPin: 5, sclPin: 6 } })
    expect(props('rtc1')).toMatchObject({ sdaPin: 21, sclPin: 22 })
    expect(props('rtc2')).toMatchObject({ sdaPin: 5, sclPin: 6 })
  })

  it('allocates a secondary part pin from that board profile and claims', () => {
    useGraphStore.getState().loadGraph([...boards(),
      node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41, boardId: 'board-2' }),
    ], [])
    const result = movePartPinToFree('mic', 'i2sWs')
    expect(result.ok).toBe(true)
    const state = useGraphStore.getState()
    const partition = boardPartition(state.nodes, state.edges, 'board-2')
    expect(buildGraphDiagnostics(partition.nodes, partition.edges, {}).some((issue) =>
      issue.repair?.kind === 'move-pin' && issue.repair.nodeId === 'mic' && issue.repair.propertyKey === 'i2sWs')).toBe(false)
    expect(collectPinUses(partition.nodes).some((use) => use.nodeId === 'mic' && use.propertyKey === 'i2sWs' && result.ok && use.pin === result.pin)).toBe(true)
  })

  it('allows lane pins already used by another board but refuses local claims', () => {
    useGraphStore.getState().loadGraph([...boards(),
      node('out1', 'MatrixOutput', { width: 32, height: 32, dataPin: 5 }),
      node('out2', 'MatrixOutput', { width: 32, height: 32, dataPin: 4, boardId: 'board-2' }),
      node('button', 'ButtonInput', { pin: 6, boardId: 'board-2' }),
    ], [])
    expect(splitOutputAcrossPins('out2', 2, [6]).ok).toBe(false)
    expect(splitOutputAcrossPins('out2', 2, [5]).ok).toBe(true)
    expect(props('out1').dataLanes).not.toBe(2)
    expect(props('out2')).toMatchObject({ dataLanes: 2, lanePins: [5] })
  })
})
