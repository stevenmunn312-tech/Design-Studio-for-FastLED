import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Profiler } from 'react'
import { act, render } from '@testing-library/react'
import MenuBar from '../MenuBar'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'

// The menu bar reads undo, redo and the two history stacks. Subscribing to the
// whole temporal store re-rendered it when history tracking paused and
// resumed, which every drag and slider sweep does.
describe('MenuBar subscriptions', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.temporal.getState().clear()
    useUiStore.setState({ stageMode: false, performanceMode: false })
  })

  it('does not re-render when history tracking pauses and resumes', () => {
    const onRender = vi.fn()
    render(
      <Profiler id="menubar" onRender={onRender}>
        <MenuBar />
      </Profiler>,
    )
    const settled = onRender.mock.calls.length
    act(() => {
      useGraphStore.temporal.getState().pause()
      useGraphStore.temporal.getState().resume()
    })
    expect(onRender.mock.calls.length).toBe(settled)
  })
})
