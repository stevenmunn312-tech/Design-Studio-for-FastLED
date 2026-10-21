import { beforeEach, describe, expect, it } from 'vitest'
import { useGraphStore } from '../../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { exposedNodeInputs } from '../../propertyInputs'
import {
  PLAYER_CONTROL_FUNCTIONS,
  PLAYER_CONTROLS_DEFAULT_EXPOSED,
} from '../playerControlAssignments'
import { findUnusablePlayerControlWarnings } from '../../../utils/validateGraph'
import { assertWireable } from '../../../test-utils/assertWireable'

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

const definition = NODE_LIBRARY.find((entry) => entry.type === 'ControlMap')!

describe('the ports a Player Controls node declares', () => {
  // The port id is the function id, so the evaluator, the generators and the
  // firmware read every row by name with nothing else to teach them.
  it('declares the bundle input and every function', () => {
    expect(definition.label).toBe('Player Controls')
    expect(definition.inputs.map((port) => port.id))
      .toEqual(['controlsIn', ...PLAYER_CONTROL_FUNCTIONS.map((entry) => entry.id)])
    expect(definition.inputs.find((port) => port.id === 'volume')?.dataType).toBe('float')
    expect(definition.inputs.find((port) => port.id === 'playPause')?.label).toBe('Play / Pause')
  })

  it('shows the transport rows and keeps the rest behind Expose input', () => {
    const shown = exposedNodeInputs('ControlMap', undefined, new Set()).map((port) => port.id)
    expect(shown).toEqual([...PLAYER_CONTROLS_DEFAULT_EXPOSED])
    expect(shown).not.toContain('patternNext')
  })

  // A save carries no exposure list for a row it wired, and the wire has to
  // show wherever it lands.
  it('always shows a wired row', () => {
    const shown = exposedNodeInputs('ControlMap', [], new Set(['patternNext'])).map((port) => port.id)
    expect(shown).toEqual(['patternNext'])
  })
})

describe('wiring a Player Controls node', () => {
  beforeEach(() => useGraphStore.getState().loadGraph([], []))

  it('lands an ordinary connection on the function port', () => {
    useGraphStore.getState().loadGraph([node('btn', 'ButtonInput'), node('pc', 'ControlMap')], [])

    useGraphStore.getState().onConnect({
      source: 'btn', sourceHandle: 'pressed', target: 'pc', targetHandle: 'next',
    })

    const state = useGraphStore.getState()
    assertWireable(state.nodes, state.edges)
    expect(state.edges).toContainEqual(expect.objectContaining({ target: 'pc', targetHandle: 'next' }))
  })

  // Confirm went when a step started changing the LEDs directly. A save that
  // wired it loads without the dead wire rather than with one to nowhere.
  it('drops a saved wire into the retired Confirm row', () => {
    useGraphStore.getState().loadGraph(
      [node('btn', 'ButtonInput'), node('pc', 'ControlMap')],
      [{ id: 'old', source: 'btn', sourceHandle: 'pressed', target: 'pc', targetHandle: 'patternConfirm' } as StudioEdge],
    )
    expect(useGraphStore.getState().edges).toEqual([])
  })

  // A Button Bank's trailing socket names its new row after the port it was
  // dropped on, which on this node is the function itself.
  it('names a Button Bank row after the function it lands on', () => {
    useGraphStore.getState().loadGraph([node('bank', 'ButtonBank', { buttons: [] }), node('pc', 'ControlMap')], [])

    useGraphStore.getState().onConnect({
      source: 'bank', sourceHandle: 'add-button', target: 'pc', targetHandle: 'ledToggle',
    })

    const state = useGraphStore.getState()
    assertWireable(state.nodes, state.edges)
    const bank = state.nodes.find((candidate) => candidate.id === 'bank')!
    const buttons = bank.data.properties.buttons as Array<{ id: string; label: string }>
    expect(buttons.map((button) => button.label)).toEqual(['LED On / Off'])
  })
})

describe('a wired row nothing downstream can act on', () => {
  const warnings = (nodes: StudioNode[], edges: StudioEdge[]) => findUnusablePlayerControlWarnings(nodes, edges)

  it('says nothing about a row its destination honours', () => {
    expect(warnings(
      [node('btn', 'ButtonInput'), node('pc', 'ControlMap'), node('player', 'PatternMaster')],
      [edge('a', 'btn', 'pressed', 'pc', 'next'), edge('b', 'pc', 'controls', 'player', 'controls')],
    )).toEqual([])
  })

  // A Performance Generator's patterns come from the timed show file, so a
  // pattern cursor has nothing to move: the next SET_PATTERN overwrites it.
  it('names a pattern row on a Performance Generator', () => {
    const found = warnings(
      [node('btn', 'ButtonInput'), node('pc', 'ControlMap'), node('perf', 'PerformanceGenerator')],
      [edge('a', 'btn', 'pressed', 'pc', 'patternNext'), edge('b', 'pc', 'controls', 'perf', 'controls')],
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('Next Pattern')
    expect(found[0]).toContain('cannot act on it')
  })

  it('names Volume on a chain that reaches only an LED output', () => {
    const found = warnings(
      [node('knob', 'PotInput'), node('pc', 'ControlMap'), node('out', 'MatrixOutput')],
      [edge('a', 'knob', 'value', 'pc', 'volume'), edge('b', 'pc', 'controls', 'out', 'controls')],
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('Volume')
  })

  // Nothing to judge against yet; the node body says where Controls go.
  it('judges nothing while Controls goes nowhere', () => {
    expect(warnings(
      [node('btn', 'ButtonInput'), node('pc', 'ControlMap')],
      [edge('a', 'btn', 'pressed', 'pc', 'patternNext')],
    )).toEqual([])
  })

  // portsCompatible lets bool and float interconvert, which is right for
  // arithmetic and wrong for a physical control.
  it('names a button on a continuous row and a knob on a press', () => {
    const found = warnings(
      [node('btn', 'ButtonInput'), node('knob', 'PotInput'), node('pc', 'ControlMap'), node('player', 'PatternMaster')],
      [
        edge('a', 'btn', 'pressed', 'pc', 'volume'),
        edge('b', 'knob', 'value', 'pc', 'playPause'),
        edge('c', 'pc', 'controls', 'player', 'controls'),
      ],
    )
    expect(found).toHaveLength(2)
    expect(found.find((message) => message.startsWith('Volume'))).toContain('Use a knob')
    expect(found.find((message) => message.startsWith('Play / Pause'))).toContain('Use a button')
  })
})
