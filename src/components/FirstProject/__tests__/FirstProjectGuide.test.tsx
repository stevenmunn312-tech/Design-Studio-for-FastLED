/*
 * The optional first-project guide: it reads each step off the project, sends
 * you to the tool that already does the job, never replaces work you have,
 * and can be skipped, closed and resumed.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, within } from '@testing-library/react'
import FirstProjectGuide from '../FirstProjectGuide'
import TemplatesPopup from '../../Templates/TemplatesPopup'
import { useFirstProjectGuide } from '../../../state/firstProjectGuideStore'
import { ROOT_GRAPH_ID, rootGraphNodes, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'
import { startTemplateById } from '../../../utils/startFlow'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const graphs = { activeGraphId: ROOT_GRAPH_ID, graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } } }

/** The strip, which holds the current step and its buttons. */
function currentStep(container: HTMLElement) {
  return container.querySelector('[aria-label="First project guide"]') as HTMLElement
}

beforeEach(() => {
  localStorage.clear()
  useFirstProjectGuide.setState({ visible: false, listOpen: false, skipped: [], baseline: null, uploaded: false })
  useUiStore.setState({ templatesOpen: false, workspaceMode: 'graph', stageMode: false, sidebarOpen: false })
  useUploadStore.setState({
    helper: null, ports: [], portsScanned: true, selectedPort: '', setupWizardOpen: false,
    status: { phase: 'idle', message: '' }, statusIsProject: true,
  })
  useGraphStore.getState().loadGraph([], [], graphs)
})

describe('starting the guide', () => {
  it('is not shown until asked for', () => {
    const { container } = render(<FirstProjectGuide />)
    expect(container.textContent).toBe('')
  })

  it('takes a project you already have as the starting point, without replacing it', () => {
    useGraphStore.getState().loadGraph([node('mine', 'Fire2012')], [], graphs)
    const before = rootGraphNodes(useGraphStore.getState()).map((n) => n.id).sort()
    act(() => useFirstProjectGuide.getState().start())
    const { container } = render(<FirstProjectGuide />)
    expect(rootGraphNodes(useGraphStore.getState()).map((n) => n.id).sort()).toEqual(before)
    expect(within(currentStep(container)).getByText('Make it yours')).toBeTruthy()
  })

  it('on an empty project, sends you to the Start Gallery rather than loading anything itself', () => {
    act(() => useFirstProjectGuide.getState().start())
    const { container } = render(<FirstProjectGuide />)
    expect(within(currentStep(container)).getByText('Choose a starter')).toBeTruthy()
    fireEvent.click(within(currentStep(container)).getByRole('button', { name: 'Open starters' }))
    expect(useUiStore.getState().templatesOpen).toBe(true)
    expect(rootGraphNodes(useGraphStore.getState()).every((n) => n.data.nodeType === 'Board')).toBe(true)
  })

  it('is offered from the Start Gallery, and only while it is not already showing', () => {
    useUiStore.setState({ templatesOpen: true })
    const { getByRole, queryByRole } = render(<TemplatesPopup />)
    fireEvent.click(getByRole('button', { name: 'Guide me from here to my board' }))
    expect(useFirstProjectGuide.getState().visible).toBe(true)
    expect(queryByRole('button', { name: 'Guide me from here to my board' })).toBeNull()
  })
})

describe('following the steps', () => {
  it('ticks the starter on loading one, and "Make it yours" on a changed setting', () => {
    act(() => useFirstProjectGuide.getState().start())
    const { container } = render(<FirstProjectGuide />)
    act(() => startTemplateById('juggle'))
    expect(within(currentStep(container)).getByText('Make it yours')).toBeTruthy()

    const juggle = rootGraphNodes(useGraphStore.getState()).find((n) => n.data.nodeType === 'Juggle')!
    act(() => useGraphStore.getState().updateNodeProperty(juggle.id, 'count', 5))
    expect(within(currentStep(container)).queryByText('Make it yours')).toBeNull()
  })

  it('opens the tool each step names, and leaves out a button for the tab you are already on', () => {
    act(() => startTemplateById('juggle'))
    // A board nobody has named yet.
    const board = rootGraphNodes(useGraphStore.getState()).find((n) => n.data.nodeType === 'Board')!
    act(() => useGraphStore.getState().updateNodeProperty(board.id, 'profileId', ''))
    act(() => useFirstProjectGuide.getState().start())
    act(() => useFirstProjectGuide.getState().skip('look'))
    const { container } = render(<FirstProjectGuide />)
    const step = () => currentStep(container)
    expect(within(step()).getByText('Choose your board and LEDs')).toBeTruthy()

    fireEvent.click(within(step()).getByRole('button', { name: 'Open Hardware' }))
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
    expect(within(step()).queryByRole('button', { name: 'Open Hardware' })).toBeNull()

    fireEvent.click(within(step()).getByRole('button', { name: 'LED setup' }))
    expect(useUploadStore.getState().setupWizardOpen).toBe(true)
  })

  it('can skip a step and go back to it', () => {
    act(() => useFirstProjectGuide.getState().start())
    const { container, getByRole } = render(<FirstProjectGuide />)
    fireEvent.click(within(currentStep(container)).getByRole('button', { name: 'Skip for now' }))
    expect(within(currentStep(container)).getByText('Make it yours')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'All steps' }))
    fireEvent.click(getByRole('button', { name: 'Back to it' }))
    expect(within(currentStep(container)).getByText('Choose a starter')).toBeTruthy()
  })

  it('ends with how to connect the board when none is plugged in', () => {
    act(() => startTemplateById('juggle'))
    act(() => useFirstProjectGuide.getState().start())
    for (const id of ['look', 'board', 'ready'] as const) act(() => useFirstProjectGuide.getState().skip(id))
    useUploadStore.setState({ selectedPort: 'COM6', ports: [], portsScanned: true, helper: { ok: true } as never })
    const { container } = render(<FirstProjectGuide />)
    expect(within(currentStep(container)).getByText('Upload')).toBeTruthy()
    expect(currentStep(container).textContent).toContain('COM6 isn’t there right now. Plug the board in with a USB cable')
  })
})

describe('the upload that finishes it', () => {
  it('counts a project upload, never a wiring test flashed in its place', () => {
    act(() => useUploadStore.setState({ status: { phase: 'done', message: 'Done' }, statusIsProject: false }))
    expect(useFirstProjectGuide.getState().uploaded).toBe(false)
    act(() => useUploadStore.setState({ status: { phase: 'working', message: '' }, statusIsProject: true }))
    act(() => useUploadStore.setState({ status: { phase: 'done', message: 'Done' } }))
    expect(useFirstProjectGuide.getState().uploaded).toBe(true)
  })

  it('is forgotten when a new starter begins a new project', () => {
    useFirstProjectGuide.setState({ uploaded: true })
    act(() => startTemplateById('juggle'))
    expect(useFirstProjectGuide.getState().uploaded).toBe(false)
  })
})

describe('closing and resuming', () => {
  it('keeps progress through a close and a reload of its memory', () => {
    act(() => useFirstProjectGuide.getState().start())
    act(() => useFirstProjectGuide.getState().skip('starter'))
    act(() => useFirstProjectGuide.getState().hide())
    const saved = JSON.parse(localStorage.getItem('design-studio-for-fastled-first-project-guide')!)
    expect(saved).toMatchObject({ visible: false, skipped: ['starter'] })
    act(() => useFirstProjectGuide.getState().start())
    expect(useFirstProjectGuide.getState().skipped).toEqual(['starter'])
  })

  it('shows the current step on the strip, and the whole list only when asked', () => {
    act(() => useFirstProjectGuide.getState().start())
    const { getByRole, queryByRole, container } = render(<FirstProjectGuide />)
    expect(currentStep(container).textContent).toMatch(/\d of 5 done/)
    expect(queryByRole('region', { name: 'First project steps' })).toBeNull()
    fireEvent.click(getByRole('button', { name: 'All steps' }))
    const list = getByRole('region', { name: 'First project steps' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Choose a starter'),
      expect.stringContaining('Make it yours'),
      expect.stringContaining('Choose your board and LEDs'),
      expect.stringContaining('Check it’s ready'),
      expect.stringContaining('Upload'),
    ])
  })

  it('reserves only the preview handle when Build Diagram already sits beside the preview', () => {
    act(() => useFirstProjectGuide.getState().start())
    act(() => useUiStore.setState({
      workspaceMode: 'build', previewPanelOpen: true, previewWidth: 380,
    }))
    const { container } = render(<FirstProjectGuide />)
    const dock = currentStep(container).parentElement as HTMLElement
    expect(dock.style.getPropertyValue('--guide-right')).toBe('22px')

    act(() => useUiStore.setState({ workspaceMode: 'graph' }))
    expect(dock.style.getPropertyValue('--guide-right')).toBe('402px')
  })
})
