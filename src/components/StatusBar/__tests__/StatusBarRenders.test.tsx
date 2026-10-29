import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Profiler } from 'react'
import { act, render } from '@testing-library/react'
import StatusBar from '../StatusBar'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/upload/uploadStore'
import { useCapacityStore } from '../../../state/upload/capacityStore'

// The bar reads five UI-store fields. A whole-store subscription re-rendered
// every chip on each memory sample and view move.
describe('StatusBar subscriptions', () => {
  beforeEach(() => {
    useUiStore.setState({ statusText: 'Ready', statusLevel: 'idle', fps: 0, performanceMode: false, stageMode: false, memoryMb: null })
    useGraphStore.setState({ nodes: [], edges: [], graphData: {}, graphs: { root: { id: 'root', name: 'Main' } }, activeGraphId: 'root' })
    useUploadStore.setState({ selectedFqbn: '', selectedPort: '', ports: [] })
    useCapacityStore.getState().clear()
  })

  it('does not re-render on memory or view-centre updates', () => {
    const onRender = vi.fn()
    render(
      <Profiler id="statusbar" onRender={onRender}>
        <StatusBar />
      </Profiler>,
    )
    const settled = onRender.mock.calls.length
    act(() => {
      useUiStore.getState().setMemoryMb(96)
      useUiStore.getState().setViewCenter({ x: 5, y: 5 })
    })
    expect(onRender.mock.calls.length).toBe(settled)
  })

  it('still follows the status message', () => {
    const view = render(<StatusBar />)
    act(() => useUiStore.setState({ statusText: 'Graph JSON exported', statusLevel: 'success' }))
    expect(view.getByRole('status').textContent).toBe('Graph JSON exported')
  })
})
