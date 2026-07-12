import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary } from '../../../state/patternLibrary'
import { useUiStore } from '../../../state/uiStore'

describe('Sidebar equipment rack', () => {
  beforeEach(() => {
    localStorage.setItem('fastled-studio-sidebar-expanded-v2', JSON.stringify('audio'))
    localStorage.setItem('fastled-studio-sidebar-view', JSON.stringify('beginner'))
    localStorage.removeItem('fastled-studio-sidebar-favourites')
    localStorage.removeItem('fastled-studio-sidebar-recent')
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    usePatternLibrary.setState({ patterns: [] })
    useUiStore.setState({ viewCenter: { x: 200, y: 180 }, draggingNodeType: null })
  })

  it('labels modules with their primary output type', () => {
    const { getByRole, getByLabelText } = render(<Sidebar />)
    // The graph is empty in this test, which now steers the sidebar to open
    // "Quick recipes" by default (see the "open Quick recipes when the graph
    // is empty" behavior) — open Audio explicitly rather than relying on it
    // already being expanded.
    fireEvent.click(getByRole('button', { name: /^Audio\d/ }))
    const fft = getByLabelText('Add FFT Analyzer')
    expect(fft.querySelector('[data-output-type="float"]')).toBeTruthy()
    expect(fft.textContent).toContain('float')
  })

  it('adds clicked modules to the graph and surfaces them in the recent rack', () => {
    const { getByRole, getByLabelText, getByText } = render(<Sidebar />)
    fireEvent.click(getByRole('button', { name: /^Audio\d/ }))
    fireEvent.click(getByLabelText('Add FFT Analyzer'))

    expect(getByText('Recent rack')).toBeTruthy()
    expect(useGraphStore.getState().nodes[0].data.nodeType).toBe('FFTAnalyzer')
  })

  it('keeps only one category open at a time', () => {
    const { getByRole, getByLabelText, queryByLabelText } = render(<Sidebar />)

    fireEvent.click(getByRole('button', { name: /Signals/i }))

    expect(queryByLabelText('Add FFT Analyzer')).toBeNull()
    expect(getByLabelText('Add Counter')).toBeTruthy()
  })

  it('supports beginner vs all views', () => {
    const { getByRole, getByPlaceholderText, queryByLabelText, getByLabelText } = render(<Sidebar />)

    fireEvent.change(getByPlaceholderText('Search nodes…'), { target: { value: 'midi' } })

    expect(queryByLabelText('Add MIDI')).toBeNull()

    fireEvent.click(getByRole('tab', { name: 'All' }))

    expect(getByLabelText('Add MIDI')).toBeTruthy()
  })

  it('can favourite a module and keep it in the favourites rack', () => {
    const { getByRole, getByLabelText, getByText } = render(<Sidebar />)

    fireEvent.click(getByRole('button', { name: /^Audio\d/ }))
    fireEvent.click(getByLabelText('Add FFT Analyzer to favourites'))
    fireEvent.click(getByText('Favourites'))

    expect(getByLabelText('Add FFT Analyzer')).toBeTruthy()
  })

  it('drops a curated recipe onto the canvas', () => {
    const { getByText } = render(<Sidebar />)

    // The graph is empty, so "Quick recipes" is already open by default
    // (see the "open Quick recipes when the graph is empty" behavior) —
    // clicking its header here would only toggle it closed.
    fireEvent.click(getByText('Add trails'))

    expect(useGraphStore.getState().nodes.map((node) => node.data.nodeType)).toEqual(
      expect.arrayContaining(['BeatSin', 'Circle', 'Trails', 'MatrixOutput'])
    )
    expect(useGraphStore.getState().edges).toHaveLength(4)
  })
})
