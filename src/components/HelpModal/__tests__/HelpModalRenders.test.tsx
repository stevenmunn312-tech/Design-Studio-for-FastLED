import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Profiler } from 'react'
import { act, render } from '@testing-library/react'
import HelpModal from '../HelpModal'
import { useUiStore } from '../../../state/uiStore'
import { useGraphStore } from '../../../state/graphStore'

// The Help dialog reads three fields of the UI store. Subscribing to the whole
// store re-rendered every reference page on each FPS sample and view move
// while the dialog was open.
describe('HelpModal subscriptions', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useUiStore.setState({
      helpOpen: true,
      helpTab: 'quickstart',
      helpNodeReference: { search: '', expandedCategory: 'input', selectedType: '' },
      testSignal: false,
      fps: 0,
      memoryMb: null,
    })
  })

  it('does not re-render on FPS, memory or view-centre updates', () => {
    const onRender = vi.fn()
    render(
      <Profiler id="help" onRender={onRender}>
        <HelpModal />
      </Profiler>,
    )
    const settled = onRender.mock.calls.length
    act(() => {
      useUiStore.getState().setFps(42)
      useUiStore.getState().setMemoryMb(128)
      useUiStore.getState().setViewCenter({ x: 10, y: 20 })
    })
    expect(onRender.mock.calls.length).toBe(settled)
  })

  it('still follows the selected tab', () => {
    const onRender = vi.fn()
    const view = render(
      <Profiler id="help" onRender={onRender}>
        <HelpModal />
      </Profiler>,
    )
    act(() => useUiStore.getState().setHelpTab('upload'))
    expect(view.getByRole('tab', { name: 'Upload & Export' }).getAttribute('aria-selected')).toBe('true')
  })
})
