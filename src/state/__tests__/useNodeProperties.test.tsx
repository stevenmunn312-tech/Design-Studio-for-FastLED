import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import { useGraphStore, useNodeProperties } from '../graphStore'
import DmxInputBody from '../../components/Canvas/bodies/DmxInputBody'

describe('useNodeProperties', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads a missing node as one shared empty object', () => {
    useGraphStore.setState({ nodes: [], edges: [] })
    const { result, rerender } = renderHook(() => useNodeProperties('gone'))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
    expect(first).toEqual({})
  })

  it('mounts a node body whose node is missing without an uncached snapshot', () => {
    // A fresh `{}` per read made React log this, and re-render, on load.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    useGraphStore.setState({ nodes: [], edges: [] })
    render(<DmxInputBody nodeId="gone" />)
    expect(error.mock.calls.map((call) => String(call[0])).filter((text) => text.includes('getSnapshot'))).toEqual([])
  })
})
