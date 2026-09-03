import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import DisplayEditor from '../DisplayEditor'
import { createDisplayDocument } from '../../../state/displayEditor'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'

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

  it('returns to the graph through the breadcrumb', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Graph' }))
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
  })
})
