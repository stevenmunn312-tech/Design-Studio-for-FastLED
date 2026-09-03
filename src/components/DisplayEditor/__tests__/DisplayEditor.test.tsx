import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import DisplayEditor from '../DisplayEditor'
import { createDisplayDocument } from '../../../state/displayEditor'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import type { StudioNode } from '../../../state/graphStore'

describe('DisplayEditor', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.getState().setDisplayDocument(createDisplayDocument('panel', 320, 240))
    useGraphStore.temporal.getState().clear()
    useUiStore.setState({
      workspaceMode: 'design',
      designWorkspaceView: { kind: 'display', displayId: 'panel' },
      fitViewRequest: { nonce: 0 },
    })
  })

  it('opens the separate display surface and adds a registry-backed widget', () => {
    const view = render(<DisplayEditor />)

    expect(view.getByRole('region', { name: 'Display editor for panel' })).toBeTruthy()
    expect(view.getByText('320 × 240')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))

    expect(useGraphStore.getState().displayDocuments.panel.widgets[0]).toMatchObject({
      id: 'button',
      type: 'Button',
      properties: { text: 'Button' },
    })
    expect(view.getByRole('button', { name: /Button, Button\. Position/ })).toBeTruthy()
    expect(view.getByText('output · bool')).toBeTruthy()
  })

  it('nudges the selected widget on the document grid without touching graph nodes', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    const widget = view.getByRole('button', { name: /Button, Button\. Position/ })
    fireEvent.keyDown(widget, { key: 'ArrowRight' })
    fireEvent.keyDown(widget, { key: 'ArrowDown', shiftKey: true })

    expect(useGraphStore.getState().displayDocuments.panel.widgets[0].bounds).toMatchObject({ x: 8, y: 1 })
  })

  it('multi-selects, aligns, copies, pastes, and deletes widgets as a group', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Add Text widget' }))
    fireEvent.click(view.getByRole('button', { name: /Button, Button\. Position/ }), { ctrlKey: true })

    expect(view.getByRole('heading', { name: '2 widgets' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Left' }))
    expect(useGraphStore.getState().displayDocuments.panel.widgets.map((widget) => widget.bounds.x)).toEqual([0, 0])

    fireEvent.click(view.getByRole('button', { name: 'Copy' }))
    fireEvent.click(view.getByRole('button', { name: 'Paste' }))
    expect(useGraphStore.getState().displayDocuments.panel.widgets.map((widget) => widget.id)).toEqual([
      'button', 'text', 'button-2', 'text-2',
    ])

    fireEvent.click(view.getByRole('button', { name: 'Delete widgets' }))
    expect(useGraphStore.getState().displayDocuments.panel.widgets.map((widget) => widget.id)).toEqual(['button', 'text'])
  })

  it('announces validation changes and associates each issue with its widgets', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Add Text widget' }))
    fireEvent.click(view.getByRole('button', { name: /Button, Button\. Position/ }), { ctrlKey: true })
    fireEvent.click(view.getByRole('button', { name: 'Left' }))

    const validation = view.getByRole('status', { name: 'Display validation status' })
    expect(validation.textContent).toContain('1 layout issue. Button overlaps Text.')
    const button = view.getByRole('button', { name: /Button, Button\. Position/ })
    const text = view.getByRole('button', { name: /Text, Text\. Position/ })
    expect(button.getAttribute('aria-invalid')).toBe('true')
    expect(text.getAttribute('aria-invalid')).toBe('true')
    expect(button.getAttribute('aria-describedby')).toBe('display-widget-issues-button')
    expect(view.getByText('Button overlaps Text.', { selector: '#display-widget-issues-button' })).toBeTruthy()
    fireEvent.click(button)
    expect(view.getByRole('status', { name: 'Display editor announcements' }).textContent).toContain(
      '1 validation issue: Button overlaps Text.',
    )
  })

  it('confirms before deleting a wired widget and disconnects it atomically', async () => {
    const screen = {
      id: 'screen', type: 'studioNode', position: { x: 0, y: 0 },
      data: {
        label: 'Custom Display', nodeType: 'Display', category: 'output',
        properties: { displayId: 'panel' }, inputs: [], outputs: [],
      },
    } as unknown as StudioNode
    useGraphStore.setState({ nodes: [screen] })
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    useUiStore.setState({ requestConfirm: confirm })
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    useGraphStore.setState({
      edges: [{
        id: 'wired', source: 'screen', sourceHandle: 'widget:button:out',
        target: 'sink', targetHandle: 'x',
      }],
    })
    fireEvent.click(view.getByRole('button', { name: 'Delete widget' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expect(useGraphStore.getState().displayDocuments.panel.widgets).toHaveLength(1)
    expect(useGraphStore.getState().edges).toHaveLength(1)

    fireEvent.click(view.getByRole('button', { name: 'Delete widget' }))
    await waitFor(() => expect(useGraphStore.getState().displayDocuments.panel.widgets).toHaveLength(0))
    expect(useGraphStore.getState().edges).toEqual([])
  })

  it('returns to the graph through the breadcrumb', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Graph' }))
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
  })

  it('keeps design editing separate from the interactive run preview', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Add Toggle widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Add Slider widget' }))
    const before = structuredClone(useGraphStore.getState().displayDocuments.panel)

    fireEvent.click(view.getByRole('button', { name: 'Run' }))

    expect(view.queryByRole('complementary', { name: 'Widget palette' })).toBeNull()
    expect(view.queryByRole('complementary', { name: 'Widget inspector' })).toBeNull()
    const button = view.getByRole('button', { name: 'Button run preview' })
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.pointerUp(button, { button: 0, pointerId: 1 })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    const toggle = view.getByRole('switch', { name: 'Toggle run preview' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    const slider = view.getByRole('slider', { name: 'Slider run preview' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider.getAttribute('aria-valuenow')).toBe('0.01')
    expect(useGraphStore.getState().displayDocuments.panel).toEqual(before)

    fireEvent.click(view.getByRole('button', { name: 'Design' }))
    expect(view.getByRole('complementary', { name: 'Widget palette' })).toBeTruthy()
    expect(view.getByRole('button', { name: /Button, Button\. Position/ })).toBeTruthy()
  })
})
