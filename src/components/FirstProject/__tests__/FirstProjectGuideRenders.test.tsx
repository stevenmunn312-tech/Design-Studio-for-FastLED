import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Profiler } from 'react'
import { act, render } from '@testing-library/react'
import FirstProjectGuide from '../FirstProjectGuide'
import { useFirstProjectGuide } from '../../../state/firstProjectGuideStore'
import { ROOT_GRAPH_ID, useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/upload/uploadStore'

const graphs = { activeGraphId: ROOT_GRAPH_ID, graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } } }

// The strip reads a handful of upload-store fields to describe the port. A
// whole-store subscription re-rendered it, steps and validators included, on
// every chunk the compiler wrote to the log.
describe('FirstProjectGuide subscriptions', () => {
  beforeEach(() => {
    localStorage.clear()
    useFirstProjectGuide.setState({ visible: false, listOpen: false, skipped: [], baseline: null, uploaded: false })
    useUiStore.setState({ templatesOpen: false, workspaceMode: 'graph', stageMode: false, sidebarOpen: false })
    useUploadStore.setState({
      helper: null, ports: [], portsScanned: true, selectedPort: '', setupWizardOpen: false,
      status: { phase: 'idle', message: '' }, statusIsProject: true, log: '',
    })
    useGraphStore.getState().loadGraph([], [], graphs)
  })

  it('does not re-render on compile log output', () => {
    act(() => useFirstProjectGuide.getState().start())
    const onRender = vi.fn()
    render(
      <Profiler id="guide" onRender={onRender}>
        <FirstProjectGuide />
      </Profiler>,
    )
    const settled = onRender.mock.calls.length
    act(() => {
      useUploadStore.getState().appendLog('Compiling sketch...\n')
      useUploadStore.getState().appendLog('Linking...\n')
    })
    expect(onRender.mock.calls.length).toBe(settled)
  })

  it('still follows the fields it reads', () => {
    act(() => useFirstProjectGuide.getState().start())
    const view = render(<FirstProjectGuide />)
    act(() => useFirstProjectGuide.getState().setListOpen(true))
    expect(view.getByLabelText('First project steps')).toBeTruthy()
  })
})
