import { beforeEach, describe, expect, it } from 'vitest'
import { useGraphStore } from '../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import type { StudioEdge, StudioNode } from '../graphStore'
import {
  PLAYER_CONTROL_ADD_HANDLE,
  PLAYER_CONTROL_FUNCTIONS,
  normalizePlayerControlIds,
  playerControlIdsFromEdges,
  playerControlInputs,
  playerControlHint,
  sensiblePlayerControls,
} from '../playerControlAssignments'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def?.label ?? nodeType, nodeType, category: def?.category ?? 'show',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th }) as unknown as StudioEdge

function reset(nodes: StudioNode[], edges: StudioEdge[] = []) {
  useGraphStore.getState().loadGraph(nodes, edges)
}

const controlsOf = (id: string) => {
  const found = useGraphStore.getState().nodes.find((candidate) => candidate.id === id)
  return normalizePlayerControlIds(found?.data.properties.controls)
}
const portsOf = (id: string) => {
  const found = useGraphStore.getState().nodes.find((candidate) => candidate.id === id)
  return (found?.data.inputs as Array<{ id: string }>).map((port) => port.id)
}

describe('what a control can sensibly be given to do', () => {
  // Sensible is narrower than compatible: portsCompatible lets float and bool
  // interconvert, which is right for arithmetic and wrong for a knob. A button
  // on Volume would set 0 or 1 and nothing between.
  it('matches the dataType exactly rather than what portsCompatible allows', () => {
    const forButton = sensiblePlayerControls('bool', []).map((entry) => entry.id)
    const forKnob = sensiblePlayerControls('float', []).map((entry) => entry.id)
    expect(forButton).toContain('playPause')
    expect(forButton).not.toContain('volume')
    expect(forKnob).toContain('volume')
    expect(forKnob).toContain('patternSelect')
    expect(forKnob).not.toContain('playPause')
    expect([...forButton, ...forKnob].sort())
      .toEqual(PLAYER_CONTROL_FUNCTIONS.map((entry) => entry.id).sort())
  })

  it('offers only what the chain it feeds can act on', () => {
    // A wire that connects, validates and does nothing is worse than one that
    // is refused: pressing the button and blaming the soldering is the failure
    // this filter exists to prevent.
    const toOutput = new Set(['output'] as const)
    const forOutput = sensiblePlayerControls('bool', [], toOutput).map((entry) => entry.id)
    expect(forOutput).toEqual(['ledToggle', 'brightnessUp', 'brightnessDown'])
    expect(sensiblePlayerControls('float', [], toOutput).map((entry) => entry.id)).toEqual(['brightness'])

    const toEngine = new Set(['engine'] as const)
    expect(sensiblePlayerControls('bool', [], toEngine).map((entry) => entry.id))
      .toEqual(['patternPrevious', 'patternNext', 'patternConfirm'])

    // The player holds the track, the lamp and the collection.
    const toPlayer = new Set(['player'] as const)
    expect(sensiblePlayerControls('bool', [], toPlayer).map((entry) => entry.id))
      .toEqual(PLAYER_CONTROL_FUNCTIONS.filter((entry) => entry.dataType === 'bool').map((entry) => entry.id))

    // Two destinations union rather than intersect.
    expect(sensiblePlayerControls('bool', [], new Set(['output', 'engine'] as const)).map((entry) => entry.id))
      .toEqual(['ledToggle', 'brightnessUp', 'brightnessDown', 'patternPrevious', 'patternNext', 'patternConfirm'])
  })

  it('judges nothing while the Controls output goes nowhere', () => {
    // A chain not yet plugged in has no destination to judge against, and
    // refusing every function would leave nothing to build the graph with.
    expect(sensiblePlayerControls('bool', [], new Set()).map((entry) => entry.id))
      .toEqual(sensiblePlayerControls('bool', []).map((entry) => entry.id))
  })

  it('names each function an edge or a position', () => {
    const byId = new Map(PLAYER_CONTROL_FUNCTIONS.map((entry) => [entry.id, entry]))
    expect(playerControlHint(byId.get('playPause')!)).toBe('On each press')
    expect(playerControlHint(byId.get('volume')!)).toBe('Holds its position, 0 to 1')
    expect(playerControlHint(byId.get('patternSelect')!)).toBe('Turn — one detent per pattern')
  })

  it('never offers a function already assigned', () => {
    const offered = sensiblePlayerControls('bool', ['playPause', 'next']).map((entry) => entry.id)
    expect(offered).not.toContain('playPause')
    expect(offered).not.toContain('next')
    expect(offered).toContain('previous')
  })

  it('offers nothing for a source with no type this node takes', () => {
    expect(sensiblePlayerControls(undefined, [])).toEqual([])
    expect(sensiblePlayerControls('frame', [])).toEqual([])
  })
})

describe('the ports a Player Controls node mints', () => {
  it('starts with the bundle input and the invitation only', () => {
    expect(playerControlInputs([]).map((port) => port.id))
      .toEqual(['controlsIn', PLAYER_CONTROL_ADD_HANDLE])
  })

  // The port id is the function id, unchanged from when all fourteen were
  // declared in NODE_LIBRARY — which is why the evaluator, the generators and
  // the firmware needed no teaching at all.
  it('names a minted port after the function, not after a row id', () => {
    const ports = playerControlInputs(['playPause', 'volume'])
    expect(ports.map((port) => port.id))
      .toEqual(['controlsIn', 'playPause', 'volume', PLAYER_CONTROL_ADD_HANDLE])
    expect(ports.find((port) => port.id === 'volume')?.dataType).toBe('float')
    expect(ports.find((port) => port.id === 'playPause')?.label).toBe('Play / Pause')
  })

  it('drops the invitation once every function is assigned', () => {
    const all = PLAYER_CONTROL_FUNCTIONS.map((entry) => entry.id)
    expect(playerControlInputs(all).map((port) => port.id)).not.toContain(PLAYER_CONTROL_ADD_HANDLE)
  })

  it('ignores an unknown or duplicated assignment', () => {
    expect(normalizePlayerControlIds(['playPause', 'playPause', 'nonsense', 7]))
      .toEqual(['playPause'])
  })
})

describe('assigning a control through the picker', () => {
  beforeEach(() => reset([]))

  // A drop on the trailing socket is not a connection yet. Nothing on the
  // source side can name it, so the edge must not exist until the picker says
  // what it is for.
  it('holds the connection instead of creating an edge', () => {
    reset([node('btn', 'ButtonInput'), node('pc', 'PlayerControls')])

    useGraphStore.getState().onConnect({
      source: 'btn', sourceHandle: 'pressed', target: 'pc', targetHandle: PLAYER_CONTROL_ADD_HANDLE,
    })

    const state = useGraphStore.getState()
    expect(state.edges).toEqual([])
    expect(state.pendingControlAssignment).toMatchObject({ nodeId: 'pc', sourceDataType: 'bool' })
    expect(controlsOf('pc')).toEqual([])
  })

  it('mints the chosen port, lands the wire on it, and grows a fresh socket', () => {
    reset([node('btn', 'ButtonInput'), node('pc', 'PlayerControls')])
    useGraphStore.getState().onConnect({
      source: 'btn', sourceHandle: 'pressed', target: 'pc', targetHandle: PLAYER_CONTROL_ADD_HANDLE,
    })

    useGraphStore.getState().assignPlayerControl('playPause')

    const state = useGraphStore.getState()
    expect(state.pendingControlAssignment).toBeNull()
    expect(controlsOf('pc')).toEqual(['playPause'])
    expect(portsOf('pc')).toEqual(['controlsIn', 'playPause', PLAYER_CONTROL_ADD_HANDLE])
    expect(state.edges).toContainEqual(expect.objectContaining({
      source: 'btn', sourceHandle: 'pressed', target: 'pc', targetHandle: 'playPause',
    }))
  })

  it('abandons the connection outright when the picker is dismissed', () => {
    reset([node('btn', 'ButtonInput'), node('pc', 'PlayerControls')])
    useGraphStore.getState().onConnect({
      source: 'btn', sourceHandle: 'pressed', target: 'pc', targetHandle: PLAYER_CONTROL_ADD_HANDLE,
    })

    useGraphStore.getState().cancelPlayerControlAssignment()

    expect(useGraphStore.getState().pendingControlAssignment).toBeNull()
    expect(useGraphStore.getState().edges).toEqual([])
    expect(controlsOf('pc')).toEqual([])
  })

  it('leaves an ordinary connection alone', () => {
    reset([node('btn', 'ButtonInput'), node('pc', 'PlayerControls', { controls: ['next'] })])

    useGraphStore.getState().onConnect({
      source: 'btn', sourceHandle: 'pressed', target: 'pc', targetHandle: 'next',
    })

    expect(useGraphStore.getState().pendingControlAssignment).toBeNull()
    expect(useGraphStore.getState().edges).toHaveLength(1)
  })

  // The case the design note said to write first. Neither end can name itself:
  // the bank's row takes its name from the target port, and the target port is
  // only real once the picker has minted it. The row therefore has to be added
  // before the connection is completed, or the bank names itself after the
  // trailing socket.
  it('names both ends when two dynamic sockets meet', () => {
    reset([node('bank', 'ButtonBank', { buttons: [] }), node('pc', 'PlayerControls')])

    useGraphStore.getState().onConnect({
      source: 'bank', sourceHandle: 'add-button', target: 'pc', targetHandle: PLAYER_CONTROL_ADD_HANDLE,
    })
    expect(useGraphStore.getState().pendingControlAssignment).toMatchObject({ sourceDataType: 'bool' })

    useGraphStore.getState().assignPlayerControl('patternConfirm')

    const state = useGraphStore.getState()
    const bank = state.nodes.find((candidate) => candidate.id === 'bank')!
    const buttons = bank.data.properties.buttons as Array<{ id: string; label: string }>
    expect(buttons).toHaveLength(1)
    expect(buttons[0].label).toBe('Confirm')
    expect(controlsOf('pc')).toEqual(['patternConfirm'])
    expect(state.edges).toContainEqual(expect.objectContaining({
      source: 'bank', sourceHandle: `button-${buttons[0].id}`, target: 'pc', targetHandle: 'patternConfirm',
    }))
  })

  // Same reasoning as a Button Bank retaining a row after its noodle is cut:
  // rewiring should be a drag, not a re-decision.
  it('keeps the row when its wire is removed', () => {
    reset(
      [node('btn', 'ButtonInput'), node('pc', 'PlayerControls', { controls: ['playPause'] })],
      [edge('e', 'btn', 'pressed', 'pc', 'playPause')],
    )

    useGraphStore.getState().removeEdge('e')

    expect(controlsOf('pc')).toEqual(['playPause'])
    expect(portsOf('pc')).toContain('playPause')
  })

  it('removes a row and the wire feeding it together', () => {
    reset(
      [node('btn', 'ButtonInput'), node('pc', 'PlayerControls', { controls: ['playPause', 'next'] })],
      [edge('e', 'btn', 'pressed', 'pc', 'playPause')],
    )

    useGraphStore.getState().removePlayerControlAssignment('pc', 'playPause')

    expect(controlsOf('pc')).toEqual(['next'])
    expect(portsOf('pc')).not.toContain('playPause')
    expect(useGraphStore.getState().edges).toEqual([])
  })
})

describe('loading a workspace saved before assignments existed', () => {
  // Those saves have edges landing on ports that used to be declared
  // unconditionally. Seeding the list from the wires is what stops a load
  // silently dropping every one of them.
  it('seeds the assignment list from the wires already landing on it', () => {
    reset(
      [node('btn', 'ButtonInput'), node('knob', 'PotInput'), node('pc', 'PlayerControls')],
      [
        edge('e1', 'btn', 'pressed', 'pc', 'playPause'),
        edge('e2', 'knob', 'value', 'pc', 'brightness'),
      ],
    )

    expect(controlsOf('pc')).toEqual(['playPause', 'brightness'])
    expect(portsOf('pc')).toEqual([
      'controlsIn', 'playPause', 'brightness', PLAYER_CONTROL_ADD_HANDLE,
    ])
    expect(useGraphStore.getState().edges).toHaveLength(2)
  })

  // Catalogue order, not edge order, so two loads of one file cannot produce
  // two different node layouts.
  it('orders seeded assignments by the catalogue', () => {
    const ids = playerControlIdsFromEdges('pc', [
      { target: 'pc', targetHandle: 'patternConfirm' },
      { target: 'pc', targetHandle: 'playPause' },
      { target: 'other', targetHandle: 'next' },
    ])
    expect(ids).toEqual(['playPause', 'patternConfirm'])
  })
})
