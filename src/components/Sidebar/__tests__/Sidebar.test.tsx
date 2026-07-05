import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary } from '../../../state/patternLibrary'
import { useUiStore } from '../../../state/uiStore'

describe('Sidebar equipment rack', () => {
  beforeEach(() => {
    localStorage.removeItem('fastled-studio-recent-nodes')
    localStorage.removeItem('fastled-studio-sidebar-expanded')
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

  it('adds clicked modules to a persistent recent rack', () => {
    const { getByLabelText, getByText } = render(<Sidebar />)
    fireEvent.click(getByLabelText('Add FFT Analyzer'))

    expect(getByText('Recent rack')).toBeTruthy()
    expect(getByLabelText('Add FFT Analyzer from recent rack')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('fastled-studio-recent-nodes') ?? '[]')).toEqual(['FFTAnalyzer'])
    expect(useGraphStore.getState().nodes[0].data.nodeType).toBe('FFTAnalyzer')
  })
})
