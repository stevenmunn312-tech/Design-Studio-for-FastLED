import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import TemplatesPopup from '../TemplatesPopup'
import { useUiStore } from '../../../state/uiStore'
import { useGraphStore } from '../../../state/graphStore'

describe('TemplatesPopup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useUiStore.setState({
      templatesOpen: true,
      lastStartChoice: 'audio-spectrum',
    })
    useGraphStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useGraphStore.temporal.getState().clear()
  })

  it('shows the blank-canvas card, starter cards, and remembered last start', () => {
    const { getByText } = render(<TemplatesPopup />)

    expect(getByText('Blank Canvas')).toBeTruthy()
    expect(getByText('Audio Spectrum')).toBeTruthy()
    expect(getByText('Last start: Audio Spectrum')).toBeTruthy()
  })

  it('can start from a blank canvas and remember that choice', async () => {
    useGraphStore.setState({
      nodes: [{
        id: 'scratch',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: { label: 'Noise', nodeType: 'Noise', category: 'pattern', properties: {}, inputs: [], outputs: [] },
      }] as never[],
      edges: [],
      selectedNodeId: null,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useUiStore.setState({
      requestConfirm: vi.fn().mockResolvedValue(true),
    })

    const { getByRole } = render(<TemplatesPopup />)
    fireEvent.click(getByRole('button', { name: /Blank Canvas/i }))

    await waitFor(() => {
      expect(useGraphStore.getState().nodes).toEqual([])
    })
    expect(useUiStore.getState().lastStartChoice).toBe('blank')
    expect(useUiStore.getState().templatesOpen).toBe(false)
  })
})
