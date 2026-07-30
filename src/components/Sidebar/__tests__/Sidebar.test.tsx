import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../../state/patternLibrary'
import { patternRatingKey, usePatternRatingStore } from '../../../state/patternRating'
import { useUiStore } from '../../../state/uiStore'
import { useAudioStore } from '../../../state/audioStore'

const realStartAudio = useAudioStore.getState().startAudio
const startAudio = vi.fn(async () => {})

function savedPattern(id: string, name: string): SavedPattern {
  return {
    id,
    name,
    createdAt: 1,
    inputs: [],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    subgraph: { nodes: [], edges: [] },
  }
}

describe('Sidebar equipment rack', () => {
  beforeEach(() => {
    localStorage.setItem('design-studio-for-fastled-sidebar-expanded-v2', JSON.stringify('audio'))
    localStorage.setItem('design-studio-for-fastled-sidebar-view', JSON.stringify('beginner'))
    localStorage.removeItem('design-studio-for-fastled-sidebar-favourites')
    localStorage.removeItem('design-studio-for-fastled-sidebar-recent')
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    usePatternLibrary.setState({ patterns: [] })
    usePatternRatingStore.setState({ ratingsByKey: {} })
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

  it('shows a completed rating in place of the bundled label', () => {
    const pattern = { ...savedPattern('pat-1', 'Aurora'), bundled: true }
    usePatternLibrary.setState({ patterns: [pattern] })
    usePatternRatingStore.setState({
      ratingsByKey: {
        [patternRatingKey(pattern)]: {
          patternId: pattern.id,
          name: pattern.name,
          bundled: true,
          overall: 88,
          criteria: [],
          audioReactive: false,
        },
      },
    })
    localStorage.setItem('design-studio-for-fastled-sidebar-expanded-v2', JSON.stringify('library'))
    useGraphStore.setState({
      nodes: [{
        id: 'keep-library-open',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: { label: 'Comment', nodeType: 'Comment', category: 'note', properties: {}, inputs: [], outputs: [] },
      }],
    })

    const view = render(<Sidebar />)
    fireEvent.click(view.getByRole('button', { name: /New & Unsorted/ }))

    expect(view.getByText('88%')).toBeTruthy()
    expect(view.queryByText('included')).toBeNull()
  })

  it('uses click/shift-click selection and adds the selection to an existing collection', () => {
    const aurora = savedPattern('pat-1', 'Aurora')
    const comet = savedPattern('pat-2', 'Comet')
    usePatternLibrary.setState({ patterns: [aurora, comet] })
    localStorage.setItem('design-studio-for-fastled-sidebar-expanded-v2', JSON.stringify('library'))
    useGraphStore.setState({
      nodes: [{
        id: 'collection',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Pattern Collection',
          nodeType: 'PatternCollection',
          category: 'show',
          properties: { patternIds: [], patternSections: {} },
          inputs: [],
          outputs: [],
        },
      }],
      graphs: { root: { id: 'root', name: 'Main' } },
      graphData: {},
      activeGraphId: 'root',
    })

    const view = render(<Sidebar />)
    fireEvent.click(view.getByRole('button', { name: /New & Unsorted/ }))
    const auroraRow = view.getByRole('option', { name: 'Aurora' })
    const cometRow = view.getByRole('option', { name: 'Comet' })

    fireEvent.click(auroraRow)
    fireEvent.click(cometRow, { shiftKey: true })
    expect(auroraRow.getAttribute('aria-selected')).toBe('true')
    expect(cometRow.getAttribute('aria-selected')).toBe('true')
    expect(useGraphStore.getState().nodes).toHaveLength(1)

    fireEvent.contextMenu(cometRow)
    fireEvent.click(view.getByRole('menuitem', { name: 'Pattern Collection 1' }))

    const collection = useGraphStore.getState().nodes.find((node) => node.id === 'collection')
    const patternIds = (collection?.data.properties as { patternIds?: string[] }).patternIds ?? []
    expect(patternIds).toHaveLength(2)
    expect(patternIds.map((id) => useGraphStore.getState().graphs[id]?.sourcePatternId)).toEqual(['pat-1', 'pat-2'])
  })
})

describe('Sidebar remembered section', () => {
  const KEY = 'design-studio-for-fastled-sidebar-expanded-v2'

  beforeEach(() => {
    localStorage.clear()
    usePatternLibrary.setState({ patterns: [] })
    useUiStore.setState({ viewCenter: { x: 0, y: 0 }, draggingNodeType: null, testSignal: false })
  })

  it('still steers an empty graph to Quick recipes', () => {
    localStorage.setItem(KEY, JSON.stringify('audio'))
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })

    const { getByRole } = render(<Sidebar />)

    expect(getByRole('button', { name: /Quick recipes/i }).getAttribute('aria-expanded')).toBe('true')
  })

  it('does not let that steer overwrite the section the user chose', () => {
    // The user picked Audio, then emptied the canvas. The steer opens Quick
    // recipes for this session, but the remembered preference must survive so
    // the next load still comes back to Audio.
    localStorage.setItem(KEY, JSON.stringify('audio'))
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })

    render(<Sidebar />)

    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toBe('audio')
  })

  it('persists a section the user opens by clicking its header', () => {
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    const { getByRole } = render(<Sidebar />)

    fireEvent.click(getByRole('button', { name: /Audio/i }))

    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toBe('audio')
  })
})
