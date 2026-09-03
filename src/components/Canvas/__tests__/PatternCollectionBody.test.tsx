import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render } from '@testing-library/react'
import PatternCollectionBody from '../PatternCollectionBody'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { usePatternLibrary, type SavedPattern } from '../../../state/patternLibrary'
import { useUiStore } from '../../../state/uiStore'

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

  it('empties the collection in one confirmed edit, discarding its subgraphs', async () => {
    useGraphStore.setState({ graphData: { 'group-1': { nodes: [], edges: [] }, 'group-2': { nodes: [], edges: [] } } })
    const confirm = vi.fn().mockResolvedValue(true)
    useUiStore.setState({ requestConfirm: confirm })

    const { getByText } = render(<PatternCollectionBody nodeId="collection" />)
    fireEvent.click(getByText('Remove all'))
    await vi.waitFor(() => {
      const props = useGraphStore.getState().nodes[0].data.properties as { patternIds: string[] }
      expect(props.patternIds).toEqual([])
    })

    expect(confirm).toHaveBeenCalled()
    // The absorbed subgraphs go with them, exactly as the per-row remove does.
    expect(useGraphStore.getState().graphData['group-1']).toBeUndefined()
    expect(useGraphStore.getState().graphs['group-2']).toBeUndefined()
  })

  it('leaves the collection alone when the confirm is declined', async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    useUiStore.setState({ requestConfirm: confirm })

    const { getByText } = render(<PatternCollectionBody nodeId="collection" />)
    fireEvent.click(getByText('Remove all'))
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled())

    const props = useGraphStore.getState().nodes[0].data.properties as { patternIds: string[] }
    expect(props.patternIds).toEqual(['group-1', 'group-2'])
  })

  it('offers no Remove all on an empty collection', () => {
    useGraphStore.setState({
      nodes: [{
        id: 'collection', type: 'studioNode', position: { x: 0, y: 0 },
        data: nodeData('PatternCollection', { patternIds: [], patternSections: {} }),
      }] as never,
    })
    const { queryByText } = render(<PatternCollectionBody nodeId="collection" />)
    expect(queryByText('Remove all')).toBeNull()
  })
})
