import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { useEscapeLayer } from '../../../hooks/useEscapeLayer'
import { useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../../state/patterns/patternLibrary'
import { useUiStore } from '../../../state/uiStore'

const pattern: SavedPattern = {
  id: 'pat-1',
  name: 'Aurora Ribbon',
  createdAt: 1,
  inputs: [],
  outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
  subgraph: { nodes: [], edges: [] },
}

// Whatever opened above the sidebar and is still open: a dialog, the Build
// Diagram, a menu. Escape typed into a sidebar field belongs to the field.
function Host({ onEscape }: { onEscape: () => void }) {
  useEscapeLayer(onEscape)
  return <Sidebar />
}

describe('Sidebar text fields answer their own Escape', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('design-studio-for-fastled-sidebar-expanded-v2', JSON.stringify('library'))
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    usePatternLibrary.setState({ patterns: [pattern], categories: [] })
    useUiStore.setState({ viewCenter: { x: 200, y: 180 }, draggingNodeType: null, testSignal: false, hardwareShelfTarget: null })
  })

  it('cancels a pattern rename without closing the layer beneath', () => {
    const onEscape = vi.fn()
    const view = render(<Host onEscape={onEscape} />)
    fireEvent.click(view.getByRole('button', { name: /^Pattern Library/ }))
    fireEvent.click(view.getByRole('button', { name: /New & Unsorted/ }))
    fireEvent.click(view.getByLabelText('Rename Aurora Ribbon'))
    const field = view.getByLabelText('Rename pattern')
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(view.queryByLabelText('Rename pattern')).toBeNull()
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('abandons a new shelf name without closing the layer beneath', () => {
    const onEscape = vi.fn()
    const view = render(<Host onEscape={onEscape} />)
    fireEvent.click(view.getByRole('button', { name: /^Pattern Library/ }))
    fireEvent.click(view.getByLabelText('Add Pattern Library shelf'))
    const field = view.getByLabelText('New shelf name')
    fireEvent.change(field, { target: { value: 'Sunsets' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(view.queryByLabelText('New shelf name')).toBeNull()
    expect(onEscape).not.toHaveBeenCalled()
  })
})
