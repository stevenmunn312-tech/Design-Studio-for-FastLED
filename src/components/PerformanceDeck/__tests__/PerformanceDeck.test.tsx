import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import PerformanceDeck from '../PerformanceDeck'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { usePerformanceDeckSession } from '../../../state/performanceDeckSessionStore'
import { MidiEngine, type MidiRawEvent } from '../../../midi/midiEngine'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe('PerformanceDeck', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph(
      [node('sc', 'SolidColor', { r: 10 }), node('out', 'MatrixOutput', { brightness: 200 })],
      [],
      { activeGraphId: ROOT_GRAPH_ID },
    )
    useGraphStore.getState().pinProperty('sc', 'r')
    usePerformanceDeckSession.setState({
      deckOpen: true,
      midiLearnTarget: null,
      keyLearnAction: null,
      morphSceneA: null,
      morphSceneB: null,
      morphProgress: 0,
    })
  })

  it('renders a knob for each pinned control and drags it through updateNodeProperty', () => {
    const { getByRole } = render(<PerformanceDeck />)
    const slider = getByRole('slider', { name: /· r$/ }) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'sc')!.data.properties.r).toBe(0.5)
  })

  it('unpinning a control removes its knob', () => {
    const { getByRole, queryByRole } = render(<PerformanceDeck />)
    expect(getByRole('slider', { name: /· r$/ })).toBeTruthy()
    fireEvent.click(getByRole('button', { name: /^Unpin/ }))
    expect(queryByRole('slider', { name: /· r$/ })).toBeNull()
    expect(useGraphStore.getState().performanceDeck.pins).toHaveLength(0)
  })

  it('saves and recalls a scene', () => {
    const { getByPlaceholderText, getByText } = render(<PerformanceDeck />)
    fireEvent.change(getByPlaceholderText('Scene name'), { target: { value: 'My Scene' } })
    fireEvent.click(getByText('Save current as scene'))
    expect(useGraphStore.getState().performanceDeck.scenes).toHaveLength(1)

    useGraphStore.getState().updateNodeProperty('sc', 'r', 99)
    fireEvent.click(getByText('Recall'))
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'sc')!.data.properties.r).toBe(10)
  })

  it('the panic button zeros pinned values, and toggles to Restore', () => {
    const { getByText } = render(<PerformanceDeck />)
    fireEvent.click(getByText('⏻ PANIC'))
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'sc')!.data.properties.r).toBe(0)
    expect(useGraphStore.getState().panicActive).toBe(true)

    fireEvent.click(getByText('● Restore'))
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'sc')!.data.properties.r).toBe(10)
  })

  it('MIDI-learn capture arms, consumes the next raw event, and creates a binding', () => {
    const { getByText } = render(<PerformanceDeck />)
    fireEvent.click(getByText('Learn MIDI'))
    expect(usePerformanceDeckSession.getState().midiLearnTarget).not.toBeNull()

    const pinId = useGraphStore.getState().performanceDeck.pins[0].id
    const event: MidiRawEvent = { kind: 'cc', channel: 2, number: 74, value: 0.5 }
    // Simulate MidiEngine delivering the next raw event to any subscriber.
    ;(MidiEngine.instance as unknown as { rawListeners: Set<(e: MidiRawEvent) => void> })
      .rawListeners.forEach((fn) => fn(event))

    expect(usePerformanceDeckSession.getState().midiLearnTarget).toBeNull()
    const bindings = useGraphStore.getState().performanceDeck.midiBindings
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({ target: { kind: 'pin', pinId }, message: 'cc', channel: 2, number: 74 })
  })

  it('keybinding capture rejects a reserved combo', () => {
    const { getByText } = render(<PerformanceDeck />)
    fireEvent.click(getByText('Bind key for Panic'))
    expect(usePerformanceDeckSession.getState().keyLearnAction).toEqual({ type: 'panic' })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(usePerformanceDeckSession.getState().keyLearnAction).toBeNull()
    expect(useGraphStore.getState().performanceDeck.keyBindings).toHaveLength(0)
  })

  it('keybinding capture accepts a free combo', () => {
    const { getByText } = render(<PerformanceDeck />)
    fireEvent.click(getByText('Bind key for Panic'))
    fireEvent.keyDown(window, { key: 'F7' })
    const bindings = useGraphStore.getState().performanceDeck.keyBindings
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({ combo: 'F7', action: { type: 'panic' } })
  })
})
