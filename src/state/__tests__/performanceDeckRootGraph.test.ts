import { beforeEach, describe, expect, it } from 'vitest'
import { ROOT_GRAPH_ID, clearStashedGraphHistory, rootGraphNodes, useGraphStore, type StudioNode } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'
import { useUiStore } from '../uiStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const rootBrightness = () =>
  rootGraphNodes(useGraphStore.getState()).find((n) => n.id === 'out')!.data.properties.brightness

/** Open a pattern group on the canvas, leaving the LED output in the root graph. */
async function openGroupOnCanvas() {
  const gid = useGraphStore.getState().createGroup('Blue', ['sc'])
  useGraphStore.getState().enterGraph(gid)
  await Promise.resolve()
  expect(useGraphStore.getState().activeGraphId).toBe(gid)
  expect(useGraphStore.getState().nodes.some((n) => n.id === 'out')).toBe(false)
}

describe('performance deck actions from inside a group', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [node('sc', 'SolidColor', { r: 10 }), node('out', 'MatrixOutput', { brightness: 200 })],
      edges: [], selectedNodeId: null, clipboard: null,
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},
      trusted: true,
      performanceDeck: { pins: [], scenes: [], midiBindings: [], keyBindings: [] },
      panicActive: false,
      panicRestoreValues: null,
    })
    useUiStore.setState({ fitViewRequest: { nonce: 0 } })
    clearStashedGraphHistory()
  })

  it('panic dims the root LED output and restore brings it back', async () => {
    await openGroupOnCanvas()
    useGraphStore.getState().panic()
    expect(useGraphStore.getState().panicActive).toBe(true)
    expect(rootBrightness()).toBe(0)

    useGraphStore.getState().restorePanic()
    expect(useGraphStore.getState().panicActive).toBe(false)
    expect(rootBrightness()).toBe(200)
  })

  it('recalling a scene restores a pinned root property', async () => {
    useGraphStore.getState().pinProperty('out', 'brightness')
    const sceneId = useGraphStore.getState().saveScene('Bright')
    await openGroupOnCanvas()

    useGraphStore.getState().updateNodeProperty('out', 'brightness', 50)
    expect(rootBrightness()).toBe(50)

    useGraphStore.getState().recallScene(sceneId)
    expect(rootBrightness()).toBe(200)
  })

  it('saving and updating a scene from inside a group keeps root pins', async () => {
    useGraphStore.getState().pinProperty('out', 'brightness')
    useGraphStore.getState().pinProperty('sc', 'r')
    await openGroupOnCanvas()

    const sceneId = useGraphStore.getState().saveScene('Mixed')
    const saved = useGraphStore.getState().performanceDeck.scenes.find((sc) => sc.id === sceneId)!
    expect(Object.values(saved.values)).toEqual(expect.arrayContaining([200, 10]))

    useGraphStore.getState().updateNodeProperty('out', 'brightness', 50)
    useGraphStore.getState().updateScene(sceneId)
    const updated = useGraphStore.getState().performanceDeck.scenes.find((sc) => sc.id === sceneId)!
    expect(Object.values(updated.values)).toEqual(expect.arrayContaining([50, 10]))
  })

  it('panic still zeros a pin on a node inside the open group', async () => {
    useGraphStore.getState().pinProperty('sc', 'r')
    await openGroupOnCanvas()
    useGraphStore.getState().panic()
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'sc')!.data.properties.r).toBe(0)
    expect(rootBrightness()).toBe(0)
  })
})
