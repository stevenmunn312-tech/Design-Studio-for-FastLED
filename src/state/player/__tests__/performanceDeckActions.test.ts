import { beforeEach, describe, expect, it } from 'vitest'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../graphStore'
import { usePerformanceDeckSession } from '../performanceDeckSessionStore'
import { applyMidiEventToBindings, setMorphScenes } from '../performanceDeckActions'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const red = () => Number(useGraphStore.getState().nodes.find((n) => n.id === 'sc')!.data.properties.r)

describe('performance deck MIDI bindings with the panel closed', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([node('sc', 'SolidColor', { r: 0 })], [], { activeGraphId: ROOT_GRAPH_ID })
    useGraphStore.getState().pinProperty('sc', 'r')
    usePerformanceDeckSession.setState({
      deckOpen: false,
      midiLearnTarget: null,
      keyLearnAction: null,
      morphSceneA: null,
      morphSceneB: null,
      morphProgress: 0,
    })
  })

  it('a MIDI fader bound to the scene morph moves the graph without the deck mounted', () => {
    const store = useGraphStore.getState()
    const sceneA = store.saveScene('Dark')
    store.updateNodeProperty('sc', 'r', 100)
    const sceneB = store.saveScene('Bright')
    store.addMidiBinding({ target: { kind: 'morph' }, message: 'cc', channel: 0, number: 1 })
    setMorphScenes(sceneA, sceneB)
    expect(red()).toBe(0)

    applyMidiEventToBindings({ kind: 'cc', channel: 0, number: 1, value: 0.5 })
    expect(usePerformanceDeckSession.getState().morphProgress).toBe(0.5)
    expect(red()).toBe(50)

    applyMidiEventToBindings({ kind: 'cc', channel: 0, number: 1, value: 1 })
    expect(red()).toBe(100)
  })

  it('an unpaired crossfader leaves the graph alone', () => {
    const store = useGraphStore.getState()
    store.updateNodeProperty('sc', 'r', 42)
    store.addMidiBinding({ target: { kind: 'morph' }, message: 'cc', channel: 0, number: 1 })
    applyMidiEventToBindings({ kind: 'cc', channel: 0, number: 1, value: 0.5 })
    expect(red()).toBe(42)
  })
})
