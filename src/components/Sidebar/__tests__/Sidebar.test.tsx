import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary } from '../../../state/patternLibrary'
import { useUiStore } from '../../../state/uiStore'

describe('Sidebar equipment rack', () => {
  beforeEach(() => {
    localStorage.setItem('fastled-studio-sidebar-expanded', JSON.stringify('audio'))
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    usePatternLibrary.setState({ patterns: [] })
    useUiStore.setState({ viewCenter: { x: 200, y: 180 }, draggingNodeType: null })
  })

  it('labels modules with their primary output type', () => {
    const { getByLabelText } = render(<Sidebar />)
    const fft = getByLabelText('Add FFT Analyzer')
    expect(fft.querySelector('[data-output-type="float"]')).toBeTruthy()
    expect(fft.textContent).toContain('float')
  })

  it('adds clicked modules to the graph without rendering a recent rack', () => {
    const { getByLabelText, queryByText } = render(<Sidebar />)
    fireEvent.click(getByLabelText('Add FFT Analyzer'))

    expect(queryByText('Recent rack')).toBeNull()
    expect(useGraphStore.getState().nodes[0].data.nodeType).toBe('FFTAnalyzer')
  })

  it('keeps only one category open at a time', () => {
    const { getByRole, getByLabelText, queryByLabelText } = render(<Sidebar />)

    fireEvent.click(getByRole('button', { name: /Math & Logic/i }))

    expect(queryByLabelText('Add FFT Analyzer')).toBeNull()
    expect(getByLabelText('Add Math')).toBeTruthy()
  })
})
