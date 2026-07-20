import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary } from '../../../state/patternLibrary'
import { useUiStore } from '../../../state/uiStore'
import { useAudioStore } from '../../../state/audioStore'

const realStartAudio = useAudioStore.getState().startAudio
const startAudio = vi.fn(async () => {})

describe('Sidebar equipment rack', () => {
  beforeEach(() => {
    localStorage.setItem('design-studio-for-fastled-sidebar-expanded-v2', JSON.stringify('audio'))
    localStorage.setItem('design-studio-for-fastled-sidebar-view', JSON.stringify('beginner'))
    localStorage.removeItem('design-studio-for-fastled-sidebar-favourites')
    localStorage.removeItem('design-studio-for-fastled-sidebar-recent')
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    usePatternLibrary.setState({ patterns: [] })
    useUiStore.setState({ viewCenter: { x: 200, y: 180 }, draggingNodeType: null, testSignal: false })
    startAudio.mockClear()
    useAudioStore.setState({ startAudio })
  })

  afterEach(() => useAudioStore.setState({ startAudio: realStartAudio }))

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

  it('defaults to the full node library when no scope preference is saved', () => {
    localStorage.removeItem('design-studio-for-fastled-sidebar-view')
    const { getByRole } = render(<Sidebar />)

    expect(getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true')
    expect(getByRole('tab', { name: 'Beginner' }).getAttribute('aria-selected')).toBe('false')
  })

  it('can favourite a module and keep it in the favourites rack', () => {
    const { getByRole, getByLabelText, getByText } = render(<Sidebar />)

    fireEvent.click(getByRole('button', { name: /^Audio\d/ }))
    fireEvent.click(getByLabelText('Add FFT Analyzer to favourites'))
    fireEvent.click(getByText('Favourites'))

    expect(getByLabelText('Add FFT Analyzer')).toBeTruthy()
  })

  it.each([
    ['Live spectrum', ['MicInput', 'SpectrumVisualizer', 'Trails', 'MatrixOutput', 'Comment'], 3],
    ['Beat colour jump', ['MicInput', 'BeatDetect', 'Random', 'SampleHold', 'PaletteSampler', 'SolidColor', 'MatrixOutput', 'Comment'], 6],
    ['Percussion trails', ['MicInput', 'PercussionDetect', 'KickShock', 'Trails', 'MatrixOutput', 'Comment'], 6],
  ])('drops the %s real-audio recipe onto the canvas', (title, expectedTypes, expectedEdges) => {
    useUiStore.setState({ testSignal: true })
    const { getByText } = render(<Sidebar />)

    // The graph is empty, so "Quick recipes" is already open by default
    // (see the "open Quick recipes when the graph is empty" behavior) —
    // clicking its header here would only toggle it closed.
    fireEvent.click(getByText(title))

    expect(useGraphStore.getState().nodes.map((node) => node.data.nodeType)).toEqual(
      expect.arrayContaining(expectedTypes)
    )
    expect(useGraphStore.getState().edges).toHaveLength(expectedEdges)
    expect(useUiStore.getState().testSignal).toBe(false)
    expect(localStorage.getItem('design-studio-for-fastled-test-signal')).toBe('false')
    expect(String(useGraphStore.getState().nodes.find((node) => node.data.nodeType === 'Comment')?.data.properties.text)).toContain('\n')
    expect(startAudio).toHaveBeenCalledOnce()
  })
})
