/*
 * The repairs Graph Health performs rather than describes. Each one has to
 * leave the graph in the state its card promised, and the card has to go away
 * once it has.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addPatternCollectionTo,
  connectShowOutput,
  disconnectTouchControls,
  movePartPinToFree,
  useGraphStore,
  type StudioEdge,
  type StudioNode,
} from '../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { useUploadStore } from '../uploadStore'
import { buildGraphDiagnostics } from '../../utils/validateGraph'
import { createDisplayDocument } from '../displayEditor'
import { applyDisplayTemplate } from '../displayTemplates'

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
