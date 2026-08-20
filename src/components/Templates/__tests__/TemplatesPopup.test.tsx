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

  // Every starter ends at the same node, and every one of them happens to use
  // the matrix form — so drawing its own title made the gallery read as eight
  // matrix patches rather than eight patches that all end at the LED output.
  it('names the output generically in the graph maps', () => {
    // A two-word label is drawn as two <tspan> lines, whose textContent would
    // otherwise run together as "LEDOutput".
    const { container } = render(<TemplatesPopup />)
    const boxLabels = [...container.querySelectorAll('svg text')].map((text) =>
      [...text.querySelectorAll('tspan')].map((line) => line.textContent).join(' '))

    expect(boxLabels).toContain('LED Output')
    expect(boxLabels).not.toContain('LED Matrix')
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
      // A blank canvas still carries the hidden root Board node the hardware
      // view owns; blank means no authored content, not no nodes at all.
      expect(useGraphStore.getState().nodes.filter((node) => node.data.nodeType !== 'Board')).toEqual([])
    })
    expect(useUiStore.getState().lastStartChoice).toBe('blank')
    expect(useUiStore.getState().templatesOpen).toBe(false)
  })
})
