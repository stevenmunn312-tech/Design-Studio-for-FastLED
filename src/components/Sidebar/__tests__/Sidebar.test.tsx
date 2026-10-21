import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../../state/patterns/patternLibrary'
import { usePatternRatingStore } from '../../../state/patterns/patternRating'
import { useUiStore } from '../../../state/uiStore'
import { useAudioStore } from '../../../state/audio/audioStore'
import { openCommunityTab, postToCommunityTab } from '../../../utils/communityUpload'
import { captureSharePreview } from '../../../utils/sharePreviewCapture'
import { buildLibraryBundle, buildLibraryLink, bundledPatternFromLibrary } from '../../../state/library/libraryBundle'
import { clearPatternContentTrustForTests } from '../../../state/patterns/patternTrust'

vi.mock('../../../utils/communityUpload', () => ({
  openCommunityTab: vi.fn().mockReturnValue({ target: 'design-studio-community-test', opened: true }),
  postToCommunityTab: vi.fn().mockResolvedValue(undefined),
  suggestPatternFileName: (name: string) => `${name}.fastled-pattern.json`,
}))

vi.mock('../../../utils/sharePreviewCapture', () => ({
  captureSharePreview: vi.fn().mockResolvedValue(null),
}))

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
    usePatternRatingStore.setState({ ratingsByPatternId: {}, userRatingsByPatternId: {}, intentOverridesByPatternId: {} })
    useUiStore.setState({
      viewCenter: { x: 200, y: 180 },
      draggingNodeType: null,
      testSignal: false,
      hardwareShelfTarget: null,
    })
    startAudio.mockClear()
    useAudioStore.setState({ startAudio })
  })

  afterEach(() => useAudioStore.setState({ startAudio: realStartAudio }))

  it('labels modules with their primary output type', () => {
    const { getByRole, getByLabelText } = render(<Sidebar />)
    // The graph is empty in this test, which collapses every section (see the
    // "blank canvas collapses the rack" behavior) — open Audio explicitly
    // rather than relying on it already being expanded.
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

  it('answers a search for a hardware-owned module instead of finding nothing', () => {
    // A Button added from the bench puts a Button node in the graph, so people
    // search this library for it afterwards. It is hidden here because it
    // cannot be dropped on the canvas — but "nothing found" is the wrong
    // answer to a question that has one.
    const { getByPlaceholderText, getByText } = render(<Sidebar />)
    fireEvent.change(getByPlaceholderText('Search nodes…'), { target: { value: 'button' } })

    expect(getByText('On the Hardware tab')).toBeTruthy()
    // Both Button and Button Bank live on the bench; take the first.
    const shelf = getByText('On the Hardware tab').parentElement!
    fireEvent.click(shelf.querySelectorAll('button')[0])
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
    expect(useUiStore.getState().sidebarOpen).toBe(true)
    expect(useUiStore.getState().hardwareShelfTarget).toBe('ButtonInput')
  })

  it('keeps only one category open at a time', () => {
    const { getByRole, getByLabelText, queryByLabelText } = render(<Sidebar />)

    fireEvent.click(getByRole('button', { name: /Signals/i }))

    expect(queryByLabelText('Add FFT Analyzer')).toBeNull()
    expect(getByLabelText('Add Wave')).toBeTruthy()
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
    const { getByRole, getByText } = render(<Sidebar />)

    // The graph is empty, so the whole rack starts collapsed — open Quick
    // recipes before clicking the card inside it.
    fireEvent.click(getByRole('button', { name: /Quick recipes/i }))
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
      ratingsByPatternId: {
        [pattern.id]: {
          patternId: pattern.id,
          name: pattern.name,
          bundled: true,
          overall: 88,
          intent: 'ambient',
          inferredIntent: 'ambient',
          verdict: 'strong',
          verdictLabel: 'Strong',
          summary: 'Strong for Ambient.',
          strengths: [],
          improvements: [],
          criteria: [],
          audioReactive: false,
          cacheKey: 'test',
        },
      },
      userRatingsByPatternId: { [pattern.id]: 5 },
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

    expect(view.getByText('88')).toBeTruthy()
    expect(view.getByText('★5')).toBeTruthy()
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

  it('collapses every section — Quick recipes included — on an empty graph', () => {
    localStorage.setItem(KEY, JSON.stringify('audio'))
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })

    const { getAllByRole } = render(<Sidebar />)

    const headers = getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded'))
    expect(headers.length).toBeGreaterThan(1)
    expect(headers.map((header) => header.getAttribute('aria-expanded'))).not.toContain('true')
  })

  it('does not let that reset overwrite the section the user chose', () => {
    // The user picked Audio, then emptied the canvas. The rack collapses for
    // this session, but the remembered preference must survive so the next
    // load still comes back to Audio.
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

describe('Sidebar community share', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    usePatternRatingStore.setState({ ratingsByPatternId: {}, userRatingsByPatternId: {}, intentOverridesByPatternId: {} })
    useUiStore.setState({ viewCenter: { x: 0, y: 0 }, draggingNodeType: null, testSignal: false })
    vi.mocked(openCommunityTab).mockClear()
    vi.mocked(postToCommunityTab).mockClear()
    vi.mocked(captureSharePreview).mockClear()
  })

  it('shares a saved pattern as a hardware-agnostic subgraph after confirming', async () => {
    const pattern: SavedPattern = {
      id: 'pat-1',
      name: 'Aurora Ribbon',
      createdAt: 1,
      inputs: [],
      outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [{ id: 'n1', data: { nodeType: 'Animartrix' } }] as never[], edges: [] },
    }
    usePatternLibrary.setState({ patterns: [pattern], categories: [] })
    useUiStore.setState({ requestConfirm: vi.fn().mockResolvedValue(true) })

    const { getByRole, getByLabelText } = render(<Sidebar />)
    fireEvent.click(getByRole('button', { name: /^Pattern Library/ }))
    fireEvent.click(getByRole('button', { name: /New & Unsorted/ }))
    fireEvent.click(getByLabelText('Share Aurora Ribbon on the community site'))

    await waitFor(() => expect(postToCommunityTab).toHaveBeenCalledTimes(1))
    const call = vi.mocked(postToCommunityTab).mock.calls[0][1]
    expect(call.name).toBe('Aurora Ribbon')

    const shared = JSON.parse(call.patternJson) as { name: string; subgraph: { nodes: unknown[]; edges: unknown[] } }
    expect(shared.name).toBe('Aurora Ribbon')
    expect(shared.subgraph.nodes).toEqual(pattern.subgraph.nodes)
  })

  it('does not share when the confirm popup is cancelled', async () => {
    const pattern: SavedPattern = {
      id: 'pat-1',
      name: 'Aurora Ribbon',
      createdAt: 1,
      inputs: [],
      outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
      subgraph: { nodes: [], edges: [] },
    }
    usePatternLibrary.setState({ patterns: [pattern], categories: [] })
    useUiStore.setState({ requestConfirm: vi.fn().mockResolvedValue(false) })

    const { getByRole, getByLabelText } = render(<Sidebar />)
    fireEvent.click(getByRole('button', { name: /^Pattern Library/ }))
    fireEvent.click(getByRole('button', { name: /New & Unsorted/ }))
    fireEvent.click(getByLabelText('Share Aurora Ribbon on the community site'))

    await waitFor(() => expect(useUiStore.getState().requestConfirm).toHaveBeenCalled())
    expect(postToCommunityTab).not.toHaveBeenCalled()
  })
})

describe('Sidebar library sharing', () => {
  const clicks: string[] = []
  let anchorClick: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    clearPatternContentTrustForTests()
    clicks.length = 0
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null, graphs: { root: { id: 'root', name: 'Main' } }, graphData: {}, activeGraphId: 'root', trusted: true })
    usePatternLibrary.setState({ patterns: [], categories: [] })
    usePatternRatingStore.setState({ ratingsByPatternId: {}, userRatingsByPatternId: {}, intentOverridesByPatternId: {} })
    useUiStore.setState({ viewCenter: { x: 0, y: 0 }, draggingNodeType: null, testSignal: false })
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download)
    })
  })

  afterEach(() => anchorClick.mockRestore())

  const openLibrary = (view: ReturnType<typeof render>) => {
    fireEvent.click(view.getByRole('button', { name: /^Pattern Library/ }))
  }

  it('imports a dropped bare pattern file and a library bundle, marking them Imported', async () => {
    const view = render(<Sidebar />)
    openLibrary(view)
    const dropZone = view.getByText('Drag pattern .json files here to import').closest('div[class]')!.parentElement!
    const bare = new File([JSON.stringify(savedPattern('pat-bare', 'Bare Glow'))], 'glow.json', { type: 'application/json' })
    const bundle = new File([JSON.stringify(buildLibraryBundle({
      patterns: [bundledPatternFromLibrary(savedPattern('pat-bundle', 'Bundled Comet'), {})],
      palettes: [{ name: 'Dusk', stops: [{ position: 0, color: '#000000' }, { position: 1, color: '#ffffff' }] }],
    }))], 'set.fastled-library.json', { type: 'application/json' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [bare, bundle], types: ['Files'] } })

    await waitFor(() => expect(usePatternLibrary.getState().patterns.map((p) => p.name)).toEqual(['Bare Glow', 'Bundled Comet']))
    expect(usePatternLibrary.getState().patterns.every((p) => p.origin === 'imported')).toBe(true)
    expect(useGraphStore.getState().nodes.find((n) => n.data.nodeType === 'CustomPalette')?.data.label).toBe('Dusk')
    expect(useUiStore.getState().statusText).toBe('Imported 2 patterns, 1 palette')

    fireEvent.click(view.getByRole('button', { name: /New & Unsorted/ }))
    expect(view.getAllByText('Imported')).toHaveLength(2)
  })

  it('exports the selected pattern as a one-pattern bundle file from the context menu', () => {
    usePatternLibrary.setState({ patterns: [savedPattern('pat-1', 'Aurora Ribbon')] })
    const view = render(<Sidebar />)
    openLibrary(view)
    fireEvent.click(view.getByRole('button', { name: /New & Unsorted/ }))
    fireEvent.contextMenu(view.getByRole('option', { name: 'Aurora Ribbon' }))
    fireEvent.click(view.getByRole('menuitem', { name: 'Export pattern file…' }))

    expect(clicks).toEqual(['Aurora Ribbon.fastled-pattern.json'])
    expect(useUiStore.getState().statusText).toBe('Exported “Aurora Ribbon”')
  })

  it('copies a share link for the selection and imports a pasted one through Import…', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { written.push(text) } },
    })
    usePatternLibrary.setState({ patterns: [savedPattern('pat-1', 'Aurora Ribbon')] })
    const view = render(<Sidebar />)
    openLibrary(view)
    fireEvent.click(view.getByRole('button', { name: /New & Unsorted/ }))
    fireEvent.contextMenu(view.getByRole('option', { name: 'Aurora Ribbon' }))
    fireEvent.click(view.getByRole('menuitem', { name: 'Copy share link' }))
    await waitFor(() => expect(written).toHaveLength(1))
    expect(written[0]).toContain('#library=')
    expect(useUiStore.getState().statusText).toBe('Pattern link copied to clipboard')

    // A link for a different pattern, pasted into the library's Import popup.
    const link = buildLibraryLink(buildLibraryBundle({
      patterns: [bundledPatternFromLibrary(savedPattern('pat-2', 'Pasted Pulse'), {})],
    }))
    fireEvent.click(view.getByRole('button', { name: 'Import patterns, palettes or collections' }))
    fireEvent.change(view.getByLabelText('Paste a share link or library JSON'), { target: { value: link } })
    fireEvent.click(view.getByRole('button', { name: 'Import' }))

    expect(usePatternLibrary.getState().patterns.map((p) => [p.name, p.origin])).toEqual([
      ['Aurora Ribbon', undefined],
      ['Pasted Pulse', 'link'],
    ])
    expect(view.queryByLabelText('Paste a share link or library JSON')).toBeNull()
  })

  it('closes the Import popup on Escape and reports unreadable text', () => {
    const view = render(<Sidebar />)
    openLibrary(view)
    fireEvent.click(view.getByRole('button', { name: 'Import patterns, palettes or collections' }))
    const box = view.getByLabelText('Paste a share link or library JSON')
    fireEvent.change(box, { target: { value: 'nonsense' } })
    fireEvent.click(view.getByRole('button', { name: 'Import' }))
    expect(useUiStore.getState().statusText).toBe('Not valid JSON')
    expect(usePatternLibrary.getState().patterns).toHaveLength(0)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.queryByLabelText('Paste a share link or library JSON')).toBeNull()
  })
})
