import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render } from '@testing-library/react'
import PatternCollectionBody from '../PatternCollectionBody'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { usePatternLibrary, type SavedPattern } from '../../../state/patternLibrary'

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
    usePatternLibrary.setState({ patterns: [] })
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

  it('adds several saved patterns through the node picker in one action', () => {
    const patterns: SavedPattern[] = ['Aurora', 'Comet'].map((name, index) => ({
      id: `saved-${index}`,
      name,
      createdAt: index,
      inputs: [],
      outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [], edges: [] },
    }))
    usePatternLibrary.setState({ patterns })

    const view = render(<PatternCollectionBody nodeId="collection" />)
    fireEvent.click(view.getByRole('button', { name: 'Add patterns…' }))

    expect(view.getByRole('dialog', { name: 'Add patterns to collection' })).toBeTruthy()
    fireEvent.click(view.getByLabelText('Select Aurora'))
    fireEvent.click(view.getByLabelText('Select Comet'))
    fireEvent.click(view.getByRole('button', { name: 'Add 2 patterns' }))

    const collection = useGraphStore.getState().nodes.find((node) => node.id === 'collection')
    const ids = (collection?.data.properties as { patternIds?: string[] }).patternIds ?? []
    expect(ids).toHaveLength(4)
    expect(ids.slice(2).map((id) => useGraphStore.getState().graphs[id]?.sourcePatternId)).toEqual([
      'saved-0',
      'saved-1',
    ])
  })
})
