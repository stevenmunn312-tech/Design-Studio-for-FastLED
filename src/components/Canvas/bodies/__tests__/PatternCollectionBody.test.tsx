import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render, waitFor } from '@testing-library/react'
import PatternCollectionBody from '../PatternCollectionBody'
import { useGraphStore } from '../../../../state/graphStore'
import { NODE_LIBRARY } from '../../../../state/nodeLibrary'
import { usePatternLibrary, type SavedPattern } from '../../../../state/patterns/patternLibrary'
import { useUiStore } from '../../../../state/uiStore'

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

  it('stores a non-default weight and drops the key when the weight returns to 1', () => {
    const { getByLabelText } = render(<PatternCollectionBody nodeId="collection" />)
    fireEvent.change(getByLabelText('Pulse weight'), { target: { value: '4' } })
    const weights = () => (useGraphStore.getState().nodes[0].data.properties as {
      patternWeights?: Record<string, number>
    }).patternWeights
    expect(weights()).toEqual({ 'group-1': 4 })

    fireEvent.change(getByLabelText('Pulse weight'), { target: { value: '1' } })
    expect(weights()).toEqual({})
  })

  it('toggles an energy tag and a resume entry, and clears both when turned back', () => {
    const { getByRole } = render(<PatternCollectionBody nodeId="collection" />)
    const props = () => useGraphStore.getState().nodes[0].data.properties as {
      patternEnergy?: Record<string, string[]>
      patternEntry?: Record<string, string>
    }

    fireEvent.click(getByRole('button', { name: 'Pulse: calm energy' }))
    expect(props().patternEnergy).toEqual({ 'group-1': ['calm'] })
    fireEvent.click(getByRole('button', { name: 'Pulse: calm energy' }))
    expect(props().patternEnergy).toEqual({})

    fireEvent.click(getByRole('button', { name: 'Pulse: restart entry' }))
    expect(props().patternEntry).toEqual({ 'group-1': 'resume' })
    fireEvent.click(getByRole('button', { name: 'Pulse: resume entry' }))
    expect(props().patternEntry).toEqual({})
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

  it('exports the collection as a library file with each pattern’s profile', () => {
    const clicks: string[] = []
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(`${this.download}|${decodeURIComponent(this.href.replace(/^data:[^,]*,/, ''))}`)
    })
    useGraphStore.setState({
      graphData: {
        'group-1': { nodes: [], edges: [] },
        'group-2': { nodes: [], edges: [] },
      },
      nodes: [{
        id: 'collection', type: 'studioNode', position: { x: 0, y: 0 },
        data: nodeData('PatternCollection', {
          patternIds: ['group-1', 'group-2'],
          patternSections: { 'group-2': ['drop'] },
          patternWeights: { 'group-1': 3 },
        }),
      }] as never,
    })
    try {
      const { getByText } = render(<PatternCollectionBody nodeId="collection" />)
      fireEvent.click(getByText('Export collection…'))
      expect(clicks).toHaveLength(1)
      const [name, json] = clicks[0].split('|')
      expect(name).toBe('Pattern Collection.fastled-collection.json')
      const bundle = JSON.parse(json) as { collections: { name: string; patterns: { name: string }[]; profiles: Record<string, unknown> }[] }
      expect(bundle.collections[0].patterns.map((p) => p.name)).toEqual(['Pulse', 'Spark'])
      expect(bundle.collections[0].profiles).toEqual({ '0': { weight: 3 }, '1': { sections: ['drop'] } })
      expect(useUiStore.getState().statusText).toBe('Exported “Pattern Collection” with 2 patterns')
    } finally {
      spy.mockRestore()
    }
  })

  it('copies a collection link to the clipboard', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { written.push(text) } },
    })
    useGraphStore.setState({ graphData: { 'group-1': { nodes: [], edges: [] }, 'group-2': { nodes: [], edges: [] } } })
    const { getByText } = render(<PatternCollectionBody nodeId="collection" />)
    fireEvent.click(getByText('Copy collection link'))
    await waitFor(() => expect(written).toHaveLength(1))
    expect(written[0]).toContain('#library=')
    expect(useUiStore.getState().statusText).toBe('Collection link copied to clipboard')
  })
})
