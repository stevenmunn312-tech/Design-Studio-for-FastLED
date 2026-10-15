import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGroupRegistry } from '../useGroupRegistry'
import { useGraphStore, type StudioNode } from '../../state/graphStore'

function node(id: string, extra: Partial<StudioNode> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: id, nodeType: 'SolidColor', category: 'pattern', properties: {}, inputs: [], outputs: [] },
    ...extra,
  } as StudioNode
}

const pattern = { nodes: [node('inner')], edges: [] }

describe('useGroupRegistry', () => {
  // Consumers memoise expensive work (the capacity sketch) on the registry's
  // identity, so a click that only selects or moves must not replace it.
  it('keeps its identity at the root while the root nodes are selected or moved', () => {
    useGraphStore.setState({
      nodes: [node('a')], edges: [], activeGraphId: 'root',
      graphData: { root: { nodes: [], edges: [] }, g1: pattern } as never,
    })
    const { result } = renderHook(() => useGroupRegistry())
    const first = result.current
    expect(first.g1.nodes).toBe(pattern.nodes)
    act(() => useGraphStore.setState({ nodes: [node('a', { selected: true, position: { x: 9, y: 9 } })] }))
    expect(result.current).toBe(first)
  })

  it('follows edits inside an open subgraph but not selection there', () => {
    useGraphStore.setState({
      nodes: [node('inner')], edges: [], activeGraphId: 'g1',
      graphData: { root: { nodes: [], edges: [] }, g1: pattern } as never,
    })
    const { result } = renderHook(() => useGroupRegistry())
    const first = result.current
    act(() => useGraphStore.setState({ nodes: [node('inner', { selected: true })] }))
    expect(result.current).toBe(first)
    act(() => useGraphStore.setState({
      nodes: [node('inner', { data: { ...node('inner').data, properties: { color: '#00ff00' } } })],
    }))
    expect(result.current).not.toBe(first)
    expect(result.current.g1.nodes[0].data.properties).toEqual({ color: '#00ff00' })
  })
})
