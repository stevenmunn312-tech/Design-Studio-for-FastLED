import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render } from '@testing-library/react'
import PatternCollectionBody from '../PatternCollectionBody'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'

function nodeData(type: string, properties: Record<string, unknown>) {
  const def = NODE_LIBRARY.find((n) => n.type === type)!
  return {
    label: def.label,
    nodeType: def.type,
    category: def.category,
    properties,
    inputs: def.inputs,
    outputs: def.outputs,
  }
}

describe('PatternCollectionBody', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'collection',
          type: 'studioNode',
          position: { x: 0, y: 0 },
          data: nodeData('PatternCollection', {
            patternIds: ['group-1', 'group-2'],
            patternSections: {},
          }),
        },
      ],
      edges: [],
      graphs: {
        root: { id: 'root', name: 'Main' },
        'group-1': { id: 'group-1', name: 'Pulse' },
        'group-2': { id: 'group-2', name: 'Spark' },
      },
      graphData: {},
      activeGraphId: 'root',
      selectedNodeId: null,
    })
  })

  it('consumes wheel events while the pattern list can scroll', () => {
    const { container } = render(<PatternCollectionBody nodeId="collection" />)
    const list = container.querySelector('ul') as HTMLUListElement
    expect(list).toBeTruthy()

    Object.defineProperties(list, {
      scrollTop: { configurable: true, value: 20, writable: true },
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 240 },
    })

    const event = createEvent.wheel(list, { deltaY: 40 })
    const stopPropagation = vi.spyOn(event, 'stopPropagation')
    fireEvent(list, event)

    expect(stopPropagation).toHaveBeenCalled()
  })
})
